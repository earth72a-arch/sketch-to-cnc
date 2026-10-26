import { COLOR_CATEGORIES } from "./types";
import type { FittedLine, Palette, PixelBuffer, RecognitionResult } from "./types";
import { classifyPixels, type ClassifyOptions } from "./colorClassify";
import { extractComponents } from "./connectedComponents";
import { fitLine, lineEndpoints } from "./lineFit";
import { clusterAxes } from "./axisClustering";

export interface RecognitionOptions extends ClassifyOptions {
  /** Max pixel gap bridged when grouping a broken stroke into one line. */
  gapPx: number;
  /** Minimum straightness (0..1) to accept a component as a line. */
  minLinearity: number;
  /** Minimum estimated pixel length to accept a component as a line. */
  minLengthPx: number;
  /** Minimum ink pixel count to accept a component as a line. */
  minPixelCount: number;
  /** Max degrees from an axis centroid to still assign a line to it. */
  maxAxisAssignDeltaDeg: number;
}

export const DEFAULT_RECOGNITION_OPTIONS: RecognitionOptions = {
  gapPx: 3,
  minLinearity: 0.8,
  minLengthPx: 8,
  minPixelCount: 5,
  maxAxisAssignDeltaDeg: 20,
};

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/**
 * Full deterministic recognition pipeline: color classify → per-category
 * connected components (with small-gap bridging) → PCA line fit → ISO
 * axis clustering. No AI, no OCR, no inference of real-world size or
 * component existence — see CLAUDE.md §3/§4. If nothing qualifies as a
 * line, the result has an empty `lines` array and a human-readable
 * `axisClustering.reason`; it never fabricates a line or an axis.
 */
export function runRecognitionPipeline(
  buffer: PixelBuffer,
  palette: Palette,
  options: Partial<RecognitionOptions> = {},
): RecognitionResult {
  const opts: RecognitionOptions = { ...DEFAULT_RECOGNITION_OPTIONS, ...options };
  const start = now();

  const classification = classifyPixels(buffer, palette, opts);

  const lines: FittedLine[] = [];
  let rejectedBlobCount = 0;
  let lineIdCounter = 0;

  for (const category of COLOR_CATEGORIES) {
    const components = extractComponents(
      classification.masks[category],
      buffer.width,
      buffer.height,
      opts.gapPx,
    );

    for (const component of components) {
      const fit = fitLine(component);
      if (!fit) continue;

      const qualifies =
        component.count >= opts.minPixelCount &&
        fit.linearity >= opts.minLinearity &&
        fit.lengthPx >= opts.minLengthPx;

      if (!qualifies) {
        rejectedBlobCount++;
        continue;
      }

      const { start: p1, end: p2 } = lineEndpoints(fit);
      lines.push({
        id: `line-${lineIdCounter++}`,
        category,
        centroid: fit.centroid,
        start: p1,
        end: p2,
        angleDeg: fit.angleDeg,
        lengthPx: fit.lengthPx,
        linearity: fit.linearity,
        pixelCount: component.count,
      });
    }
  }

  const axisClustering = clusterAxes(
    lines.map((l) => ({ angleDeg: l.angleDeg, weight: l.lengthPx })),
    opts.maxAxisAssignDeltaDeg,
  );

  return {
    width: buffer.width,
    height: buffer.height,
    classification,
    lines,
    rejectedBlobCount,
    axisClustering,
    processingTimeMs: now() - start,
  };
}
