import type { PixelBuffer } from "./types";

/**
 * Browser-only glue: decode an image URL into a plain PixelBuffer via an
 * offscreen canvas. Deliberately kept to this one function — everything
 * downstream (colorClassify, connectedComponents, lineFit, axisClustering,
 * pipeline) is pure and unit-tested without a canvas. This function itself
 * is not unit-tested (no canvas in this project's test environment by
 * design — see CLAUDE.md §7 "lightweight dependencies").
 */
export async function loadPixelBufferFromUrl(url: string): Promise<PixelBuffer> {
  const img = new Image();
  img.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("ไม่สามารถอ่านไฟล์ภาพสำหรับการตรวจจับได้"));
    img.src = url;
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("เบราว์เซอร์นี้ไม่รองรับ Canvas 2D context");
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width: imageData.width, height: imageData.height, data: imageData.data };
}
