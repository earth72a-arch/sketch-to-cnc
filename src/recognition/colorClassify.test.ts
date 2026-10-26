import { describe, expect, it } from "vitest";
import { classifyPixels } from "./colorClassify";
import { createDefaultPalette } from "./palette";
import { createBlankBuffer, buildSyntheticLineImage } from "./fixtures/syntheticImages";
import type { PixelBuffer } from "./types";

function setPixel(buffer: PixelBuffer, x: number, y: number, r: number, g: number, b: number, a = 255) {
  const o = (y * buffer.width + x) * 4;
  buffer.data[o] = r;
  buffer.data[o + 1] = g;
  buffer.data[o + 2] = b;
  buffer.data[o + 3] = a;
}

describe("classifyPixels — pixel color classification", () => {
  it("classifies an exact palette match into its category", () => {
    const palette = createDefaultPalette();
    const buffer = createBlankBuffer(4, 4);
    setPixel(buffer, 1, 1, 255, 0, 0); // exact "dimension" red
    const result = classifyPixels(buffer, palette);
    const idx = 1 * 4 + 1;
    expect(result.masks.dimension[idx]).toBe(1);
    expect(result.counts.dimension).toBe(1);
  });

  it("treats a pure white pixel as background, not unclassified", () => {
    const palette = createDefaultPalette();
    const buffer = createBlankBuffer(2, 2);
    const result = classifyPixels(buffer, palette);
    expect(result.counts.background).toBe(4);
    expect(result.counts.unclassified).toBe(0);
  });

  it("treats fully transparent pixels as background", () => {
    const palette = createDefaultPalette();
    const buffer = createBlankBuffer(2, 2);
    setPixel(buffer, 0, 0, 10, 200, 30, 0);
    const result = classifyPixels(buffer, palette);
    expect(result.backgroundMask[0]).toBe(1);
  });

  it("marks a color that matches no palette entry within tolerance as unclassified, not dropped", () => {
    const palette = createDefaultPalette();
    const buffer = createBlankBuffer(2, 2);
    setPixel(buffer, 0, 0, 255, 220, 0); // bright yellow — far from all 5 categories
    const result = classifyPixels(buffer, palette);
    expect(result.unclassifiedMask[0]).toBe(1);
    expect(result.counts.unclassified).toBe(1);
    for (const category of Object.keys(result.masks) as (keyof typeof result.masks)[]) {
      expect(result.masks[category][0]).toBe(0);
    }
  });

  it("does not use color to infer a real component — classification is purely per-pixel", () => {
    const palette = createDefaultPalette();
    const buffer = createBlankBuffer(2, 2);
    setPixel(buffer, 0, 0, 0, 0, 0); // single isolated "cabinet_structure" pixel
    const result = classifyPixels(buffer, palette);
    expect(result.masks.cabinet_structure[0]).toBe(1);
    // classifyPixels has no concept of "component" or "part" at all —
    // confirmed structurally: its return type carries only masks/counts.
    expect(result).not.toHaveProperty("components");
    expect(result).not.toHaveProperty("parts");
  });
});

describe("classifyPixels — tolerance and anti-aliasing", () => {
  it("tolerance is a hard, user-adjustable boundary (monotonic: widening tolerance can only add matches)", () => {
    const buffer = createBlankBuffer(2, 2);
    setPixel(buffer, 0, 0, 175, 0, 0); // distance 80 from pure red (255,0,0)

    const tight = createDefaultPalette();
    tight.dimension.tolerance = 60;
    const tightResult = classifyPixels(buffer, tight);
    expect(tightResult.masks.dimension[0]).toBe(0);
    expect(tightResult.unclassifiedMask[0]).toBe(1);

    const loose = createDefaultPalette();
    loose.dimension.tolerance = 90;
    const looseResult = classifyPixels(buffer, loose);
    expect(looseResult.masks.dimension[0]).toBe(1);
    expect(looseResult.unclassifiedMask[0]).toBe(0);
  });

  it("alpha-blended (anti-aliased) ink near full opacity still classifies correctly", () => {
    const buffer = createBlankBuffer(2, 2);
    // alpha=225 over white -> effective ~ (30,30,30), distance to black ~52 < tolerance 60
    setPixel(buffer, 0, 0, 0, 0, 0, 225);
    const palette = createDefaultPalette();
    const result = classifyPixels(buffer, palette);
    expect(result.masks.cabinet_structure[0]).toBe(1);
  });

  it("heavily alpha-blended ink (far from the edge band) is correctly left unclassified rather than mis-colored", () => {
    const buffer = createBlankBuffer(2, 2);
    // alpha=200 over white -> effective ~ (55,55,55), distance to black ~95 > tolerance 60
    setPixel(buffer, 0, 0, 0, 0, 0, 200);
    const palette = createDefaultPalette();
    const result = classifyPixels(buffer, palette);
    expect(result.masks.cabinet_structure[0]).toBe(0);
    expect(result.unclassifiedMask[0]).toBe(1);
  });

  it("rasterized anti-aliased line edges classify at least as many pixels as a widened tolerance only adds", () => {
    const palette = createDefaultPalette();
    const narrow = { ...palette, cabinet_structure: { ...palette.cabinet_structure, tolerance: 20 } };
    const wide = { ...palette, cabinet_structure: { ...palette.cabinet_structure, tolerance: 150 } };

    const buffer = buildSyntheticLineImage({
      width: 40,
      height: 20,
      antialias: true,
      lines: [{ x1: 5, y1: 10, x2: 35, y2: 10, color: { r: 0, g: 0, b: 0 }, thicknessPx: 3 }],
    });

    const narrowResult = classifyPixels(buffer, narrow);
    const wideResult = classifyPixels(buffer, wide);
    expect(wideResult.counts.cabinet_structure).toBeGreaterThanOrEqual(
      narrowResult.counts.cabinet_structure,
    );
    expect(narrowResult.counts.cabinet_structure).toBeGreaterThan(0);
  });
});
