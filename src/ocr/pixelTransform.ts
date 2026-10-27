import type { PixelBuffer } from "../recognition/types";
import type { Region } from "../types/project";

/**
 * Pure pixel-buffer crop + rotate, with no canvas dependency — mirrors
 * the project's existing pattern (`src/recognition/*` is pure/testable;
 * only `imageDataAdapter.ts` touches the DOM, to load the initial
 * PixelBuffer). Keeping OCR region preprocessing pure here means it can
 * run identically in the browser and in a plain Node test (Session 2B
 * spec §11), and lets a Node test exercise the REAL crop/rotate math
 * that production code uses, not a re-implementation of it.
 *
 * Session 2B spec §6: never rotate the whole source image — only the
 * small cropped region actually sent to OCR.
 */

/** Expands `region` by `paddingPx` on every side, clamped to the source
 * image bounds. Original-image pixel coordinates in, same out. */
export function padRegion(region: Region, paddingPx: number, imageWidth: number, imageHeight: number): Region {
  const minX = Math.max(0, Math.floor(region.x) - paddingPx);
  const minY = Math.max(0, Math.floor(region.y) - paddingPx);
  const maxX = Math.min(imageWidth - 1, Math.ceil(region.x + region.width) + paddingPx);
  const maxY = Math.min(imageHeight - 1, Math.ceil(region.y + region.height) + paddingPx);
  return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

/** Crops `buffer` to `region` (clamped to buffer bounds), background
 * (white) filled for any out-of-bounds portion of the request. */
export function cropPixelBuffer(buffer: PixelBuffer, region: Region): PixelBuffer {
  const width = Math.max(1, Math.round(region.width));
  const height = Math.max(1, Math.round(region.height));
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let i = 3; i < data.length; i += 4) data[i] = 255; // opaque white background

  const srcX0 = Math.round(region.x);
  const srcY0 = Math.round(region.y);

  for (let y = 0; y < height; y++) {
    const srcY = srcY0 + y;
    if (srcY < 0 || srcY >= buffer.height) continue;
    for (let x = 0; x < width; x++) {
      const srcX = srcX0 + x;
      if (srcX < 0 || srcX >= buffer.width) continue;
      const srcOffset = (srcY * buffer.width + srcX) * 4;
      const dstOffset = (y * width + x) * 4;
      data[dstOffset] = buffer.data[srcOffset];
      data[dstOffset + 1] = buffer.data[srcOffset + 1];
      data[dstOffset + 2] = buffer.data[srcOffset + 2];
      data[dstOffset + 3] = buffer.data[srcOffset + 3];
    }
  }

  return { width, height, data };
}

/**
 * Rotates a (typically already-cropped, small) PixelBuffer by
 * `angleDeg` about its center, nearest-neighbor sampled, with a white
 * background fill — good enough for OCR preprocessing (text only needs
 * to end up roughly horizontal), and cheap enough to try several
 * orientation candidates per region without a perceptible UI stall.
 */
export function rotatePixelBuffer(buffer: PixelBuffer, angleDeg: number): PixelBuffer {
  if (((angleDeg % 360) + 360) % 360 === 0) return buffer;

  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const corners = [
    { x: 0, y: 0 },
    { x: buffer.width, y: 0 },
    { x: 0, y: buffer.height },
    { x: buffer.width, y: buffer.height },
  ];
  const cx = buffer.width / 2;
  const cy = buffer.height / 2;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of corners) {
    const dx = c.x - cx;
    const dy = c.y - cy;
    const rx = dx * cos - dy * sin;
    const ry = dx * sin + dy * cos;
    minX = Math.min(minX, rx);
    maxX = Math.max(maxX, rx);
    minY = Math.min(minY, ry);
    maxY = Math.max(maxY, ry);
  }

  const outWidth = Math.max(1, Math.round(maxX - minX));
  const outHeight = Math.max(1, Math.round(maxY - minY));
  const data = new Uint8ClampedArray(outWidth * outHeight * 4).fill(255);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;

  const outCx = outWidth / 2;
  const outCy = outHeight / 2;
  // Inverse rotation: for every OUTPUT pixel, find the SOURCE pixel.
  const invCos = Math.cos(-rad);
  const invSin = Math.sin(-rad);

  for (let oy = 0; oy < outHeight; oy++) {
    for (let ox = 0; ox < outWidth; ox++) {
      const dx = ox - outCx;
      const dy = oy - outCy;
      const sx = Math.round(dx * invCos - dy * invSin + cx);
      const sy = Math.round(dx * invSin + dy * invCos + cy);
      if (sx < 0 || sx >= buffer.width || sy < 0 || sy >= buffer.height) continue;
      const srcOffset = (sy * buffer.width + sx) * 4;
      const dstOffset = (oy * outWidth + ox) * 4;
      data[dstOffset] = buffer.data[srcOffset];
      data[dstOffset + 1] = buffer.data[srcOffset + 1];
      data[dstOffset + 2] = buffer.data[srcOffset + 2];
      data[dstOffset + 3] = buffer.data[srcOffset + 3];
    }
  }

  return { width: outWidth, height: outHeight, data };
}

/** Crop (with padding) then rotate in one step — the standard
 * preprocessing path from "a region in the full sketch" to "a small,
 * upright-ish image ready for OCR." */
export function extractOrientedCrop(
  buffer: PixelBuffer,
  region: Region,
  paddingPx: number,
  angleDeg: number,
): PixelBuffer {
  const padded = padRegion(region, paddingPx, buffer.width, buffer.height);
  const cropped = cropPixelBuffer(buffer, padded);
  return rotatePixelBuffer(cropped, angleDeg);
}
