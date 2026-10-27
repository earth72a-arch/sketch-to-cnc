import { generateId } from "../utils/id";
import { extractRawComponents } from "../recognition/connectedComponents";
import { fitLine } from "../recognition/lineFit";
import type { ComponentStats } from "../recognition/types";
import type { Region } from "../types/project";
import type { OcrRegionDetectionOptions, TextRegionCandidate } from "./types";
import { groupCharacters, DEFAULT_CHAR_GROUPING_OPTIONS, type CharCluster } from "./characterGrouping";

function toRegion(cluster: CharCluster, width: number, height: number, paddingPx: number): Region {
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
 * remains is grouped by adaptive character grouping (Session 2B.6, see
 * `characterGrouping.ts`) into text clusters, since "120" is three
 * separate ink components that must be read together, not three
 * isolated digits — and the merge distance scales with each pair's own
 * measured size instead of one fixed pixel constant, so it works for
 * both small and large hand-drawn digits in the same drawing.
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
  /** Session 2B.6 — ISO axis estimates (Session 2A.1), passed through as
   * SUPPORTING evidence for character-grouping alignment checks only;
   * the primary direction signal is always the components' own
   * arrangement (see `characterGrouping.ts`). */
  isoAxisCentroidsDeg: readonly number[] | null = null,
): TextRegionCandidate[] {
  const opts: OcrRegionDetectionOptions = {
    charGrouping: DEFAULT_CHAR_GROUPING_OPTIONS,
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

  const clusters = groupCharacters(textLikeComponents, isoAxisCentroidsDeg, opts.charGrouping);
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
