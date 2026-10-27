import type { ComponentStats } from "./types";
import { fitLine, type LineFitResult } from "./lineFit";
import { cropMaskToGrid, dilateGrid, zhangSuenThin } from "./skeleton";
import { traceSkeletonChains, type Point2 } from "./skeletonGraph";
import { splitChainIntoStraightRuns } from "./segmentSplit";

export interface SegmentExtractionOptions {
  /** Chebyshev dilation radius applied before thinning — bridges a small
   * pen-lift gap into one continuous skeleton chain. Derived from gapPx;
   * keep well below real spacing between distinct parallel strokes. */
  bridgeRadiusPx: number;
  /** Crop margin (source-image px) added around a component's bounding
   * box before thinning, so the thinning pass has context near edges. */
  marginPx: number;
  /** Max perpendicular pixel deviation before a chain is split at a bend
   * — handles corners/crossings a thinned stroke represents as a single
   * degree-2 chain rather than an explicit branch pixel (e.g. an L-join,
   * or each corner of a closed rectangle outline). */
  maxBendDeviationPx: number;
  minLinearity: number;
  minLengthPx: number;
  minPixelCount: number;
}

export interface RawLineSegment {
  fit: LineFitResult;
  /** Skeleton-chain point count for THIS specific segment — not the
   * original stroke's ink pixel count (the skeleton is 1px wide
   * regardless of stroke thickness). See FittedLine.pixelCount. */
  pixelCount: number;
}

function statsFromPoints(points: Point2[]): ComponentStats {
  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumYY = 0;
  let sumXY = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXX += p.x * p.x;
    sumYY += p.y * p.y;
    sumXY += p.x * p.y;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { count: points.length, sumX, sumY, sumXX, sumYY, sumXY, minX, minY, maxX, maxY };
}

/**
 * Decomposes ONE connected-component blob (which may be an entire network
 * of touching/crossing strokes — a cabinet frame, an L/T/X join) into its
 * individual straight edges: crop the category mask to the component's
 * bounding box → bridge small gaps → thin to a 1px skeleton → trace the
 * skeleton graph into chains between junctions/endpoints (or closed
 * loops) → split each chain at any bend → PCA-fit each resulting run.
 *
 * This replaces Session 2A's "one global PCA fit per connected
 * component," which rejected an entire touching/crossing stroke network
 * as "not a line" (low linearity) instead of finding the straight edges
 * inside it — the Session 2A.1 root cause.
 */
export function extractSegmentsFromComponent(
  categoryMask: Uint8Array,
  width: number,
  height: number,
  component: ComponentStats,
  options: SegmentExtractionOptions,
): { segments: RawLineSegment[]; rejectedCount: number } {
  const { grid, offsetX, offsetY } = cropMaskToGrid(categoryMask, width, height, component, options.marginPx);
  const bridged = options.bridgeRadiusPx > 0 ? dilateGrid(grid, options.bridgeRadiusPx) : grid;
  const skeleton = zhangSuenThin(bridged);
  const chains = traceSkeletonChains(skeleton);

  const minRunPoints = Math.max(2, Math.ceil(options.minLengthPx / 2));
  const segments: RawLineSegment[] = [];
  let rejectedCount = 0;

  for (const chain of chains) {
    if (chain.points.length < 2) {
      rejectedCount++;
      continue;
    }

    const runs = splitChainIntoStraightRuns(chain.points, options.maxBendDeviationPx, minRunPoints);

    for (const run of runs) {
      if (run.length < 2) {
        rejectedCount++;
        continue;
      }

      const localStats = statsFromPoints(run);
      const fit = fitLine(localStats);
      if (!fit) {
        rejectedCount++;
        continue;
      }

      const qualifies =
        localStats.count >= options.minPixelCount &&
        fit.linearity >= options.minLinearity &&
        fit.lengthPx >= options.minLengthPx;

      if (!qualifies) {
        rejectedCount++;
        continue;
      }

      const globalFit: LineFitResult = {
        ...fit,
        centroid: { x: fit.centroid.x + offsetX, y: fit.centroid.y + offsetY },
      };
      segments.push({ fit: globalFit, pixelCount: localStats.count });
    }
  }

  // A component that produced no qualifying segment at all (e.g. a filled
  // blob whose skeleton collapses to nothing traceable) must still be
  // visible to the user as "ink we looked at and rejected," matching
  // Session 2A's original per-blob rejection reporting.
  if (segments.length === 0 && rejectedCount === 0) {
    rejectedCount = 1;
  }

  return { segments, rejectedCount };
}
