import { COLOR_CATEGORIES } from "./types";
import type { FittedLine, Palette, PixelBuffer, RecognitionResult } from "./types";
import { classifyPixels, type ClassifyOptions } from "./colorClassify";
import { extractComponents } from "./connectedComponents";
import { lineEndpoints } from "./lineFit";
import { clusterAxes } from "./axisClustering";
import { extractSegmentsFromComponent } from "./segmentExtraction";

export interface RecognitionOptions extends ClassifyOptions {
  /** Max pixel gap bridged when grouping a broken stroke into one line. */
  gapPx: number;
  /** Minimum straightness (0..1) to accept a segment as a line. */
  minLinearity: number;
  /** Minimum estimated pixel length to accept a segment as a line. */
  minLengthPx: number;
  /** Minimum skeleton-chain point count to accept a segment as a line. */
  minPixelCount: number;
  /** Max degrees from an axis centroid to still assign a line to it. */
  maxAxisAssignDeltaDeg: number;
  /** Max perpendicular pixel deviation before a skeleton chain is split
   * at a bend (corner/crossing without an explicit branch pixel — e.g.
   * an L-join, or one side of a closed rectangle outline). */
  maxBendDeviationPx: number;
  /** Crop margin (source-image px) added around a component's bounding
   * box before thinning, so thinning near the box edge has context. */
  componentMarginPx: number;
}

export const DEFAULT_RECOGNITION_OPTIONS: RecognitionOptions = {
  gapPx: 3,
  minLinearity: 0.8,
  minLengthPx: 8,
  minPixelCount: 5,
  maxAxisAssignDeltaDeg: 20,
  maxBendDeviationPx: 1.5,
  componentMarginPx: 4,
};

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/**
 * Full deterministic recognition pipeline: color classify → per-category
 * connected components (coarse grouping + small-gap bridging) → per
 * component: skeletonize and decompose into individual straight edges
 * (see segmentExtraction.ts — this is what lets a touching/crossing
 * stroke network, like a cabinet frame, yield several correct line
 * segments instead of being rejected whole) → ISO axis clustering. No
 * AI, no OCR, no inference of real-world size or component existence —
 * see CLAUDE.md §3/§4. If nothing qualifies as a line, the result has an
 * empty `lines` array and a human-readable `axisClustering.reason`; it
 * never fabricates a line or an axis.
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
  const bridgeRadiusPx = Math.ceil(opts.gapPx / 2);

  for (const category of COLOR_CATEGORIES) {
    const mask = classification.masks[category];
    const components = extractComponents(mask, buffer.width, buffer.height, opts.gapPx);

    for (const component of components) {
      const { segments, rejectedCount } = extractSegmentsFromComponent(
        mask,
        buffer.width,
        buffer.height,
        component,
        {
          bridgeRadiusPx,
          marginPx: opts.componentMarginPx,
          maxBendDeviationPx: opts.maxBendDeviationPx,
          minLinearity: opts.minLinearity,
          minLengthPx: opts.minLengthPx,
          minPixelCount: opts.minPixelCount,
        },
      );
      rejectedBlobCount += rejectedCount;

      for (const segment of segments) {
        const { start: p1, end: p2 } = lineEndpoints(segment.fit);
        lines.push({
          id: `line-${lineIdCounter++}`,
          category,
          centroid: segment.fit.centroid,
          start: p1,
          end: p2,
          angleDeg: segment.fit.angleDeg,
          lengthPx: segment.fit.lengthPx,
          linearity: segment.fit.linearity,
          pixelCount: segment.pixelCount,
        });
      }
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
