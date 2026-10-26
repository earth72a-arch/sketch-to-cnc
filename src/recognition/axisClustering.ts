import type { AxisClusteringResult, AxisGroupIndex } from "./types";

export interface AxisClusterInput {
  angleDeg: number;
  weight: number;
}

const MIN_LINES_TO_CLUSTER = 3;
const SEED_MIN_SEPARATION_DEG = 15;
const MAX_ITERATIONS = 20;
const DEFAULT_MAX_ASSIGN_DELTA_DEG = 20;

function circDistMod180(a: number, b: number): number {
  const diff = Math.abs(a - b) % 180;
  return Math.min(diff, 180 - diff);
}

/** Mean of axial (undirected, mod-180) angle data: double the angle to
 * map the 180°-periodic axis onto a full circle, average as vectors, then
 * halve the result back. Standard trick for orientation/axis statistics. */
function circularMeanMod180(angles: number[], weights: number[]): number {
  let sumCos = 0;
  let sumSin = 0;
  for (let i = 0; i < angles.length; i++) {
    const rad2 = (angles[i] * Math.PI) / 90; // *2 then to radians
    sumCos += weights[i] * Math.cos(rad2);
    sumSin += weights[i] * Math.sin(rad2);
  }
  const meanRad2 = Math.atan2(sumSin, sumCos);
  let meanDeg = (meanRad2 * 180) / Math.PI / 2;
  meanDeg = ((meanDeg % 180) + 180) % 180;
  return meanDeg;
}

/** Greedily picks up to 3 well-separated, high-weight angle bins as
 * initial cluster seeds, estimated FROM the actual data rather than
 * assumed at fixed 0/60/120 — isometric sketches are hand-drawn and won't
 * land on exact angles. */
function seedCentroids(inputs: AxisClusterInput[]): number[] {
  const bins = new Array<number>(180).fill(0);
  for (const { angleDeg, weight } of inputs) {
    const bin = Math.min(179, Math.max(0, Math.round(angleDeg)));
    bins[bin] += weight;
  }
  const order = [...bins.keys()].sort((a, b) => bins[b] - bins[a]);

  const seeds: number[] = [];
  for (const bin of order) {
    if (bins[bin] <= 0) break;
    if (seeds.every((s) => circDistMod180(s, bin) >= SEED_MIN_SEPARATION_DEG)) {
      seeds.push(bin);
    }
    if (seeds.length === 3) break;
  }
  // Not enough well-separated peaks (e.g. the drawing only really has one
  // or two distinct directions) — pad with the remaining best bins so
  // k-means still has 3 starting points to work with.
  for (const bin of order) {
    if (seeds.length === 3) break;
    if (!seeds.includes(bin)) seeds.push(bin);
  }
  return seeds;
}

export function clusterAxes(
  inputs: AxisClusterInput[],
  maxAssignDeltaDeg: number = DEFAULT_MAX_ASSIGN_DELTA_DEG,
): AxisClusteringResult {
  if (inputs.length < MIN_LINES_TO_CLUSTER) {
    return {
      axisCentroidsDeg: null,
      assignments: inputs.map(() => null),
      reason: `พบเส้นที่ตรวจจับได้เพียง ${inputs.length} เส้น — ต้องการอย่างน้อย ${MIN_LINES_TO_CLUSTER} เส้นจึงจะประเมินแนวแกน ISO ทั้งสามกลุ่มได้ ไม่สร้างแนวแกนปลอม`,
    };
  }

  let centroids = seedCentroids(inputs);
  let assignment: number[] = inputs.map(() => 0);

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let changed = false;
    for (let i = 0; i < inputs.length; i++) {
      let best = 0;
      let bestDist = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const dist = circDistMod180(inputs[i].angleDeg, centroids[c]);
        if (dist < bestDist) {
          bestDist = dist;
          best = c;
        }
      }
      if (assignment[i] !== best) changed = true;
      assignment[i] = best;
    }

    const nextCentroids = centroids.map((c, idx) => {
      const members = inputs.filter((_, i) => assignment[i] === idx);
      if (members.length === 0) return c;
      return circularMeanMod180(
        members.map((m) => m.angleDeg),
        members.map((m) => m.weight),
      );
    });
    centroids = nextCentroids;

    if (!changed) break;
  }

  const finalAssignments: (AxisGroupIndex | null)[] = inputs.map((input) => {
    let best: AxisGroupIndex = 0;
    let bestDist = Infinity;
    for (let c = 0; c < centroids.length; c++) {
      const dist = circDistMod180(input.angleDeg, centroids[c]);
      if (dist < bestDist) {
        bestDist = dist;
        best = c as AxisGroupIndex;
      }
    }
    return bestDist <= maxAssignDeltaDeg ? best : null;
  });

  return {
    axisCentroidsDeg: [centroids[0], centroids[1], centroids[2]],
    assignments: finalAssignments,
    reason: null,
  };
}
