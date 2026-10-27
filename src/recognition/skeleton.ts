export interface BinaryGrid {
  width: number;
  height: number;
  /** 1 = ink/skeleton pixel, 0 = background. Row-major, one byte per pixel. */
  data: Uint8Array;
}

export interface PixelRegion {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Crops a full-size category mask to a local grid covering `region`
 * expanded by `marginPx` on every side (clamped to image bounds). The
 * margin exists so thinning/dilation near the region edge isn't starved
 * of context by an artificial hard boundary.
 */
export function cropMaskToGrid(
  mask: Uint8Array,
  width: number,
  height: number,
  region: PixelRegion,
  marginPx: number,
): { grid: BinaryGrid; offsetX: number; offsetY: number } {
  const minX = Math.max(0, Math.floor(region.minX) - marginPx);
  const minY = Math.max(0, Math.floor(region.minY) - marginPx);
  const maxX = Math.min(width - 1, Math.ceil(region.maxX) + marginPx);
  const maxY = Math.min(height - 1, Math.ceil(region.maxY) + marginPx);
  const gridWidth = Math.max(1, maxX - minX + 1);
  const gridHeight = Math.max(1, maxY - minY + 1);
  const data = new Uint8Array(gridWidth * gridHeight);

  for (let y = minY; y <= maxY; y++) {
    const srcRowOffset = y * width;
    const dstRowOffset = (y - minY) * gridWidth;
    for (let x = minX; x <= maxX; x++) {
      data[dstRowOffset + (x - minX)] = mask[srcRowOffset + x];
    }
  }

  return { grid: { width: gridWidth, height: gridHeight, data }, offsetX: minX, offsetY: minY };
}

/**
 * Binary dilation by Chebyshev radius `radiusPx` — bridges a small
 * pen-lift gap (a few px) into one continuous blob before thinning. The
 * radius must stay well below the real spacing between genuinely distinct
 * parallel strokes, or two separate strokes get fused into one; this is
 * the pixel-level analogue of the bounding-box-overlap caveat already
 * documented in connectedComponents.ts, just far less prone to false
 * merges because it tests actual ink proximity instead of bbox proximity.
 */
export function dilateGrid(grid: BinaryGrid, radiusPx: number): BinaryGrid {
  if (radiusPx <= 0) return grid;
  const { width, height, data } = grid;
  const out = new Uint8Array(data.length);
  const r = Math.ceil(radiusPx);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!data[y * width + x]) continue;
      const minX = Math.max(0, x - r);
      const maxX = Math.min(width - 1, x + r);
      const minY = Math.max(0, y - r);
      const maxY = Math.min(height - 1, y + r);
      for (let ny = minY; ny <= maxY; ny++) {
        const rowOffset = ny * width;
        for (let nx = minX; nx <= maxX; nx++) {
          out[rowOffset + nx] = 1;
        }
      }
    }
  }
  return { width, height, data: out };
}

/**
 * Zhang-Suen thinning: iteratively erodes a binary blob to a 1px-wide
 * skeleton while preserving connectivity and endpoints. Deterministic, no
 * AI/ML. Picked over a generic Hough transform because downstream segment
 * extraction needs an explicit, ordered pixel chain per stroke (a
 * skeleton graph), not just an angle/offset vote; it also normalizes
 * variable stroke thickness to a single centerline for free, which a
 * Hough accumulator does not do without extra weighting logic.
 */
export function zhangSuenThin(grid: BinaryGrid, maxIterations = 60): BinaryGrid {
  const { width, height } = grid;
  const data = grid.data.slice();

  function at(x: number, y: number): number {
    if (x < 0 || x >= width || y < 0 || y >= height) return 0;
    return data[y * width + x];
  }

  for (let iter = 0; iter < maxIterations; iter++) {
    let changedAny = false;

    for (const step of [1, 2] as const) {
      const toClear: number[] = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          if (!data[idx]) continue;

          const p2 = at(x, y - 1);
          const p3 = at(x + 1, y - 1);
          const p4 = at(x + 1, y);
          const p5 = at(x + 1, y + 1);
          const p6 = at(x, y + 1);
          const p7 = at(x - 1, y + 1);
          const p8 = at(x - 1, y);
          const p9 = at(x - 1, y - 1);
          const neighbors = [p2, p3, p4, p5, p6, p7, p8, p9];

          let b = 0;
          for (const v of neighbors) b += v;
          if (b < 2 || b > 6) continue;

          let a = 0;
          for (let i = 0; i < 8; i++) {
            if (neighbors[i] === 0 && neighbors[(i + 1) % 8] === 1) a++;
          }
          if (a !== 1) continue;

          if (step === 1) {
            if (p2 * p4 * p6 !== 0) continue;
            if (p4 * p6 * p8 !== 0) continue;
          } else {
            if (p2 * p4 * p8 !== 0) continue;
            if (p2 * p6 * p8 !== 0) continue;
          }

          toClear.push(idx);
        }
      }
      if (toClear.length > 0) {
        changedAny = true;
        for (const idx of toClear) data[idx] = 0;
      }
    }

    if (!changedAny) break;
  }

  return { width, height, data };
}
