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
    const regions = detectDimensionTextRegions(mask, width, height, { charGroupingGapPx: 8 });
    expect(regions).toHaveLength(1);
    expect(regions[0].sourceComponentCount).toBe(3);
    expect(regions[0].method).toBe("auto-region");
  });

  it("keeps far-apart blobs as separate text regions instead of over-merging", () => {
    const width = 300;
    const height = 40;
    const pixels = [...filledRect(10, 10, 6, 14), ...filledRect(250, 10, 6, 14)];
    const mask = maskFromPixels(width, height, pixels);
    const regions = detectDimensionTextRegions(mask, width, height, { charGroupingGapPx: 8 });
    expect(regions).toHaveLength(2);
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
