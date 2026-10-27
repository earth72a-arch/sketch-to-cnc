import type { PixelBuffer } from "../../recognition/types";

/**
 * Node-only test support (Session 2B) — encodes a PixelBuffer as a
 * minimal uncompressed 24bpp BMP `Buffer`. NOT used by any browser/App
 * code: in the browser, `tesseractEngine.ts` hands the OCR worker a real
 * `ImageData` directly (no encoding step needed at all). This exists
 * solely so the Node-side integration tests (`*.node.test.ts`) can feed
 * a real, valid image file into the real tesseract.js engine running
 * under plain Node, which only accepts an encoded image buffer there —
 * see the Session 2B final report for why this is necessary to test the
 * actual OCR engine instead of mocking it.
 */
export function encodeBmp(buffer: PixelBuffer): Buffer {
  const { width, height, data } = buffer;
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelArraySize = rowSize * height;
  const fileSize = 54 + pixelArraySize;
  const out = Buffer.alloc(fileSize);

  out.write("BM", 0);
  out.writeUInt32LE(fileSize, 2);
  out.writeUInt32LE(54, 10);
  out.writeUInt32LE(40, 14);
  out.writeInt32LE(width, 18);
  out.writeInt32LE(height, 22); // positive height = bottom-up row order
  out.writeUInt16LE(1, 26);
  out.writeUInt16LE(24, 28);
  out.writeUInt32LE(0, 30);
  out.writeUInt32LE(pixelArraySize, 34);

  for (let y = 0; y < height; y++) {
    const srcY = height - 1 - y; // BMP stores rows bottom-up
    const rowOffset = 54 + y * rowSize;
    for (let x = 0; x < width; x++) {
      const srcOffset = (srcY * width + x) * 4;
      const dstOffset = rowOffset + x * 3;
      out[dstOffset] = data[srcOffset + 2]; // B
      out[dstOffset + 1] = data[srcOffset + 1]; // G
      out[dstOffset + 2] = data[srcOffset]; // R
    }
  }

  return out;
}
