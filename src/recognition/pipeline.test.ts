import { describe, expect, it } from "vitest";
import { runRecognitionPipeline } from "./pipeline";
import { createDefaultPalette } from "./palette";
import {
  buildSyntheticLineImage,
  createBlankBuffer,
  drawSyntheticFilledDisk,
  drawSyntheticLine,
} from "./fixtures/syntheticImages";

describe("runRecognitionPipeline — end-to-end", () => {
  it("detects a single black line as cabinet_structure with correct pixel coordinates", () => {
    const palette = createDefaultPalette();
    const buffer = buildSyntheticLineImage({
      width: 100,
      height: 60,
      lines: [{ x1: 10, y1: 30, x2: 90, y2: 30, color: { r: 0, g: 0, b: 0 }, thicknessPx: 3 }],
    });

    const result = runRecognitionPipeline(buffer, palette);
    expect(result.lines).toHaveLength(1);
    const line = result.lines[0];
    expect(line.category).toBe("cabinet_structure");
    expect(line.angleDeg).toBeCloseTo(0, 0);
    // Coordinate mapping: detected coordinates must land within the
    // original image's pixel grid, in the region actually drawn.
    expect(line.start.x).toBeGreaterThanOrEqual(0);
    expect(line.end.x).toBeLessThanOrEqual(buffer.width);
    expect(Math.min(line.start.x, line.end.x)).toBeLessThan(20);
    expect(Math.max(line.start.x, line.end.x)).toBeGreaterThan(80);
    expect(Math.abs(line.start.y - 30)).toBeLessThanOrEqual(1);
  });

  it("detects multiple categories independently by color", () => {
    const palette = createDefaultPalette();
    const buffer = buildSyntheticLineImage({
      width: 100,
      height: 100,
      lines: [
        { x1: 5, y1: 10, x2: 95, y2: 10, color: { r: 0, g: 0, b: 0 }, thicknessPx: 3 }, // cabinet_structure
        { x1: 5, y1: 30, x2: 95, y2: 30, color: { r: 0, g: 0, b: 255 }, thicknessPx: 3 }, // door_front
        { x1: 5, y1: 50, x2: 95, y2: 50, color: { r: 255, g: 0, b: 0 }, thicknessPx: 3 }, // dimension
      ],
    });

    const result = runRecognitionPipeline(buffer, palette);
    const byCategory = new Set(result.lines.map((l) => l.category));
    expect(byCategory).toEqual(new Set(["cabinet_structure", "door_front", "dimension"]));
  });

  it("rejects a filled blob instead of reporting a fake line through it", () => {
    const palette = createDefaultPalette();
    const buffer = createBlankBuffer(60, 60);
    drawSyntheticFilledDisk(buffer, { cx: 30, cy: 30, radius: 15, color: { r: 0, g: 0, b: 0 } });

    const result = runRecognitionPipeline(buffer, palette);
    expect(result.lines).toHaveLength(0);
    expect(result.rejectedBlobCount).toBeGreaterThan(0);
  });

  it("bridges a small-gap broken stroke into one line via the gapPx option", () => {
    const palette = createDefaultPalette();
    const buffer = createBlankBuffer(100, 40);
    drawSyntheticLine(buffer, { x1: 5, y1: 20, x2: 40, y2: 20, color: { r: 0, g: 0, b: 0 } });
    drawSyntheticLine(buffer, { x1: 44, y1: 20, x2: 90, y2: 20, color: { r: 0, g: 0, b: 0 } });

    const withoutGap = runRecognitionPipeline(buffer, palette, { gapPx: 0 });
    expect(withoutGap.lines.filter((l) => l.category === "cabinet_structure")).toHaveLength(2);

    const withGap = runRecognitionPipeline(buffer, palette, { gapPx: 6 });
    expect(withGap.lines.filter((l) => l.category === "cabinet_structure")).toHaveLength(1);
  });

  it("empty/invalid: a blank image yields zero lines and a clear empty-axis reason, never a fabricated result", () => {
    const palette = createDefaultPalette();
    const buffer = createBlankBuffer(50, 50);
    const result = runRecognitionPipeline(buffer, palette);

    expect(result.lines).toHaveLength(0);
    expect(result.axisClustering.axisCentroidsDeg).toBeNull();
    expect(result.axisClustering.reason).toBeTruthy();
    expect(result.classification.counts.background).toBe(50 * 50);
  });

  it("empty/invalid: a zero-size image does not throw", () => {
    const palette = createDefaultPalette();
    const buffer = { width: 0, height: 0, data: new Uint8ClampedArray(0) };
    expect(() => runRecognitionPipeline(buffer, palette)).not.toThrow();
    const result = runRecognitionPipeline(buffer, palette);
    expect(result.lines).toHaveLength(0);
  });

  it("reports a processing time and never emits a pixel length as a real-world unit", () => {
    const palette = createDefaultPalette();
    const buffer = buildSyntheticLineImage({
      width: 100,
      height: 60,
      lines: [{ x1: 10, y1: 30, x2: 90, y2: 30, color: { r: 0, g: 0, b: 0 } }],
    });
    const result = runRecognitionPipeline(buffer, palette);
    expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.lines[0]).not.toHaveProperty("mm");
    expect(result.lines[0]).not.toHaveProperty("realLength");
    expect(result.lines[0]).toHaveProperty("lengthPx");
  });
});

describe("runRecognitionPipeline — large image performance", () => {
  it("completes within a reasonable time budget on a large sketch-sized image", () => {
    const palette = createDefaultPalette();
    const width = 2000;
    const height = 1500;
    const buffer = createBlankBuffer(width, height);

    // A grid of lines approximating a busy real sketch: three axis
    // directions, dozens of strokes, so component count is non-trivial.
    const lines = [];
    for (let i = 0; i < 20; i++) {
      const y = 50 + i * 70;
      lines.push({ x1: 50, y1: y, x2: width - 50, y2: y, color: { r: 0, g: 0, b: 0 } });
    }
    for (let i = 0; i < 20; i++) {
      const offset = i * 90;
      lines.push({ x1: 50 + offset, y1: 50, x2: 50 + offset + 300, y2: height - 50, color: { r: 0, g: 0, b: 255 } });
    }
    for (const line of lines) drawSyntheticLine(buffer, line);

    const started = Date.now();
    const result = runRecognitionPipeline(buffer, palette);
    const elapsedMs = Date.now() - started;

    expect(result.lines.length).toBeGreaterThan(0);
    expect(elapsedMs).toBeLessThan(5000);
  }, 10000);
});
