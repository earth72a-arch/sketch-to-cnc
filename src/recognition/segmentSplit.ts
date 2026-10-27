import type { Point2 } from "./skeletonGraph";

/**
 * Recursive split (Ramer-Douglas-Peucker-style) of an ordered skeleton
 * pixel chain into maximal straight runs. Chosen over a generic Hough
 * transform: the skeleton graph already gives an explicit, ordered pixel
 * chain per stroke network, so splitting that chain wherever it bends is
 * cheaper and pixel-accurate — Hough would have to rediscover the
 * connectivity information this chain already encodes.
 *
 * This function only decides WHERE a chain bends; it does not judge
 * whether a resulting run is "long enough" or "straight enough" to count
 * as a real line — that qualification happens in segmentExtraction.ts
 * using the same linearity/length rules as before.
 */
export function splitChainIntoStraightRuns(
  points: Point2[],
  maxDeviationPx: number,
  minRunPoints: number,
): Point2[][] {
  if (points.length === 0) return [];
  if (points.length < minRunPoints) return [points];

  const runs: Point2[][] = [];
  splitRange(points, 0, points.length - 1, maxDeviationPx, minRunPoints, runs);
  return runs;
}

function perpendicularDistance(p: Point2, a: Point2, b: Point2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}

function splitRange(
  points: Point2[],
  startIdx: number,
  endIdx: number,
  maxDeviationPx: number,
  minRunPoints: number,
  out: Point2[][],
): void {
  const span = endIdx - startIdx + 1;
  if (span < minRunPoints) {
    out.push(points.slice(startIdx, endIdx + 1));
    return;
  }

  const a = points[startIdx];
  const b = points[endIdx];
  let maxDist = -1;
  let maxIdx = -1;
  for (let i = startIdx + 1; i < endIdx; i++) {
    const dist = perpendicularDistance(points[i], a, b);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxIdx === -1 || maxDist <= maxDeviationPx) {
    out.push(points.slice(startIdx, endIdx + 1));
    return;
  }

  splitRange(points, startIdx, maxIdx, maxDeviationPx, minRunPoints, out);
  splitRange(points, maxIdx, endIdx, maxDeviationPx, minRunPoints, out);
}
