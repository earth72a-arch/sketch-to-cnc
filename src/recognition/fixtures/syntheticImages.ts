import type { PixelBuffer, RGB } from "../types";

/**
 * SYNTHETIC test fixtures for the Recognition Inspector (Session 2A).
 * These are programmatically rasterized pixel buffers with known ground
 * truth (exact angle, length, color, gaps) — never real Procreate
 * drawings. See CLAUDE.md §9.
 */

export function createBlankBuffer(
  width: number,
  height: number,
  background: RGB = { r: 255, g: 255, b: 255 },
): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    data[o] = background.r;
    data[o + 1] = background.g;
    data[o + 2] = background.b;
    data[o + 3] = 255;
  }
  return { width, height, data };
}

function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

export interface SyntheticLineSpec {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: RGB;
  thicknessPx?: number;
}

/** Draws a straight stroke with a ~1px linear-falloff antialiased edge
 * band when `antialias` is true (deterministic, not real sub-pixel
 * rendering — enough to exercise tolerance-based classification). */
export function drawSyntheticLine(
  buffer: PixelBuffer,
  spec: SyntheticLineSpec,
  options: { antialias?: boolean } = {},
): void {
  const thickness = spec.thicknessPx ?? 3;
  const half = thickness / 2;
  const band = options.antialias ? 1 : 0;
  const minX = Math.max(0, Math.floor(Math.min(spec.x1, spec.x2) - half - band - 1));
  const maxX = Math.min(buffer.width - 1, Math.ceil(Math.max(spec.x1, spec.x2) + half + band + 1));
  const minY = Math.max(0, Math.floor(Math.min(spec.y1, spec.y2) - half - band - 1));
  const maxY = Math.min(buffer.height - 1, Math.ceil(Math.max(spec.y1, spec.y2) + half + band + 1));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const d = distanceToSegment(x + 0.5, y + 0.5, spec.x1, spec.y1, spec.x2, spec.y2);
      const o = (y * buffer.width + x) * 4;
      if (d <= half) {
        buffer.data[o] = spec.color.r;
        buffer.data[o + 1] = spec.color.g;
        buffer.data[o + 2] = spec.color.b;
        buffer.data[o + 3] = 255;
      } else if (band > 0 && d <= half + band) {
        const blend = 1 - (d - half) / band; // 1 at edge of solid core, 0 at outer band
        buffer.data[o] = buffer.data[o] + (spec.color.r - buffer.data[o]) * blend;
        buffer.data[o + 1] = buffer.data[o + 1] + (spec.color.g - buffer.data[o + 1]) * blend;
        buffer.data[o + 2] = buffer.data[o + 2] + (spec.color.b - buffer.data[o + 2]) * blend;
      }
    }
  }
}

export function buildSyntheticLineImage(options: {
  width: number;
  height: number;
  background?: RGB;
  lines: SyntheticLineSpec[];
  antialias?: boolean;
}): PixelBuffer {
  const buffer = createBlankBuffer(options.width, options.height, options.background);
  for (const line of options.lines) {
    drawSyntheticLine(buffer, line, { antialias: options.antialias });
  }
  return buffer;
}

/**
 * Draws a connected polyline (each consecutive pair of points is one
 * stroke segment) — used to build L/T/X-join and frame fixtures for
 * Session 2A.1's touching/crossing-line regression tests. Unlike
 * buildSyntheticLineImage's independent `lines`, these segments are
 * meant to touch/overlap at shared vertices, exercising junction
 * splitting rather than per-segment isolation.
 */
export function drawSyntheticPolyline(
  buffer: PixelBuffer,
  points: Array<{ x: number; y: number }>,
  color: RGB,
  thicknessPx = 3,
): void {
  for (let i = 0; i < points.length - 1; i++) {
    drawSyntheticLine(buffer, {
      x1: points[i].x,
      y1: points[i].y,
      x2: points[i + 1].x,
      y2: points[i + 1].y,
      color,
      thicknessPx,
    });
  }
}

/** Draws a closed rectangle outline (axis-aligned) as one touching stroke
 * network — no junction pixels anywhere, only corner bends, which is
 * exactly the shape that caused Session 2A's "whole cabinet frame
 * rejected as not a line" bug. */
export function drawSyntheticRect(
  buffer: PixelBuffer,
  spec: { x: number; y: number; width: number; height: number; color: RGB; thicknessPx?: number },
): void {
  const { x, y, width, height, color, thicknessPx } = spec;
  drawSyntheticPolyline(
    buffer,
    [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
      { x, y },
    ],
    color,
    thicknessPx,
  );
}

/** Draws a filled disk — an isotropic blob, used to prove the pipeline
 * rejects non-line shapes instead of reporting a fake line through them. */
export function drawSyntheticFilledDisk(
  buffer: PixelBuffer,
  spec: { cx: number; cy: number; radius: number; color: RGB },
): void {
  const minX = Math.max(0, Math.floor(spec.cx - spec.radius));
  const maxX = Math.min(buffer.width - 1, Math.ceil(spec.cx + spec.radius));
  const minY = Math.max(0, Math.floor(spec.cy - spec.radius));
  const maxY = Math.min(buffer.height - 1, Math.ceil(spec.cy + spec.radius));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (Math.hypot(x + 0.5 - spec.cx, y + 0.5 - spec.cy) <= spec.radius) {
        const o = (y * buffer.width + x) * 4;
        buffer.data[o] = spec.color.r;
        buffer.data[o + 1] = spec.color.g;
        buffer.data[o + 2] = spec.color.b;
        buffer.data[o + 3] = 255;
      }
    }
  }
}
