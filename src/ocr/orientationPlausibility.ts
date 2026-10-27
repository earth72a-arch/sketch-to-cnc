import type { PixelBuffer } from "../recognition/types";

/**
 * Session 2B.4 — orientation plausibility scoring.
 *
 * Evidence (Session 2B.4 §1): the real iPad test misread "35"→"49" and
 * "30"→"20", the second at 93% confidence — a "confidently wrong" case
 * (CLAUDE.md §4 / Session 2B spec §13/§14: never treat confidence alone
 * as proof of correctness). Independently reproduced a structurally
 * similar failure in this project's own Node tooling (Session 2B.2's
 * preprocessing-experiment log): forcing the "35" crop through the
 * WRONG orientation (0°, when its real baseline is ~29.6°) reads "39"
 * or "49" at 44-63% confidence — the current pipeline only avoids this
 * on test-001.jpg because the CORRECT-orientation attempt (29.6°)
 * happens to score higher (93%) than the wrong one; nothing stops the
 * reverse from happening on a different image, which is the structural
 * risk this module mitigates.
 *
 * `findInkBoundingBox`/`inkAspectRatio` are pure and reused by both the
 * real pipeline and tests — multi-digit dimension text read at (near)
 * its true baseline angle should be noticeably wider than tall; an
 * orientation far from the real baseline tends to produce a
 * taller/squarer de-skewed ink box. This is a MILD re-ranking nudge,
 * never a hard filter — a lone digit like "1" legitimately isn't much
 * wider than tall.
 */

export interface InkBoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  widthPx: number;
  heightPx: number;
}

/** Finds the tight bounding box of non-background ("ink") pixels in a
 * cropped/oriented PixelBuffer, using the same background-luminance
 * convention as colorClassify.ts (default threshold 250). Returns null
 * if the crop contains no ink pixels at all (e.g. a blank region, or
 * fully transparent out-of-bounds padding). */
export function findInkBoundingBox(buffer: PixelBuffer, backgroundLuminanceThreshold = 250): InkBoundingBox | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let y = 0; y < buffer.height; y++) {
    const rowOffset = y * buffer.width;
    for (let x = 0; x < buffer.width; x++) {
      const o = (rowOffset + x) * 4;
      const a = buffer.data[o + 3];
      if (a === 0) continue;
      const luminance = 0.299 * buffer.data[o] + 0.587 * buffer.data[o + 1] + 0.114 * buffer.data[o + 2];
      if (luminance >= backgroundLuminanceThreshold) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (minX === Infinity) return null;
  return { minX, minY, maxX, maxY, widthPx: maxX - minX + 1, heightPx: maxY - minY + 1 };
}

/** Width/height ratio of the ink bounding box, or null if the crop has
 * no ink. > 1 means wider than tall. */
export function inkAspectRatio(buffer: PixelBuffer, backgroundLuminanceThreshold = 250): number | null {
  const box = findInkBoundingBox(buffer, backgroundLuminanceThreshold);
  if (!box) return null;
  return box.widthPx / box.heightPx;
}

/**
 * Combines the engine's raw confidence with a mild plausibility
 * adjustment: orientations whose de-skewed ink is TALLER than wide get
 * a smoothly scaled-down score (never zeroed out), so a wrong-angle
 * attempt needs a much larger raw-confidence lead to still win the
 * ranking. `confidence` null is treated as 0 (nothing to reward).
 */
export function orientationPlausibilityScore(confidence: number | null, aspectRatio: number | null): number {
  const conf = confidence ?? 0;
  if (aspectRatio === null || aspectRatio >= 1) return conf;
  const factor = 0.6 + 0.4 * Math.max(0, aspectRatio);
  return conf * factor;
}
