import { describe, expect, it } from "vitest";
import { extractComponents, extractRawComponents, mergeNearbyComponents } from "./connectedComponents";

function maskFromPixels(width: number, height: number, onPixels: Array<[number, number]>): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (const [x, y] of onPixels) mask[y * width + x] = 1;
  return mask;
}

describe("extractRawComponents — strict 8-connected labeling", () => {
  it("finds a single component for a contiguous blob", () => {
    const mask = maskFromPixels(5, 5, [
      [1, 1],
      [2, 1],
      [1, 2],
      [2, 2],
    ]);
    const components = extractRawComponents(mask, 5, 5);
    expect(components).toHaveLength(1);
    expect(components[0].count).toBe(4);
  });

  it("8-connectivity treats diagonal touches as connected", () => {
    const mask = maskFromPixels(5, 5, [
      [0, 0],
      [1, 1],
    ]);
    expect(extractRawComponents(mask, 5, 5)).toHaveLength(1);
  });

  it("finds two separate components for two disjoint pixel groups", () => {
    const mask = maskFromPixels(10, 10, [
      [0, 0],
      [1, 0],
      [8, 8],
      [9, 8],
    ]);
    expect(extractRawComponents(mask, 10, 10)).toHaveLength(2);
  });

  it("returns no components for an empty mask", () => {
    const mask = new Uint8Array(100);
    expect(extractRawComponents(mask, 10, 10)).toHaveLength(0);
  });
});

describe("mergeNearbyComponents / extractComponents — small-gap bridging", () => {
  it("bridges a stroke broken by a small gap into one component", () => {
    // A horizontal line from x=0..9 at y=5, then a 3px gap, then x=13..19.
    const pixels: Array<[number, number]> = [];
    for (let x = 0; x <= 9; x++) pixels.push([x, 5]);
    for (let x = 13; x <= 19; x++) pixels.push([x, 5]);
    const mask = maskFromPixels(30, 10, pixels);

    const withoutBridging = extractComponents(mask, 30, 10, 0);
    expect(withoutBridging).toHaveLength(2);

    const withBridging = extractComponents(mask, 30, 10, 4);
    expect(withBridging).toHaveLength(1);
    expect(withBridging[0].count).toBe(pixels.length);
  });

  it("does NOT bridge components farther apart than the gap tolerance", () => {
    const pixels: Array<[number, number]> = [];
    for (let x = 0; x <= 5; x++) pixels.push([x, 5]);
    for (let x = 25; x <= 30; x++) pixels.push([x, 5]);
    const mask = maskFromPixels(40, 10, pixels);

    const result = extractComponents(mask, 40, 10, 4);
    expect(result).toHaveLength(2);
  });

  it("is a no-op when gapPx is 0", () => {
    const components = [
      { count: 1, sumX: 0, sumY: 0, sumXX: 0, sumYY: 0, sumXY: 0, minX: 0, maxX: 0, minY: 0, maxY: 0 },
      { count: 1, sumX: 5, sumY: 0, sumXX: 25, sumYY: 0, sumXY: 0, minX: 5, maxX: 5, minY: 0, maxY: 0 },
    ];
    expect(mergeNearbyComponents(components, 0)).toEqual(components);
  });
});
