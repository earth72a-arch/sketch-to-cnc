import { describe, expect, it } from "vitest";
import { findInkBoundingBox, inkAspectRatio, orientationPlausibilityScore } from "./orientationPlausibility";
import type { PixelBuffer } from "../recognition/types";

function bufferFromInkRect(width: number, height: number, ink: { x: number; y: number; w: number; h: number }): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  for (let y = ink.y; y < ink.y + ink.h; y++) {
    for (let x = ink.x; x < ink.x + ink.w; x++) {
      const o = (y * width + x) * 4;
      data[o] = 0;
      data[o + 1] = 0;
      data[o + 2] = 0;
      data[o + 3] = 255;
    }
  }
  return { width, height, data };
}

describe("findInkBoundingBox", () => {
  it("finds the tight bounding box of a single ink rectangle", () => {
    const buffer = bufferFromInkRect(40, 30, { x: 10, y: 5, w: 15, h: 8 });
    const box = findInkBoundingBox(buffer);
    expect(box).toEqual({ minX: 10, minY: 5, maxX: 24, maxY: 12, widthPx: 15, heightPx: 8 });
  });

  it("returns null for a blank (all-background) buffer", () => {
    const buffer = bufferFromInkRect(20, 20, { x: 0, y: 0, w: 0, h: 0 });
    expect(findInkBoundingBox(buffer)).toBeNull();
  });

  it("ignores fully transparent pixels", () => {
    const data = new Uint8ClampedArray(10 * 10 * 4); // all zero = transparent black
    const buffer: PixelBuffer = { width: 10, height: 10, data };
    expect(findInkBoundingBox(buffer)).toBeNull();
  });
});

describe("inkAspectRatio", () => {
  it("returns width/height > 1 for a wide multi-digit-like ink region", () => {
    const buffer = bufferFromInkRect(100, 50, { x: 10, y: 10, w: 60, h: 20 });
    expect(inkAspectRatio(buffer)).toBeCloseTo(3, 1);
  });

  it("returns width/height < 1 for a tall ink region (implausible for horizontal multi-digit text)", () => {
    const buffer = bufferFromInkRect(50, 100, { x: 10, y: 10, w: 15, h: 60 });
    expect(inkAspectRatio(buffer)).toBeCloseTo(0.25, 2);
  });

  it("returns null when there is no ink", () => {
    const buffer = bufferFromInkRect(20, 20, { x: 0, y: 0, w: 0, h: 0 });
    expect(inkAspectRatio(buffer)).toBeNull();
  });
});

describe("orientationPlausibilityScore", () => {
  it("returns the raw confidence unchanged when aspect ratio is wide (>= 1)", () => {
    expect(orientationPlausibilityScore(80, 2)).toBe(80);
    expect(orientationPlausibilityScore(80, 1)).toBe(80);
  });

  it("returns raw confidence unchanged when aspect ratio is unknown (null) — never penalize blind", () => {
    expect(orientationPlausibilityScore(80, null)).toBe(80);
  });

  it("penalizes a tall (implausible) ink box, scaling down smoothly with how tall it is", () => {
    const squarish = orientationPlausibilityScore(80, 0.9);
    const veryTall = orientationPlausibilityScore(80, 0.1);
    expect(squarish).toBeLessThan(80);
    expect(veryTall).toBeLessThan(squarish);
    expect(veryTall).toBeGreaterThan(0); // never zeroed out entirely
  });

  it("treats a null confidence as 0", () => {
    expect(orientationPlausibilityScore(null, 2)).toBe(0);
  });

  it("the plausibility penalty can flip the ranking of two closely-scored attempts", () => {
    // A wrong-orientation attempt with slightly higher raw confidence
    // but an implausible (tall) ink box should lose to a plausible,
    // slightly-lower-confidence correct-orientation attempt — this is
    // the exact mechanism meant to catch a "confidently wrong" case
    // like iPad's 30->20 at 93% confidence (Session 2B.4 §1/§7).
    const wrongOrientation = orientationPlausibilityScore(65, 0.3); // taller than wide
    const correctOrientation = orientationPlausibilityScore(60, 2.5); // wide, as real 2-digit text should be
    expect(correctOrientation).toBeGreaterThan(wrongOrientation);
  });
});
