import type { ComponentStats } from "./types";

export interface LineFitResult {
  centroid: { x: number; y: number };
  /** atan2(dy, dx) of the principal axis, in image pixel space (y-down),
   * degrees, normalized to [0, 180) since a line has no direction. */
  angleDeg: number;
  /** Estimated from pixel-count variance along the principal axis, i.e.
   * length = sqrt(12 * majorEigenvalue) — the length of a uniform
   * distribution with that variance. This is a heuristic for a roughly
   * constant-width straight stroke; it is a PIXEL measurement only and
   * must never be treated as a real-world size (see CLAUDE.md §4). */
  lengthPx: number;
  /** 0 (isotropic blob) .. 1 (perfectly straight line). */
  linearity: number;
  eigenvalues: [number, number];
}

/**
 * Fits a principal axis to a connected component using only its
 * accumulated moment statistics (no per-pixel data needed) via a
 * closed-form 2x2 symmetric eigen-decomposition.
 */
export function fitLine(stats: ComponentStats): LineFitResult | null {
  if (stats.count === 0) return null;

  const cx = stats.sumX / stats.count;
  const cy = stats.sumY / stats.count;
  const varX = stats.sumXX / stats.count - cx * cx;
  const varY = stats.sumYY / stats.count - cy * cy;
  const covXY = stats.sumXY / stats.count - cx * cy;

  const trace = varX + varY;
  const det = varX * varY - covXY * covXY;
  const m = trace / 2;
  const discriminant = Math.max(0, m * m - det);
  const d = Math.sqrt(discriminant);
  const lambda1 = Math.max(0, m + d);
  const lambda2 = Math.max(0, m - d);

  let vx: number;
  let vy: number;
  if (Math.abs(covXY) > 1e-9) {
    vx = covXY;
    vy = lambda1 - varX;
  } else {
    // Already axis-aligned: pick the axis with the larger variance.
    vx = varX >= varY ? 1 : 0;
    vy = varX >= varY ? 0 : 1;
  }

  let angleDeg = (Math.atan2(vy, vx) * 180) / Math.PI;
  angleDeg = ((angleDeg % 180) + 180) % 180;

  const linearity = lambda1 > 1e-9 ? 1 - lambda2 / lambda1 : 0;
  const lengthPx = Math.sqrt(12 * lambda1);

  return {
    centroid: { x: cx, y: cy },
    angleDeg,
    lengthPx,
    linearity,
    eigenvalues: [lambda1, lambda2],
  };
}

/** Projects the fitted principal axis back into two endpoints centered on
 * the centroid, for drawing an overlay line. Pixel coordinates only. */
export function lineEndpoints(fit: LineFitResult): {
  start: { x: number; y: number };
  end: { x: number; y: number };
} {
  const rad = (fit.angleDeg * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const half = fit.lengthPx / 2;
  return {
    start: { x: fit.centroid.x - dx * half, y: fit.centroid.y - dy * half },
    end: { x: fit.centroid.x + dx * half, y: fit.centroid.y + dy * half },
  };
}
