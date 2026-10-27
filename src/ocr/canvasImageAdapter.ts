import type { PixelBuffer } from "../recognition/types";

/**
 * Browser-only glue (Session 2B): turns a pure, in-memory PixelBuffer
 * into an `OffscreenCanvas` tesseract.js can recognize directly — no
 * network fetch, no PNG/BMP encoding, the customer's cropped pixels
 * never leave the page. Mirrors `recognition/imageDataAdapter.ts`'s
 * isolation: this is the only OCR file that touches the DOM/canvas, so
 * it is deliberately NOT unit-tested here (no canvas in this project's
 * test environment by design — see CLAUDE.md §7). The equivalent
 * conversion for Node tests is `testSupport/bmpEncoder.node.ts`, which
 * exercises the same `toImageLike` seam with a real encoded buffer
 * instead.
 */
export function pixelBufferToOffscreenCanvas(buffer: PixelBuffer): OffscreenCanvas {
  const canvas = new OffscreenCanvas(buffer.width, buffer.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("เบราว์เซอร์นี้ไม่รองรับ OffscreenCanvas 2D context");
  const imageData = new ImageData(new Uint8ClampedArray(buffer.data), buffer.width, buffer.height);
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}
