import type { Point } from "../types/project";

/** Pure geometry for the image viewer's zoom/pan transform, kept separate
 * from ImageViewer.tsx so the math is unit-testable without touching the
 * DOM or simulating multi-touch PointerEvents (jsdom does not implement
 * setPointerCapture, so real gesture simulation isn't feasible in tests). */

export interface ViewerTransform {
  scale: number;
  translateX: number;
  translateY: number;
}

export interface ContainerRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function clampScale(
  value: number,
  minScale: number,
  maxScale: number,
): number {
  return Math.min(maxScale, Math.max(minScale, value));
}

/** Scale+center a stage of size (imgW, imgH) to fill (containerW, containerH). */
export function computeFitTransform(
  containerW: number,
  containerH: number,
  imgW: number,
  imgH: number,
): ViewerTransform {
  if (containerW <= 0 || containerH <= 0 || imgW <= 0 || imgH <= 0) {
    return { scale: 1, translateX: 0, translateY: 0 };
  }
  const scale = Math.min(containerW / imgW, containerH / imgH);
  return {
    scale,
    translateX: (containerW - imgW * scale) / 2,
    translateY: (containerH - imgH * scale) / 2,
  };
}

/** Converts a screen-space (client) point to original-image pixel
 * coordinates under the given transform. This is what every annotation /
 * region / marker position must be stored in — never screen coordinates. */
export function screenToImagePoint(
  transform: ViewerTransform,
  rect: ContainerRect,
  clientX: number,
  clientY: number,
): Point {
  return {
    x: (clientX - rect.left - transform.translateX) / transform.scale,
    y: (clientY - rect.top - transform.translateY) / transform.scale,
  };
}

export function imagePointToScreen(
  transform: ViewerTransform,
  rect: ContainerRect,
  point: Point,
): Point {
  return {
    x: rect.left + transform.translateX + point.x * transform.scale,
    y: rect.top + transform.translateY + point.y * transform.scale,
  };
}

/**
 * Computes the next transform so that the image content currently under
 * `anchorClient` (evaluated against `transform`, i.e. BEFORE this update)
 * ends up positioned at `targetClient`, at `nextScale`.
 *
 * Passing anchor === target gives a pure zoom-about-a-point (wheel zoom,
 * button zoom, or a stationary pinch). Passing a target that differs from
 * the anchor adds translation on top of the zoom — this is what makes a
 * two-finger drag pan the image instead of snapping back, which is the
 * bug this function exists to fix: the previous implementation always
 * re-anchored at the *current* pointer position using the *current*
 * pointer position for both lookup and placement, which cancels any
 * translation whenever scale doesn't change.
 */
export function zoomToPoint(
  transform: ViewerTransform,
  rect: ContainerRect,
  anchorClient: Point,
  targetClient: Point,
  nextScaleRaw: number,
  minScale: number,
  maxScale: number,
): ViewerTransform {
  const nextScale = clampScale(nextScaleRaw, minScale, maxScale);
  const imageX = (anchorClient.x - rect.left - transform.translateX) / transform.scale;
  const imageY = (anchorClient.y - rect.top - transform.translateY) / transform.scale;
  return {
    scale: nextScale,
    translateX: targetClient.x - rect.left - imageX * nextScale,
    translateY: targetClient.y - rect.top - imageY * nextScale,
  };
}

/** Pans the transform by a screen-space delta (no scale change). */
export function panByScreenDelta(
  transform: ViewerTransform,
  dx: number,
  dy: number,
): ViewerTransform {
  return {
    ...transform,
    translateX: transform.translateX + dx,
    translateY: transform.translateY + dy,
  };
}

export function distanceBetween(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
