import { describe, expect, it } from "vitest";
import { fitLine, lineEndpoints } from "./lineFit";
import { extractRawComponents } from "./connectedComponents";

function maskFromPixels(width: number, height: number, onPixels: Array<[number, number]>): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (const [x, y] of onPixels) mask[y * width + x] = 1;
  return mask;
}

describe("fitLine — PCA line fitting from component statistics", () => {
  it("fits a perfectly horizontal line with angle ~0 and high linearity", () => {
    const pixels: Array<[number, number]> = [];
    for (let x = 0; x <= 29; x++) pixels.push([x, 10]);
    const mask = maskFromPixels(30, 20, pixels);
    const [component] = extractRawComponents(mask, 30, 20);

    const fit = fitLine(component)!;
    expect(fit.angleDeg).toBeCloseTo(0, 0);
    expect(fit.linearity).toBeGreaterThan(0.95);
    expect(fit.lengthPx).toBeGreaterThan(20);
  });

  it("fits a perfectly vertical line with angle ~90", () => {
    const pixels: Array<[number, number]> = [];
    for (let y = 0; y <= 29; y++) pixels.push([10, y]);
    const mask = maskFromPixels(20, 30, pixels);
    const [component] = extractRawComponents(mask, 20, 30);

    const fit = fitLine(component)!;
    expect(fit.angleDeg).toBeCloseTo(90, 0);
    expect(fit.linearity).toBeGreaterThan(0.95);
  });

  it("fits a 45-degree diagonal line", () => {
    const pixels: Array<[number, number]> = [];
    for (let i = 0; i <= 29; i++) pixels.push([i, i]);
    const mask = maskFromPixels(30, 30, pixels);
    const [component] = extractRawComponents(mask, 30, 30);

    const fit = fitLine(component)!;
    expect(fit.angleDeg).toBeCloseTo(45, 0);
    expect(fit.linearity).toBeGreaterThan(0.95);
  });

  it("gives low linearity for an isotropic blob (not a line)", () => {
    const pixels: Array<[number, number]> = [];
    for (let x = 0; x < 10; x++) {
      for (let y = 0; y < 10; y++) pixels.push([x, y]);
    }
    const mask = maskFromPixels(10, 10, pixels);
    const [component] = extractRawComponents(mask, 10, 10);

    const fit = fitLine(component)!;
    expect(fit.linearity).toBeLessThan(0.3);
  });

  it("returns null for an empty component", () => {
    expect(
      fitLine({ count: 0, sumX: 0, sumY: 0, sumXX: 0, sumYY: 0, sumXY: 0, minX: 0, maxX: 0, minY: 0, maxY: 0 }),
    ).toBeNull();
  });
});

describe("lineEndpoints — image-pixel coordinate mapping", () => {
  it("places endpoints symmetrically around the centroid along the fitted axis", () => {
    const pixels: Array<[number, number]> = [];
    for (let x = 0; x <= 19; x++) pixels.push([x, 100]);
    const mask = maskFromPixels(20, 200, pixels);
    const [component] = extractRawComponents(mask, 20, 200);
    const fit = fitLine(component)!;
    const { start, end } = lineEndpoints(fit);

    expect(start.y).toBeCloseTo(100, 0);
    expect(end.y).toBeCloseTo(100, 0);
    expect(Math.min(start.x, end.x)).toBeGreaterThanOrEqual(-1);
    expect(Math.max(start.x, end.x)).toBeLessThanOrEqual(21);
    // Midpoint of the endpoints must equal the component centroid exactly —
    // this IS the original-image pixel coordinate system, never screen space.
    expect((start.x + end.x) / 2).toBeCloseTo(fit.centroid.x, 3);
    expect((start.y + end.y) / 2).toBeCloseTo(fit.centroid.y, 3);
  });
});
