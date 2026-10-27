import { generateId } from "../utils/id";
import { extractRawComponents } from "../recognition/connectedComponents";
import { fitLine } from "../recognition/lineFit";
import type { ComponentStats } from "../recognition/types";
import type { Region } from "../types/project";
import type { OcrRegionDetectionOptions, TextRegionCandidate } from "./types";

function expandedBoxesOverlap(a: ComponentStats, b: ComponentStats, gapPx: number): boolean {
  const half = gapPx / 2;
  return !(
    a.maxX + half < b.minX - half ||
    b.maxX + half < a.minX - half ||
    a.maxY + half < b.minY - half ||
    b.maxY + half < a.minY - half
  );
}

interface Cluster {
  members: ComponentStats[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  count: number;
}

/** Groups components whose expanded bounding boxes overlap — same
 * union-find approach as `mergeNearbyComponents` (Session 2A.1), but
 * also keeps the member list so callers know how many ink components
 * (e.g. individual digits) fed each text-region candidate. */
function clusterByProximity(components: ComponentStats[], gapPx: number): Cluster[] {
  const parent = components.map((_, i) => i);
  function find(i: number): number {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  }
  function union(i: number, j: number): void {
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) parent[ri] = rj;
  }

  for (let i = 0; i < components.length; i++) {
    for (let j = i + 1; j < components.length; j++) {
      if (expandedBoxesOverlap(components[i], components[j], gapPx)) union(i, j);
    }
  }

  const clustersByRoot = new Map<number, Cluster>();
  for (let i = 0; i < components.length; i++) {
    const root = find(i);
    const c = components[i];
    const existing = clustersByRoot.get(root);
    if (!existing) {
      clustersByRoot.set(root, { members: [c], minX: c.minX, minY: c.minY, maxX: c.maxX, maxY: c.maxY, count: c.count });
    } else {
      existing.members.push(c);
      existing.minX = Math.min(existing.minX, c.minX);
      existing.minY = Math.min(existing.minY, c.minY);
      existing.maxX = Math.max(existing.maxX, c.maxX);
      existing.maxY = Math.max(existing.maxY, c.maxY);
      existing.count += c.count;
    }
  }
  return [...clustersByRoot.values()];
}

function toRegion(cluster: Cluster, width: number, height: number, paddingPx: number): Region {
  const minX = Math.max(0, Math.floor(cluster.minX) - paddingPx);
  const minY = Math.max(0, Math.floor(cluster.minY) - paddingPx);
  const maxX = Math.min(width - 1, Math.ceil(cluster.maxX) + paddingPx);
  const maxY = Math.min(height - 1, Math.ceil(cluster.maxY) + paddingPx);
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX + 1),
    height: Math.max(1, maxY - minY + 1),
  };
}

/**
 * Finds candidate dimension-TEXT regions inside an already-computed
 * dimension color mask (reused from Session 2A's `classifyPixels` — this
 * module never re-classifies pixels itself).
 *
 * Deliberately NOT "every red connected component is a number" (Session
 * 2B spec §5): a component is excluded as a probable LINE (leader /
 * extension line) when it is both highly linear and long — reusing the
 * same PCA line-fit (`fitLine`) Session 2A.1 already relies on. What
 * remains is grouped by proximity (character/digit spacing) into text
 * clusters, since "120" is three separate ink components that must be
 * read together, not three isolated digits.
 *
 * Returns bounding boxes in ORIGINAL IMAGE PIXEL coordinates. Never
 * asserts that a region contains a real number — that is OCR's job, and
 * OCR's output must still be reviewed by a human (CLAUDE.md §4).
 */
export function detectDimensionTextRegions(
  dimensionMask: Uint8Array,
  width: number,
  height: number,
  options: Partial<OcrRegionDetectionOptions> = {},
): TextRegionCandidate[] {
  const opts: OcrRegionDetectionOptions = {
    charGroupingGapPx: 14,
    paddingPx: 6,
    lineLinearityThreshold: 0.9,
    lineMinLengthPx: 40,
    minClusterPixelCount: 6,
    maxClusterAreaFraction: 0.1,
    ...options,
  };

  const rawComponents = extractRawComponents(dimensionMask, width, height);

  const textLikeComponents: ComponentStats[] = [];
  for (const component of rawComponents) {
    const fit = fitLine(component);
    const looksLikeLine =
      fit !== null &&
      fit.linearity >= opts.lineLinearityThreshold &&
      fit.lengthPx >= opts.lineMinLengthPx;
    if (!looksLikeLine) textLikeComponents.push(component);
  }

  const clusters = clusterByProximity(textLikeComponents, opts.charGroupingGapPx);
  const imageArea = width * height;
  const maxClusterArea = imageArea * opts.maxClusterAreaFraction;

  const regions: TextRegionCandidate[] = [];
  for (const cluster of clusters) {
    if (cluster.count < opts.minClusterPixelCount) continue;
    const clusterArea = (cluster.maxX - cluster.minX + 1) * (cluster.maxY - cluster.minY + 1);
    if (clusterArea > maxClusterArea) continue;

    regions.push({
      id: generateId("ocr-region"),
      region: toRegion(cluster, width, height, opts.paddingPx),
      method: "auto-region",
      sourceComponentCount: cluster.members.length,
    });
  }

  return regions;
}

/** Builds a manually-drawn text region candidate (user override path —
 * Session 2B spec §5/§8, used when automatic detection misses a region
 * or wrongly rejects/merges one). */
export function createManualTextRegion(region: Region): TextRegionCandidate {
  return { id: generateId("ocr-region"), region, method: "manual-region", sourceComponentCount: 0 };
}
