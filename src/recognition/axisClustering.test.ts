import { describe, expect, it } from "vitest";
import { clusterAxes } from "./axisClustering";

describe("clusterAxes — empirical ISO axis estimation", () => {
  it("returns an empty result with a reason when there are too few lines to cluster", () => {
    const result = clusterAxes([{ angleDeg: 10, weight: 50 }]);
    expect(result.axisCentroidsDeg).toBeNull();
    expect(result.assignments).toEqual([null]);
    expect(result.reason).toBeTruthy();
  });

  it("finds three axis groups near their true (non-canonical) angles, estimated FROM the data", () => {
    // Deliberately NOT 0/60/120 — proves the axes are estimated from the
    // actual drawing, not assumed.
    const trueAngles = [12, 74, 138];
    const inputs = trueAngles.flatMap((base) =>
      [-1, 0, 1].map((jitter) => ({ angleDeg: base + jitter, weight: 40 })),
    );

    const result = clusterAxes(inputs);
    expect(result.axisCentroidsDeg).not.toBeNull();
    expect(result.reason).toBeNull();

    const centroids = result.axisCentroidsDeg!;
    for (const trueAngle of trueAngles) {
      const closest = Math.min(
        ...centroids.map((c) => Math.min(Math.abs(c - trueAngle), 180 - Math.abs(c - trueAngle))),
      );
      expect(closest).toBeLessThan(5);
    }

    // Every jittered input line should have been assigned to SOME axis.
    expect(result.assignments.every((a) => a !== null)).toBe(true);
  });

  it("marks a clear outlier line as unclassified axis rather than forcing it into a group", () => {
    const trueAngles = [0, 60, 120];
    const inputs = trueAngles.flatMap((base) =>
      [-1, 0, 1].map((jitter) => ({ angleDeg: base + jitter, weight: 40 })),
    );
    inputs.push({ angleDeg: 30, weight: 40 }); // exactly between 0 and 60 — ambiguous outlier

    const result = clusterAxes(inputs, 10); // tight 10deg threshold
    const outlierAssignment = result.assignments[result.assignments.length - 1];
    expect(outlierAssignment).toBeNull();
  });

  it("never fabricates a centroid for zero input lines", () => {
    const result = clusterAxes([]);
    expect(result.axisCentroidsDeg).toBeNull();
    expect(result.assignments).toEqual([]);
    expect(result.reason).toBeTruthy();
  });
});
