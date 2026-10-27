import { describe, expect, it } from "vitest";
import { traceSkeletonChains } from "./skeletonGraph";

function gridFromPixels(width: number, height: number, onPixels: Array<[number, number]>) {
  const data = new Uint8Array(width * height);
  for (const [x, y] of onPixels) data[y * width + x] = 1;
  return { width, height, data };
}

describe("traceSkeletonChains", () => {
  it("traces a single straight line as one open chain with both endpoints", () => {
    const pixels: Array<[number, number]> = [];
    for (let x = 2; x <= 10; x++) pixels.push([x, 5]);
    const grid = gridFromPixels(13, 11, pixels);

    const chains = traceSkeletonChains(grid);
    expect(chains).toHaveLength(1);
    expect(chains[0].isClosedLoop).toBe(false);
    expect(chains[0].points).toHaveLength(9);
  });

  it("traces an L-shaped bend as a single open chain (no junction, just a corner)", () => {
    const pixels: Array<[number, number]> = [];
    for (let x = 2; x <= 8; x++) pixels.push([x, 2]);
    for (let y = 2; y <= 8; y++) pixels.push([8, y]);
    const grid = gridFromPixels(12, 12, pixels);

    const chains = traceSkeletonChains(grid);
    expect(chains).toHaveLength(1);
    expect(chains[0].isClosedLoop).toBe(false);
  });

  it("splits a T-junction into three chains radiating from the junction pixel", () => {
    const pixels: Array<[number, number]> = [];
    for (let x = 0; x <= 10; x++) pixels.push([x, 5]); // horizontal bar
    for (let y = 5; y <= 10; y++) pixels.push([5, y]); // stem down from the middle
    const grid = gridFromPixels(11, 11, pixels);

    const chains = traceSkeletonChains(grid);
    expect(chains).toHaveLength(3);
    for (const chain of chains) expect(chain.isClosedLoop).toBe(false);
  });

  it("splits an X-crossing into four chains radiating from the crossing pixel", () => {
    const pixels: Array<[number, number]> = [];
    for (let x = 0; x <= 10; x++) pixels.push([x, 5]);
    for (let y = 0; y <= 10; y++) pixels.push([5, y]);
    const grid = gridFromPixels(11, 11, pixels);

    const chains = traceSkeletonChains(grid);
    expect(chains).toHaveLength(4);
  });

  it("traces a closed rectangle outline (no junction anywhere) as one closed loop", () => {
    const pixels: Array<[number, number]> = [];
    for (let x = 0; x <= 10; x++) {
      pixels.push([x, 0]);
      pixels.push([x, 10]);
    }
    for (let y = 0; y <= 10; y++) {
      pixels.push([0, y]);
      pixels.push([10, y]);
    }
    const grid = gridFromPixels(11, 11, pixels);

    const chains = traceSkeletonChains(grid);
    expect(chains).toHaveLength(1);
    expect(chains[0].isClosedLoop).toBe(true);
    // 40 distinct perimeter pixels, traced back around to the start
    // pixel (which therefore appears once at each end of the array).
    expect(chains[0].points.length).toBeGreaterThanOrEqual(40);
  });

  it("returns no chains for an empty skeleton", () => {
    const grid = gridFromPixels(5, 5, []);
    expect(traceSkeletonChains(grid)).toHaveLength(0);
  });

  it("ignores an isolated single pixel (degree 0, not a traceable chain)", () => {
    const grid = gridFromPixels(5, 5, [[2, 2]]);
    expect(traceSkeletonChains(grid)).toHaveLength(0);
  });
});
