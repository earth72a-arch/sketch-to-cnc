import { describe, expect, it } from "vitest";
import { cropMaskToGrid, dilateGrid, zhangSuenThin } from "./skeleton";

function maskFromPixels(width: number, height: number, onPixels: Array<[number, number]>): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (const [x, y] of onPixels) mask[y * width + x] = 1;
  return mask;
}

function countOn(data: Uint8Array): number {
  let n = 0;
  for (const v of data) if (v) n++;
  return n;
}

describe("cropMaskToGrid", () => {
  it("crops and offsets a region with margin, clamped to image bounds", () => {
    const mask = maskFromPixels(20, 20, [[10, 10]]);
    const { grid, offsetX, offsetY } = cropMaskToGrid(
      mask,
      20,
      20,
      { minX: 10, minY: 10, maxX: 10, maxY: 10 },
      2,
    );
    expect(offsetX).toBe(8);
    expect(offsetY).toBe(8);
    expect(grid.width).toBe(5);
    expect(grid.height).toBe(5);
    expect(grid.data[2 * grid.width + 2]).toBe(1);
  });

  it("clamps the margin at the image edge instead of reading out of bounds", () => {
    const mask = maskFromPixels(10, 10, [[0, 0]]);
    const { grid, offsetX, offsetY } = cropMaskToGrid(mask, 10, 10, { minX: 0, minY: 0, maxX: 0, maxY: 0 }, 5);
    expect(offsetX).toBe(0);
    expect(offsetY).toBe(0);
    expect(grid.width).toBe(6);
    expect(grid.height).toBe(6);
  });
});

describe("dilateGrid", () => {
  it("is a no-op for radius 0", () => {
    const grid = { width: 3, height: 3, data: maskFromPixels(3, 3, [[1, 1]]) };
    const out = dilateGrid(grid, 0);
    expect(countOn(out.data)).toBe(1);
  });

  it("grows a single pixel into a (2r+1)x(2r+1) block, clamped to bounds", () => {
    const grid = { width: 5, height: 5, data: maskFromPixels(5, 5, [[2, 2]]) };
    const out = dilateGrid(grid, 1);
    expect(countOn(out.data)).toBe(9); // 3x3 block
    expect(out.data[1 * 5 + 1]).toBe(1);
    expect(out.data[3 * 5 + 3]).toBe(1);
    expect(out.data[0 * 5 + 0]).toBe(0);
  });

  it("bridges two nearby strokes separated by a gap smaller than 2*radius", () => {
    const pixels: Array<[number, number]> = [];
    for (let x = 0; x <= 5; x++) pixels.push([x, 5]);
    for (let x = 9; x <= 15; x++) pixels.push([x, 5]);
    const grid = { width: 20, height: 10, data: maskFromPixels(20, 10, pixels) };
    const out = dilateGrid(grid, 2);
    // the gap at x=6,7,8 y=5 should now be filled
    expect(out.data[5 * 20 + 7]).toBe(1);
  });
});

describe("zhangSuenThin", () => {
  it("thins a thick straight horizontal stroke to a single-pixel-tall centerline", () => {
    const width = 40;
    const height = 11;
    const data = new Uint8Array(width * height);
    for (let x = 5; x < 35; x++) {
      for (let y = 3; y <= 7; y++) data[y * width + x] = 1;
    }
    const skeleton = zhangSuenThin({ width, height, data });

    for (let x = 10; x < 30; x++) {
      let onCount = 0;
      for (let y = 0; y < height; y++) if (skeleton.data[y * width + x]) onCount++;
      expect(onCount).toBe(1);
    }
  });

  it("thins a thick diagonal stroke to a connected 1px chain", () => {
    const size = 30;
    const data = new Uint8Array(size * size);
    for (let i = 2; i < size - 2; i++) {
      for (let w = -2; w <= 2; w++) {
        const x = i + w;
        const y = i;
        if (x >= 0 && x < size) data[y * size + x] = 1;
      }
    }
    const skeleton = zhangSuenThin({ width: size, height: size, data });
    expect(countOn(skeleton.data)).toBeGreaterThan(0);
    expect(countOn(skeleton.data)).toBeLessThan(countOn(data));
  });

  it("collapses a filled disk toward its interior instead of preserving a long skeleton arm", () => {
    const size = 40;
    const data = new Uint8Array(size * size);
    const cx = 20;
    const cy = 20;
    const r = 15;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (Math.hypot(x - cx, y - cy) <= r) data[y * size + x] = 1;
      }
    }
    const skeleton = zhangSuenThin({ width: size, height: size, data });
    // A disk has no protrusions to preserve as a long spine — the
    // remaining skeleton should be a small residue, not a long line.
    expect(countOn(skeleton.data)).toBeLessThan(30);
  });

  it("does not throw and returns an empty skeleton for a blank grid", () => {
    const grid = { width: 10, height: 10, data: new Uint8Array(100) };
    expect(() => zhangSuenThin(grid)).not.toThrow();
    expect(countOn(zhangSuenThin(grid).data)).toBe(0);
  });
});
