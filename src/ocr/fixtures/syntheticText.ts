import type { PixelBuffer, RGB } from "../../recognition/types";

/**
 * SYNTHETIC OCR test fixtures (Session 2B) — a tiny hand-authored 5x7
 * dot-matrix bitmap font, rasterized directly into a PixelBuffer with no
 * canvas/font-rendering dependency. Never a real customer drawing, never
 * real handwriting — see CLAUDE.md §9. Legibility is deliberately
 * boosted with upscaling + a light box blur (pretrained OCR models
 * expect roughly anti-aliased strokes, not hard 1px-per-dot blocks).
 */

const FONT_5X7: Record<string, string[]> = {
  "0": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  c: ["00000", "00000", "01110", "10000", "10000", "10001", "01110"],
  m: ["00000", "00000", "11011", "10101", "10101", "10101", "10101"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};

export interface SyntheticTextOptions {
  /** Pixels per bitmap-font dot. Larger = more legible, matches the
   * feasibility experiment that validated this fixture against the real
   * tesseract.js engine (see Session 2B final report). */
  scale?: number;
  ink?: RGB;
  background?: RGB;
}

/** True iff every character in `text` is representable by the bundled
 * fixture font — tests should check this before asserting on OCR output
 * for a given string, so a typo'd fixture fails loudly instead of
 * silently rendering blanks. */
export function isRenderableBySyntheticFont(text: string): boolean {
  return [...text.toLowerCase()].every((ch) => ch in FONT_5X7);
}

/** Renders `text` (digits, '.', 'c', 'm', space — case-insensitive) as a
 * synthetic horizontal PixelBuffer, ink-on-background. */
export function renderSyntheticText(text: string, options: SyntheticTextOptions = {}): PixelBuffer {
  const scale = options.scale ?? 10;
  const ink = options.ink ?? { r: 255, g: 0, b: 0 }; // red = dimension color convention
  const background = options.background ?? { r: 255, g: 255, b: 255 };
  const lower = text.toLowerCase();

  const glyphW = 5 * scale;
  const glyphH = 7 * scale;
  const gap = scale * 2;
  const width = lower.length * (glyphW + gap) + gap;
  const height = glyphH + gap * 2;

  const gray = new Uint8ClampedArray(width * height).fill(255);
  for (let ci = 0; ci < lower.length; ci++) {
    const pattern = FONT_5X7[lower[ci]];
    if (!pattern) continue;
    const ox = gap + ci * (glyphW + gap);
    const oy = gap;
    for (let ry = 0; ry < 7; ry++) {
      for (let rx = 0; rx < 5; rx++) {
        if (pattern[ry][rx] !== "1") continue;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            gray[(oy + ry * scale + sy) * width + (ox + rx * scale + sx)] = 0;
          }
        }
      }
    }
  }

  // 3x3 box blur to soften the blocky dot-matrix edges.
  const blurred = new Uint8ClampedArray(gray.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          sum += gray[ny * width + nx];
          n++;
        }
      }
      blurred[y * width + x] = Math.round(sum / n);
    }
  }

  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const t = blurred[i] / 255; // 1 = pure background, 0 = pure ink
    const o = i * 4;
    data[o] = Math.round(ink.r * (1 - t) + background.r * t);
    data[o + 1] = Math.round(ink.g * (1 - t) + background.g * t);
    data[o + 2] = Math.round(ink.b * (1 - t) + background.b * t);
    data[o + 3] = 255;
  }

  return { width, height, data };
}

/** Pastes `source` into `target` at (x, y) — used to build a larger
 * synthetic sketch containing a text sample next to e.g. a dimension
 * line, for false-positive-avoidance fixtures. Clips at target bounds. */
export function pastePixelBuffer(target: PixelBuffer, source: PixelBuffer, x: number, y: number): void {
  for (let sy = 0; sy < source.height; sy++) {
    const ty = y + sy;
    if (ty < 0 || ty >= target.height) continue;
    for (let sx = 0; sx < source.width; sx++) {
      const tx = x + sx;
      if (tx < 0 || tx >= target.width) continue;
      const so = (sy * source.width + sx) * 4;
      const to = (ty * target.width + tx) * 4;
      target.data[to] = source.data[so];
      target.data[to + 1] = source.data[so + 1];
      target.data[to + 2] = source.data[so + 2];
      target.data[to + 3] = source.data[so + 3];
    }
  }
}
