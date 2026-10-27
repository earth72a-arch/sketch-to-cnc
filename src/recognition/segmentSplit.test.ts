import { describe, expect, it } from "vitest";
import { splitChainIntoStraightRuns } from "./segmentSplit";
import type { Point2 } from "./skeletonGraph";

function straightChain(x1: number, y1: number, x2: number, y2: number): Point2[] {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  const points: Point2[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push({ x: Math.round(x1 + (x2 - x1) * t), y: Math.round(y1 + (y2 - y1) * t) });
  }
  return points;
}

describe("splitChainIntoStraightRuns", () => {
  it("keeps a perfectly straight chain as a single run", () => {
    const chain = straightChain(0, 0, 20, 0);
    const runs = splitChainIntoStraightRuns(chain, 1.5, 4);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toHaveLength(chain.length);
  });

  it("splits a 90-degree L-bend into exactly two straight runs", () => {
    const chain = [...straightChain(0, 0, 20, 0), ...straightChain(20, 1, 20, 20)];
    const runs = splitChainIntoStraightRuns(chain, 1.5, 4);
    expect(runs).toHaveLength(2);
  });

  it("splits a rectangle-perimeter chain into four runs at its corners", () => {
    const chain = [
      ...straightChain(0, 0, 30, 0),
      ...straightChain(30, 1, 30, 20),
      ...straightChain(29, 20, 0, 20),
      ...straightChain(0, 19, 0, 1),
    ];
    const runs = splitChainIntoStraightRuns(chain, 1.5, 4);
    expect(runs.length).toBeGreaterThanOrEqual(4);
  });

  it("does not split a chain shorter than minRunPoints regardless of shape", () => {
    const chain: Point2[] = [{ x: 0, y: 0 }, { x: 1, y: 5 }, { x: 2, y: 0 }];
    const runs = splitChainIntoStraightRuns(chain, 1.5, 4);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toHaveLength(3);
  });

  it("returns an empty array for an empty chain", () => {
    expect(splitChainIntoStraightRuns([], 1.5, 4)).toHaveLength(0);
  });

  it("tolerates small pixel-grid noise without over-splitting a near-straight chain", () => {
    const chain: Point2[] = [];
    for (let x = 0; x <= 30; x++) {
      // +/- 1px jitter, within the deviation tolerance
      chain.push({ x, y: x % 4 === 0 ? 1 : 0 });
    }
    const runs = splitChainIntoStraightRuns(chain, 1.5, 4);
    expect(runs).toHaveLength(1);
  });
});
