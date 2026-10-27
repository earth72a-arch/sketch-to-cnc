import type { PixelBuffer } from "../recognition/types";
import { extractOrientedCrop } from "./pixelTransform";
import { buildOrientationCandidates } from "./orientationCandidates";
import { parseDimensionText } from "./parseDimensionText";
import { recognizeImage, type TesseractEngineOptions } from "./tesseractEngine";
import { MIN_CONFIDENCE_FOR_READ, type OcrAlternative, type OcrCandidate, type OcrStage, type TextRegionCandidate } from "./types";
import type { CancelToken } from "./withTimeout";
import { generateId } from "../utils/id";
import type Tesseract from "tesseract.js";

export interface RecognizeTextRegionsOptions {
  /** ISO axis estimates from Session 2A.1's `clusterAxes`, if available
   * for this drawing — used as extra orientation candidates. */
  isoAxisCentroidsDeg: readonly number[] | null;
  cropPaddingPx: number;
  sourceImageSha256: string;
  /** Converts a (pure, in-memory) oriented crop into whatever form the
   * REAL tesseract.js engine accepts in the current environment — an
   * OffscreenCanvas in the browser, an encoded BMP Buffer in Node tests.
   * Keeping this injected is what lets the rest of this module stay
   * environment-agnostic and unit-testable (CLAUDE.md §7). */
  toImageLike: (buffer: PixelBuffer) => Tesseract.ImageLike;
  engineOptions?: TesseractEngineOptions;
  /** Confidence gap (percentage points) under which the best and a
   * differently-worded runner-up are BOTH kept/flagged instead of
   * silently picking a "winner" (Session 2B §7). */
  ambiguousConfidenceMarginPts: number;
  /** Session 2B.1: shared cancel token for the whole run — checked
   * between regions (stops starting new work) and forwarded into every
   * engine call (aborts in-flight work too). */
  cancelToken?: CancelToken;
  /** Session 2B.1: reports stage/progress/region-index changes as they
   * happen, so the UI can show real diagnostics instead of a single
   * stuck percentage. */
  onDiagnostics?: (stage: OcrStage, progress: number | null, regionIndex: number | null, regionTotal: number | null) => void;
}

export const DEFAULT_RECOGNIZE_OPTIONS: Pick<
  RecognizeTextRegionsOptions,
  "cropPaddingPx" | "ambiguousConfidenceMarginPts"
> = {
  cropPaddingPx: 4,
  ambiguousConfidenceMarginPts: 15,
};

interface Attempt {
  angle: number;
  text: string;
  confidence: number | null;
}

async function recognizeOneRegion(
  buffer: PixelBuffer,
  region: TextRegionCandidate,
  regionIndex: number,
  regionTotal: number,
  options: RecognizeTextRegionsOptions,
): Promise<OcrCandidate> {
  const angles = buildOrientationCandidates(options.isoAxisCentroidsDeg);
  const attempts: Attempt[] = [];
  const engineErrors: string[] = [];
  let fatalErrorCode: string | null = null;

  for (const angle of angles) {
    if (options.cancelToken?.isCancelled()) break;

    const oriented = extractOrientedCrop(buffer, region.region, options.cropPaddingPx, angle);
    const image = options.toImageLike(oriented);
    const outcome = await recognizeImage(image, {
      ...options.engineOptions,
      cancelToken: options.cancelToken,
      onStage: (stage, progress) => options.onDiagnostics?.(stage, progress, regionIndex, regionTotal),
    });
    if (!outcome.ok) {
      engineErrors.push(`${angle}deg: ${outcome.errorMessage}`);
      if (outcome.errorCode === "cancelled") {
        fatalErrorCode = "cancelled";
        break;
      }
      continue;
    }
    const text = outcome.text.trim();
    if (text.length === 0) continue;
    attempts.push({ angle, text, confidence: outcome.confidence });
  }

  attempts.sort((a, b) => (b.confidence ?? -1) - (a.confidence ?? -1));
  const best = attempts[0];

  if (!best) {
    const cancelled = fatalErrorCode === "cancelled";
    return {
      id: generateId("ocr-candidate"),
      region,
      rawText: "",
      parsedValue: null,
      parsedUnit: null,
      orientationDeg: 0,
      confidence: null,
      alternatives: [],
      status: "ambiguous",
      sourceImageSha256: options.sourceImageSha256,
      note: cancelled
        ? "ยกเลิกก่อนอ่านบริเวณนี้สำเร็จ"
        : engineErrors.length > 0
          ? `OCR ไม่พบข้อความในบริเวณนี้ — engine รายงานปัญหา: ${engineErrors[0]}`
          : "OCR ไม่พบข้อความในบริเวณนี้ (ลองทุกมุมแล้ว)",
    };
  }

  const parsed = parseDimensionText(best.text);
  const runnerUps = attempts.slice(1).filter((a) => a.text !== best.text);
  const hasCloseRunnerUp = runnerUps.some(
    (a) => (best.confidence ?? 0) - (a.confidence ?? 0) <= options.ambiguousConfidenceMarginPts,
  );
  const alternatives: OcrAlternative[] = runnerUps.map((a) => ({ text: a.text, confidence: a.confidence }));

  const lowConfidence = best.confidence !== null && best.confidence < MIN_CONFIDENCE_FOR_READ;
  const status: OcrCandidate["status"] =
    parsed.ambiguous || hasCloseRunnerUp || lowConfidence ? "ambiguous" : "read";

  return {
    id: generateId("ocr-candidate"),
    region,
    rawText: best.text,
    parsedValue: parsed.value,
    parsedUnit: parsed.unit,
    orientationDeg: best.angle,
    confidence: best.confidence,
    alternatives,
    status,
    sourceImageSha256: options.sourceImageSha256,
  };
}

/**
 * Runs OCR across every candidate text region (Session 2B main
 * workflow: color mask → text region → OCR → candidate → user review).
 * Regions are processed sequentially against ONE reused engine worker
 * (Session 2B §10) — never one worker per region/orientation attempt.
 * Never marks a result `confirmed`; see types.ts.
 */
export async function recognizeTextRegions(
  buffer: PixelBuffer,
  regions: TextRegionCandidate[],
  options: RecognizeTextRegionsOptions,
): Promise<OcrCandidate[]> {
  const results: OcrCandidate[] = [];
  for (let i = 0; i < regions.length; i++) {
    if (options.cancelToken?.isCancelled()) break;
    results.push(await recognizeOneRegion(buffer, regions[i], i + 1, regions.length, options));
  }
  return results;
}
