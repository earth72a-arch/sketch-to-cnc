import { COLOR_CATEGORIES } from "./types";
import type { ClassificationResult, ColorCategory, Palette, PixelBuffer, RGB } from "./types";

export interface ClassifyOptions {
  /** Alpha (0-255) at or below which a pixel counts as background/empty. */
  backgroundAlphaThreshold?: number;
  /** Perceived luminance (0-255) at or above which a pixel counts as the
   * (assumed white/light) canvas background rather than ink. */
  backgroundLuminanceThreshold?: number;
}

const DEFAULT_OPTIONS: Required<ClassifyOptions> = {
  backgroundAlphaThreshold: 8,
  backgroundLuminanceThreshold: 250,
};

function rgbDistance(a: RGB, b: RGB): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function luminance(c: RGB): number {
  return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
}

/**
 * Classifies every pixel into a color category, "unclassified" (ink that
 * matches no palette entry within tolerance — surfaced for the user to
 * inspect, never silently dropped), or "background".
 *
 * Anti-aliased edge pixels are handled two ways: (1) alpha blending with
 * an assumed white canvas before distance comparison, so a half-opaque
 * ink pixel reads as a lighter version of the ink color rather than a
 * random value, and (2) the per-category `tolerance` radius, which is the
 * user-adjustable control for how much AA blending to still accept.
 */
export function classifyPixels(
  buffer: PixelBuffer,
  palette: Palette,
  options: ClassifyOptions = {},
): ClassificationResult {
  const { backgroundAlphaThreshold, backgroundLuminanceThreshold } = {
    ...DEFAULT_OPTIONS,
    ...options,
  };
  const { width, height, data } = buffer;
  const pixelCount = width * height;

  const masks = {} as Record<ColorCategory, Uint8Array>;
  const counts = { unclassified: 0, background: 0 } as ClassificationResult["counts"];
  for (const category of COLOR_CATEGORIES) {
    masks[category] = new Uint8Array(pixelCount);
    counts[category] = 0;
  }
  const unclassifiedMask = new Uint8Array(pixelCount);
  const backgroundMask = new Uint8Array(pixelCount);

  for (let i = 0; i < pixelCount; i++) {
    const o = i * 4;
    const a = data[o + 3];

    if (a <= backgroundAlphaThreshold) {
      backgroundMask[i] = 1;
      counts.background++;
      continue;
    }

    const alphaFrac = a / 255;
    const effective: RGB = {
      r: data[o] * alphaFrac + 255 * (1 - alphaFrac),
      g: data[o + 1] * alphaFrac + 255 * (1 - alphaFrac),
      b: data[o + 2] * alphaFrac + 255 * (1 - alphaFrac),
    };

    if (luminance(effective) >= backgroundLuminanceThreshold) {
      backgroundMask[i] = 1;
      counts.background++;
      continue;
    }

    let bestCategory: ColorCategory | null = null;
    let bestDistance = Infinity;
    for (const category of COLOR_CATEGORIES) {
      const entry = palette[category];
      const d = rgbDistance(effective, entry.color);
      if (d < bestDistance) {
        bestDistance = d;
        bestCategory = category;
      }
    }

    if (bestCategory && bestDistance <= palette[bestCategory].tolerance) {
      masks[bestCategory][i] = 1;
      counts[bestCategory]++;
    } else {
      unclassifiedMask[i] = 1;
      counts.unclassified++;
    }
  }

  return { width, height, masks, unclassifiedMask, backgroundMask, counts };
}
