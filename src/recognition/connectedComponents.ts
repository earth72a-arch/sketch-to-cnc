import type { ComponentStats } from "./types";

function newStats(): ComponentStats {
  return {
    count: 0,
    sumX: 0,
    sumY: 0,
    sumXX: 0,
    sumYY: 0,
    sumXY: 0,
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
}

function accumulate(stats: ComponentStats, x: number, y: number): void {
  stats.count++;
  stats.sumX += x;
  stats.sumY += y;
  stats.sumXX += x * x;
  stats.sumYY += y * y;
  stats.sumXY += x * y;
  if (x < stats.minX) stats.minX = x;
  if (x > stats.maxX) stats.maxX = x;
  if (y < stats.minY) stats.minY = y;
  if (y > stats.maxY) stats.maxY = y;
}

/**
 * 8-connected component labeling that accumulates only the sufficient
 * statistics needed for PCA line-fitting (count + first/second moments +
 * bounding box) rather than storing every member pixel. This keeps memory
 * O(componentCount) instead of O(inkPixelCount), which matters for "large
 * image handling" — a 4000x3000 sketch can have millions of ink pixels but
 * only hundreds of strokes.
 */
export function extractRawComponents(
  mask: Uint8Array,
  width: number,
  height: number,
): ComponentStats[] {
  const visited = new Uint8Array(mask.length);
  const components: ComponentStats[] = [];
  const stack: number[] = [];

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || visited[start]) continue;
    visited[start] = 1;
    stack.push(start);
    const stats = newStats();

    while (stack.length > 0) {
      const idx = stack.pop()!;
      const x = idx % width;
      const y = (idx - x) / width;
      accumulate(stats, x, y);

      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const nIdx = ny * width + nx;
          if (mask[nIdx] && !visited[nIdx]) {
            visited[nIdx] = 1;
            stack.push(nIdx);
          }
        }
      }
    }

    components.push(stats);
  }

  return components;
}

function expandedBoxesOverlap(a: ComponentStats, b: ComponentStats, gapPx: number): boolean {
  const half = gapPx / 2;
  return !(
    a.maxX + half < b.minX - half ||
    b.maxX + half < a.minX - half ||
    a.maxY + half < b.minY - half ||
    b.maxY + half < a.minY - half
  );
}

function mergeStats(a: ComponentStats, b: ComponentStats): ComponentStats {
  return {
    count: a.count + b.count,
    sumX: a.sumX + b.sumX,
    sumY: a.sumY + b.sumY,
    sumXX: a.sumXX + b.sumXX,
    sumYY: a.sumYY + b.sumYY,
    sumXY: a.sumXY + b.sumXY,
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

/**
 * Bridges small gaps (e.g. a stroke with a 1-2px break) by merging
 * components whose bounding boxes — each expanded by gapPx/2 — overlap.
 * This is a bounding-box approximation, not an exact nearest-pixel-
 * distance test: two separate nearby strokes that aren't actually a
 * broken single line can still get merged if their boxes happen to
 * overlap once expanded. Documented as a known limitation; acceptable for
 * a visual debug inspector, not for anything safety- or spec-critical.
 */
export function mergeNearbyComponents(
  components: ComponentStats[],
  gapPx: number,
): ComponentStats[] {
  if (gapPx <= 0 || components.length <= 1) return components;

  const parent = components.map((_, i) => i);
  function find(i: number): number {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  }
  function union(i: number, j: number): void {
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) parent[ri] = rj;
  }

  for (let i = 0; i < components.length; i++) {
    for (let j = i + 1; j < components.length; j++) {
      if (expandedBoxesOverlap(components[i], components[j], gapPx)) union(i, j);
    }
  }

  const groups = new Map<number, ComponentStats>();
  for (let i = 0; i < components.length; i++) {
    const root = find(i);
    const existing = groups.get(root);
    groups.set(root, existing ? mergeStats(existing, components[i]) : { ...components[i] });
  }
  return [...groups.values()];
}

/** Minimum pixel count to even consider a component — drops single/double
 * stray pixels before the O(n^2) gap-merge pass so pathologically noisy
 * images don't blow up merge time. */
const MIN_COMPONENT_PIXELS = 2;

export function extractComponents(
  mask: Uint8Array,
  width: number,
  height: number,
  gapPx = 0,
): ComponentStats[] {
  const raw = extractRawComponents(mask, width, height).filter(
    (c) => c.count >= MIN_COMPONENT_PIXELS,
  );
  return mergeNearbyComponents(raw, gapPx);
}
