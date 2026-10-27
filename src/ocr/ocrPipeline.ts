import type { PixelBuffer } from "../recognition/types";
import { extractOrientedCrop } from "./pixelTransform";
import { buildOrientationCandidates } from "./orientationCandidates";
import { parseDimensionText } from "./parseDimensionText";
import { recognizeImage, type TesseractEngineOptions } from "./tesseractEngine";
import { MIN_CONFIDENCE_FOR_READ, type OcrAlternative, type OcrCandidate, type OcrStage, type TextRegionCandidate } from "./types";
import { inkAspectRatio, orientationPlausibilityScore } from "./orientationPlausibility";
import type { CancelToken } from "./withTimeout";
import { generateId } from "../utils/id";
import type Tesseract from "tesseract.js";

export interface RecognizeTextRegionsOptions {
  /** ISO axis estimates from Session 2A.1's `clusterAxes`, if available
   * for this drawing — used as extra orientation candidates. */
  isoAxisCentroidsDeg: readonly number[] | null;
  /** Minimum crop padding, in source-image pixels — always applied even
   * for a tiny region. */
  cropPaddingPx: number;
  /** Session 2B.4: padding also scales with the region's own size, as a
   * fraction of its smaller dimension — see `effectiveCropPadding`. A
   * FIXED pixel padding (the only kind before 2B.4) shrinks relative to
   * the glyph as source resolution grows: the same ~50-58px digit
   * region in this project's 1522px-wide test image would be roughly
   * 115-135px at the iPad test's 3508px resolution, so a fixed 4px
   * padding provides proportionally ~2x less surrounding context there
   * — a plausible contributor to "ตัดส่วนของตัวเลข" (Session 2B.4 §5),
   * though unverified without that original image (see the report).
   */
  cropPaddingFraction: number;
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
  "cropPaddingPx" | "cropPaddingFraction" | "ambiguousConfidenceMarginPts"
> = {
  cropPaddingPx: 4,
  // Session 2B.4 §5/§6 evidence (padding sweep on test-001.jpg's real
  // regions, logged in test-results/baseline-2b4/): confidence for "35"
  // (a region close to several other extension-line strokes) swung
  // non-monotonically from 93% down to 15% as padding grew from 4px to
  // 13px — more context pulled in nearby dimension-line ink and
  // actively confused the engine on at least this region. "60"/"30"
  // were unaffected up to ~7-8px then also dipped. An initial 0.15
  // fraction was tested and REJECTED for exactly this reason. 0.05 is
  // a no-op for every region size seen in this project's real test
  // image so far (keeps today's proven-good behavior unchanged) while
  // still scaling padding up for meaningfully larger regions — e.g. a
  // ~300px-tall region (roughly the scale difference to the iPad
  // test's 3508px image) gets ~15px instead of a flat 4px. This is a
  // conservative, evidence-bounded default, not a universal "more
  // padding is better" assumption.
  cropPaddingFraction: 0.05,
  ambiguousConfidenceMarginPts: 15,
};

/** Session 2B.4 — resolution-aware crop padding: the larger of the
 * fixed minimum and a fraction of the region's own (smaller) dimension,
 * so padding grows with the glyph instead of staying a constant pixel
 * count regardless of source resolution. Pure and independently tested. */
export function effectiveCropPadding(regionWidthPx: number, regionHeightPx: number, paddingPx: number, paddingFraction: number): number {
  const minDimension = Math.min(regionWidthPx, regionHeightPx);
  return Math.max(paddingPx, Math.round(minDimension * paddingFraction));
}

interface Attempt {
  angle: number;
  text: string;
  confidence: number | null;
  /** Session 2B.4: width/height of the de-skewed ink at this attempt's
   * orientation, or null if unavailable — see orientationPlausibility.ts. */
  aspectRatio: number | null;
  /** Session 2B.4: confidence adjusted by orientation plausibility —
   * used ONLY to pick/rank attempts, never shown to the user in place
   * of the real engine confidence (that stays truthful in the output). */
  score: number;
}

/**
 * Session 2B.4 — picks the "best" attempt using agreement across
 * orientations first, plausibility-adjusted score second. Evidence
 * (Session 2B.4 §1/§7): a lone outlier orientation can score highest on
 * raw confidence while still being wrong (iPad's "30"→"20" at 93%).
 * Grouping by parsed numeric value and preferring a value multiple
 * DIFFERENT angles independently agree on (over a lone high-scoring
 * outlier) directly implements "เปรียบเทียบ Alternatives หลายมุม" +
 * "ตรวจความสอดคล้องของผล OCR" from the Session 2B.4 brief — confidence
 * is never the only signal trusted.
 */
function pickBestAttempt(attempts: Attempt[]): Attempt {
  const parseableGroups = new Map<string, Attempt[]>();
  for (const a of attempts) {
    const parsed = parseDimensionText(a.text);
    if (parsed.ambiguous || parsed.value === null) continue;
    const key = `${parsed.value}|${parsed.unit ?? ""}`;
    const group = parseableGroups.get(key) ?? [];
    group.push(a);
    parseableGroups.set(key, group);
  }

  if (parseableGroups.size > 0) {
    let bestGroup: Attempt[] | null = null;
    let bestGroupScore = -Infinity;
    for (const group of parseableGroups.values()) {
      const groupBestScore = Math.max(...group.map((a) => a.score));
      // Agreement count is the PRIMARY sort key (more independent angles
      // landing on the same value outweighs one angle's raw score lead),
      // best plausibility-adjusted score within the group breaks ties.
      const rank = group.length * 1000 + groupBestScore;
      if (rank > bestGroupScore) {
        bestGroupScore = rank;
        bestGroup = group;
      }
    }
    if (bestGroup) {
      return bestGroup.reduce((best, a) => (a.score > best.score ? a : best));
    }
  }

  // Nothing parsed as a clean number (e.g. only noise/punctuation was
  // read) — fall back to the highest plausibility-adjusted score among
  // ALL attempts, so the raw text is still surfaced for user review.
  return attempts.reduce((best, a) => (a.score > best.score ? a : best));
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
  const paddingPx = effectiveCropPadding(region.region.width, region.region.height, options.cropPaddingPx, options.cropPaddingFraction);

  for (const angle of angles) {
    if (options.cancelToken?.isCancelled()) break;

    const oriented = extractOrientedCrop(buffer, region.region, paddingPx, angle);
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
    const aspectRatio = inkAspectRatio(oriented);
    attempts.push({
      angle,
      text,
      confidence: outcome.confidence,
      aspectRatio,
      score: orientationPlausibilityScore(outcome.confidence, aspectRatio),
    });
  }

  const best = attempts.length > 0 ? pickBestAttempt(attempts) : undefined;

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
  const runnerUps = attempts.filter((a) => a !== best && a.text !== best.text);
  const hasCloseRunnerUp = runnerUps.some((a) => best.score - a.score <= options.ambiguousConfidenceMarginPts);
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
