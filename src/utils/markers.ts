import type { Point, Region } from "../types/project";
import { distanceBetween } from "./viewerMath";

/** Fixed-size marker footprint, in original-image pixels, used to store a
 * single tapped reference point as a Region (the schema already has a
 * Region-shaped annotation slot — this reuses it instead of introducing a
 * second, parallel point-storage concept). */
export const MARKER_REGION_SIZE = 24;

export function pointToMarkerRegion(point: Point): Region {
  const half = MARKER_REGION_SIZE / 2;
  return { x: point.x - half, y: point.y - half, width: MARKER_REGION_SIZE, height: MARKER_REGION_SIZE };
}

export function markerRegionCenter(region: Region): Point {
  return { x: region.x + region.width / 2, y: region.y + region.height / 2 };
}

export interface MarkerLike {
  id: string;
  point: Point;
}

/** Finds the nearest marker to `tapPoint` within `toleranceImagePx`, or
 * null if none qualify. Used to turn a one-finger tap into "open the
 * dimension this marker belongs to" without any line/geometry detection —
 * purely a distance check against explicitly placed marker points. */
export function findNearestMarker<T extends MarkerLike>(
  markers: T[],
  tapPoint: Point,
  toleranceImagePx: number,
): T | null {
  let best: T | null = null;
  let bestDistance = Infinity;
  for (const marker of markers) {
    const d = distanceBetween(marker.point, tapPoint);
    if (d <= toleranceImagePx && d < bestDistance) {
      best = marker;
      bestDistance = d;
    }
  }
  return best;
}
