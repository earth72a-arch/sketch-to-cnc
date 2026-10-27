import { describe, expect, it } from "vitest";
import { createManualTextRegion, detectDimensionTextRegions } from "./textRegionDetection";

function maskFromPixels(width: number, height: number, onPixels: Array<[number, number]>): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (const [x, y] of onPixels) mask[y * width + x] = 1;
  return mask;
}

function filledRect(x0: number, y0: number, w: number, h: number): Array<[number, number]> {
  const pixels: Array<[number, number]> = [];
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) pixels.push([x, y]);
  }
  return pixels;
}

function straightLine(x1: number, y: number, x2: number): Array<[number, number]> {
  const pixels: Array<[number, number]> = [];
  for (let x = x1; x <= x2; x++) {
    pixels.push([x, y]);
    pixels.push([x, y + 1]); // 2px thick so it has a stable PCA fit
  }
  return pixels;
}

describe("detectDimensionTextRegions", () => {
  it("excludes a long straight dimension line from the text candidates", () => {
    const width = 200;
    const height = 50;
    const mask = maskFromPixels(width, height, straightLine(5, 25, 190));
    const regions = detectDimensionTextRegions(mask, width, height);
    expect(regions).toHaveLength(0);
  });

  it("groups several nearby small blobs (digits) into one text region", () => {
    const width = 100;
    const height = 40;
    const pixels = [
      ...filledRect(10, 10, 6, 14), // "1"
      ...filledRect(20, 10, 6, 14), // "2"
      ...filledRect(30, 10, 6, 14), // "0"
    ];
    const mask = maskFromPixels(width, height, pixels);
    const regions = detectDimensionTextRegions(mask, width, height);
    expect(regions).toHaveLength(1);
    expect(regions[0].sourceComponentCount).toBe(3);
    expect(regions[0].method).toBe("auto-region");
  });

  it("keeps far-apart blobs as separate text regions instead of over-merging", () => {
    const width = 300;
    const height = 40;
    const pixels = [...filledRect(10, 10, 6, 14), ...filledRect(250, 10, 6, 14)];
    const mask = maskFromPixels(width, height, pixels);
    const regions = detectDimensionTextRegions(mask, width, height);
    expect(regions).toHaveLength(2);
  });

  it("Session 2B.6 — merges a wide-spaced two-digit number like '35' that the old fixed 14px gap used to split", () => {
    // Two digit-sized blobs spaced further apart than the OLD fixed
    // 14px constant (Session 2B) but still a plausible digit gap
    // relative to their own ~20px size — the real-world bug this
    // session fixes: Procreate scribble digit spacing scales with pen
    // size, a fixed pixel gap does not.
    const width = 400;
    const height = 150;
    const pixels = [
      ...filledRect(20, 15, 20, 28), // "3"-sized blob
      ...filledRect(58, 15, 20, 28), // "5"-sized blob, 18px gap > old fixed 14px
    ];
    const mask = maskFromPixels(width, height, pixels);
    const regions = detectDimensionTextRegions(mask, width, height);
    expect(regions).toHaveLength(1);
    expect(regions[0].sourceComponentCount).toBe(2);
  });

  it("Session 2B.6 — scales with LARGE digits too (adaptive, not a fixed pixel constant)", () => {
    // Same relative digit spacing as the test above, scaled up ~5x —
    // an adaptive gapFactor should still merge these; a fixed-pixel
    // threshold tuned for small digits would wrongly split large ones.
    const width = 1000;
    const height = 500;
    const pixels = [
      ...filledRect(80, 60, 100, 140),
      ...filledRect(270, 60, 100, 140), // 90px gap, large relative to a ~140px glyph but same ratio as above
    ];
    const mask = maskFromPixels(width, height, pixels);
    const regions = detectDimensionTextRegions(mask, width, height);
    expect(regions).toHaveLength(1);
  });

  it("Session 2B.6 — merges a vertically-split glyph (e.g. an '8' drawn with a waist gap) instead of reading it as two separate characters", () => {
    const width = 120;
    const height = 160;
    const pixels = [
      ...filledRect(15, 10, 20, 25), // upper loop
      ...filledRect(15, 40, 20, 25), // lower loop, small vertical gap (waist pinch)
    ];
    const mask = maskFromPixels(width, height, pixels);
    const regions = detectDimensionTextRegions(mask, width, height);
    expect(regions).toHaveLength(1);
    expect(regions[0].sourceComponentCount).toBe(2);
  });

  it("Session 2B.6 — does not force equal character widths ('1' narrow next to '0' wide)", () => {
    const width = 200;
    const height = 100;
    const pixels = [
      ...filledRect(10, 10, 6, 20), // narrow "1"
      ...filledRect(24, 10, 18, 20), // wide "0"
    ];
    const mask = maskFromPixels(width, height, pixels);
    const regions = detectDimensionTextRegions(mask, width, height);
    expect(regions).toHaveLength(1);
    expect(regions[0].sourceComponentCount).toBe(2);
  });

  it("Session 2B.6 — never merges distinct texts just because they are near each other at an implausible angle", () => {
    // Two blobs close together (within the old/new gap budget) but
    // positioned on a steep diagonal that matches neither 0°, 90°, nor
    // any supplied ISO axis — must NOT be merged (CLAUDE.md: never
    // guess/merge without evidence of being the same text run).
    const width = 100;
    const height = 100;
    const pixels = [...filledRect(10, 10, 14, 14), ...filledRect(30, 60, 14, 14)]; // ~63° diagonal
    const mask = maskFromPixels(width, height, pixels);
    const regions = detectDimensionTextRegions(mask, width, height, {}, null);
    expect(regions).toHaveLength(2);
  });

  it("Session 2B.6 — merges rotated text along a supplied ISO axis hint (not horizontal-only)", () => {
    // Two digit-sized blobs arranged along a ~30° diagonal (an ISO
    // edge), close relative to their size — should merge when the ISO
    // axis hint supports that direction, even though it is not 0°/90°.
    const width = 150;
    const height = 150;
    const pixels = [...filledRect(20, 90, 20, 20), ...filledRect(37, 73, 20, 20)]; // ~30deg from first blob
    const mask = maskFromPixels(width, height, pixels);
    const regions = detectDimensionTextRegions(mask, width, height, {}, [30, 90, 150]);
    expect(regions).toHaveLength(1);
  });

  it("applies configurable padding around the detected bounding box", () => {
    const width = 100;
    const height = 100;
    const mask = maskFromPixels(width, height, filledRect(40, 40, 10, 10));
    const tight = detectDimensionTextRegions(mask, width, height, { paddingPx: 0 });
    const padded = detectDimensionTextRegions(mask, width, height, { paddingPx: 10 });
    expect(padded[0].region.width).toBeGreaterThan(tight[0].region.width);
  });

  it("keeps a digit-shaped straight stroke like '1' that is short, not line-length", () => {
    const width = 60;
    const height = 60;
    // a short vertical stroke, much shorter than the line-length threshold
    const pixels = filledRect(28, 10, 3, 14);
    const mask = maskFromPixels(width, height, pixels);
    const regions = detectDimensionTextRegions(mask, width, height);
    expect(regions).toHaveLength(1);
  });

  it("drops a region below the minimum cluster pixel count (noise)", () => {
    const width = 50;
    const height = 50;
    const mask = maskFromPixels(width, height, [[5, 5]]);
    const regions = detectDimensionTextRegions(mask, width, height, { minClusterPixelCount: 6 });
    expect(regions).toHaveLength(0);
  });

  it("returns no regions for a blank mask", () => {
    const mask = new Uint8Array(100 * 100);
    expect(detectDimensionTextRegions(mask, 100, 100)).toHaveLength(0);
  });
});

describe("createManualTextRegion", () => {
  it("builds a manual-method region with the exact given bounds, no padding applied", () => {
    const region = createManualTextRegion({ x: 10, y: 20, width: 30, height: 15 });
    expect(region.method).toBe("manual-region");
    expect(region.region).toEqual({ x: 10, y: 20, width: 30, height: 15 });
    expect(region.sourceComponentCount).toBe(0);
  });
});
