import { describe, expect, it } from "vitest";
import { cropPixelBuffer, extractOrientedCrop, padRegion, rotatePixelBuffer } from "./pixelTransform";
import type { PixelBuffer } from "../recognition/types";

function solidBuffer(width: number, height: number, color: [number, number, number]): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    data[o] = color[0];
    data[o + 1] = color[1];
    data[o + 2] = color[2];
    data[o + 3] = 255;
  }
  return { width, height, data };
}

describe("padRegion", () => {
  it("expands a region by paddingPx on every side", () => {
    const region = { x: 10, y: 10, width: 20, height: 5 };
    const padded = padRegion(region, 3, 100, 100);
    expect(padded.x).toBe(7);
    expect(padded.y).toBe(7);
    expect(padded.width).toBe(26);
    expect(padded.height).toBe(11);
  });

  it("clamps the expanded region to image bounds", () => {
    const region = { x: 1, y: 1, width: 4, height: 4 };
    const padded = padRegion(region, 10, 20, 20);
    expect(padded.x).toBe(0);
    expect(padded.y).toBe(0);
  });
});

describe("cropPixelBuffer", () => {
  it("extracts exactly the requested region at the requested size", () => {
    const buffer = solidBuffer(50, 50, [10, 20, 30]);
    const cropped = cropPixelBuffer(buffer, { x: 5, y: 5, width: 10, height: 8 });
    expect(cropped.width).toBe(10);
    expect(cropped.height).toBe(8);
    expect(cropped.data[0]).toBe(10);
    expect(cropped.data[1]).toBe(20);
    expect(cropped.data[2]).toBe(30);
  });

  it("fills white for any portion of the requested region outside the source image", () => {
    const buffer = solidBuffer(10, 10, [0, 0, 0]);
    const cropped = cropPixelBuffer(buffer, { x: -5, y: -5, width: 10, height: 10 });
    // top-left corner of the crop is entirely out-of-bounds -> white
    expect(cropped.data[0]).toBe(255);
    expect(cropped.data[1]).toBe(255);
    expect(cropped.data[2]).toBe(255);
  });
});

describe("rotatePixelBuffer", () => {
  it("is a no-op for a 0 degree rotation", () => {
    const buffer = solidBuffer(20, 10, [1, 2, 3]);
    const rotated = rotatePixelBuffer(buffer, 0);
    expect(rotated).toBe(buffer);
  });

  it("swaps width and height for a 90 degree rotation", () => {
    const buffer = solidBuffer(30, 10, [1, 2, 3]);
    const rotated = rotatePixelBuffer(buffer, 90);
    expect(rotated.width).toBeCloseTo(10, 0);
    expect(rotated.height).toBeCloseTo(30, 0);
  });

  it("preserves the overall solid color after rotation (no corruption)", () => {
    const buffer = solidBuffer(20, 20, [40, 50, 60]);
    const rotated = rotatePixelBuffer(buffer, 37);
    // sample the center pixel, which must land inside the rotated square
    const cx = Math.floor(rotated.width / 2);
    const cy = Math.floor(rotated.height / 2);
    const o = (cy * rotated.width + cx) * 4;
    expect(rotated.data[o]).toBe(40);
    expect(rotated.data[o + 1]).toBe(50);
    expect(rotated.data[o + 2]).toBe(60);
  });
});

describe("extractOrientedCrop", () => {
  it("pads, crops and rotates in one call without throwing at image edges", () => {
    const buffer = solidBuffer(40, 40, [5, 5, 5]);
    expect(() => extractOrientedCrop(buffer, { x: 0, y: 0, width: 5, height: 5 }, 4, 45)).not.toThrow();
  });
});

describe("Session 2B.1 — zero-size / degenerate region safety", () => {
  it("cropPixelBuffer does not throw for a zero-width/zero-height region and still returns a usable buffer", () => {
    const buffer = solidBuffer(40, 40, [1, 2, 3]);
    const cropped = cropPixelBuffer(buffer, { x: 10, y: 10, width: 0, height: 0 });
    expect(cropped.width).toBeGreaterThanOrEqual(1);
    expect(cropped.height).toBeGreaterThanOrEqual(1);
    expect(cropped.data.length).toBe(cropped.width * cropped.height * 4);
  });

  it("padRegion does not throw and returns a non-degenerate region for a zero-size input", () => {
    const padded = padRegion({ x: 5, y: 5, width: 0, height: 0 }, 2, 100, 100);
    expect(padded.width).toBeGreaterThanOrEqual(1);
    expect(padded.height).toBeGreaterThanOrEqual(1);
  });

  it("extractOrientedCrop handles a zero-size manually-drawn region without throwing, at any orientation", () => {
    const buffer = solidBuffer(40, 40, [9, 9, 9]);
    for (const angle of [0, 45, 90]) {
      expect(() => extractOrientedCrop(buffer, { x: 20, y: 20, width: 0, height: 0 }, 4, angle)).not.toThrow();
    }
  });
});
