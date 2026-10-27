import type { BinaryGrid } from "./skeleton";

export interface Point2 {
  x: number;
  y: number;
}

export interface SkeletonChain {
  points: Point2[];
  /** True when this chain is a closed loop with no junction/endpoint node
   * anywhere on it (e.g. a plain rectangle outline, every pixel degree
   * 2) — the trace start point was picked arbitrarily rather than being a
   * true graph node. Callers must still split a loop at its own corners
   * via segmentSplit.ts; a loop is never a straight line by itself. */
  isClosedLoop: boolean;
}

/**
 * Connectivity for ONE pixel, under a corrected variant of 8-connectivity:
 * a diagonal neighbor only counts as a distinct connection when NEITHER
 * of its two bridging orthogonal pixels is present. Plain 8-connectivity
 * (counting every diagonal unconditionally) makes a pixel next to any
 * right-angle corner or junction see a "shortcut" diagonal into the
 * other arm, which inflates its degree and splits one real stroke/corner
 * into several spurious chains — verified against L-join, T-join and
 * X-crossing fixtures, all of which over-fragmented until this rule was
 * added. This is the standard fix for that artifact in skeleton graph
 * extraction, not a project-specific hack.
 */
function effectiveNeighbors(
  data: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
): Point2[] {
  const left = x > 0 && data[y * width + (x - 1)] === 1;
  const right = x < width - 1 && data[y * width + (x + 1)] === 1;
  const up = y > 0 && data[(y - 1) * width + x] === 1;
  const down = y < height - 1 && data[(y + 1) * width + x] === 1;

  const result: Point2[] = [];
  if (left) result.push({ x: x - 1, y });
  if (right) result.push({ x: x + 1, y });
  if (up) result.push({ x, y: y - 1 });
  if (down) result.push({ x, y: y + 1 });

  if (y > 0 && x > 0 && !up && !left && data[(y - 1) * width + (x - 1)] === 1) {
    result.push({ x: x - 1, y: y - 1 });
  }
  if (y > 0 && x < width - 1 && !up && !right && data[(y - 1) * width + (x + 1)] === 1) {
    result.push({ x: x + 1, y: y - 1 });
  }
  if (y < height - 1 && x > 0 && !down && !left && data[(y + 1) * width + (x - 1)] === 1) {
    result.push({ x: x - 1, y: y + 1 });
  }
  if (y < height - 1 && x < width - 1 && !down && !right && data[(y + 1) * width + (x + 1)] === 1) {
    result.push({ x: x + 1, y: y + 1 });
  }

  return result;
}

/**
 * Decomposes a 1px skeleton into traceable chains between graph nodes
 * (endpoints: degree 1, junctions: degree >= 3). A stroke network with no
 * such node anywhere (e.g. a closed rectangle outline, every pixel degree
 * 2) is traced as a single closed loop starting from an arbitrary pixel.
 * This never decides what is "straight" — see segmentSplit.ts for that;
 * this module only answers "what is topologically one connected run."
 */
export function traceSkeletonChains(skeleton: BinaryGrid): SkeletonChain[] {
  const { width, height, data } = skeleton;
  const total = width * height;
  const degree = new Uint8Array(total);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!data[idx]) continue;
      degree[idx] = effectiveNeighbors(data, width, height, x, y).length;
    }
  }

  const consumed = new Set<string>();
  function edgeKey(ax: number, ay: number, bx: number, by: number): string {
    const aIdx = ay * width + ax;
    const bIdx = by * width + bx;
    return aIdx < bIdx ? `${aIdx}:${bIdx}` : `${bIdx}:${aIdx}`;
  }

  const maxSteps = total * 4;

  function walkChain(startX: number, startY: number, firstX: number, firstY: number): Point2[] {
    const points: Point2[] = [{ x: startX, y: startY }];
    let prevX = startX;
    let prevY = startY;
    let curX = firstX;
    let curY = firstY;
    consumed.add(edgeKey(prevX, prevY, curX, curY));
    points.push({ x: curX, y: curY });

    let steps = 0;
    while (curX !== startX || curY !== startY) {
      if (++steps > maxSteps) break; // defensive: never hang on a malformed skeleton
      const idx = curY * width + curX;
      if (degree[idx] !== 2) break; // reached a node (endpoint/junction)

      const neighbors = effectiveNeighbors(data, width, height, curX, curY);
      const next = neighbors.find((p) => !(p.x === prevX && p.y === prevY));
      if (!next) break;

      consumed.add(edgeKey(curX, curY, next.x, next.y));
      points.push({ x: next.x, y: next.y });
      prevX = curX;
      prevY = curY;
      curX = next.x;
      curY = next.y;
    }

    return points;
  }

  const chains: SkeletonChain[] = [];

  // Pass 1: trace every chain that starts at a true node (endpoint or
  // junction), in every not-yet-consumed direction out of that node.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!data[idx]) continue;
      const d = degree[idx];
      if (d !== 1 && d < 3) continue;

      for (const n of effectiveNeighbors(data, width, height, x, y)) {
        if (consumed.has(edgeKey(x, y, n.x, n.y))) continue;
        chains.push({ points: walkChain(x, y, n.x, n.y), isClosedLoop: false });
      }
    }
  }

  // Pass 2: whatever ink remains is pure degree-2 pixels forming closed
  // loops with no node at all — trace each unvisited loop from an
  // arbitrary start pixel back around to itself.
  const loopVisited = new Uint8Array(total);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!data[idx] || loopVisited[idx] || degree[idx] !== 2) continue;

      const neighbors = effectiveNeighbors(data, width, height, x, y);
      const alreadyConsumed = neighbors.some((n) => consumed.has(edgeKey(x, y, n.x, n.y)));
      if (alreadyConsumed || neighbors.length === 0) continue;

      const points = walkChain(x, y, neighbors[0].x, neighbors[0].y);
      for (const p of points) loopVisited[p.y * width + p.x] = 1;
      chains.push({ points, isClosedLoop: true });
    }
  }

  return chains;
}
