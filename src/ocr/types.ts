import type { Region } from "../types/project";
import { DEFAULT_CHAR_GROUPING_OPTIONS, type CharGroupingOptions } from "./characterGrouping";

/**
 * Dimension OCR — core types (Session 2B).
 *
 * Everything here is a review/debug artifact, the same way Session 2A's
 * Recognition Inspector is: an OCR candidate is never written into the
 * Furniture Spec JSON automatically, never auto-confirmed, and never
 * auto-associated with a component. See CLAUDE.md §4 and §6 — a user
 * must explicitly review and transfer a candidate before it becomes a
 * real (still-unconfirmed) Dimension record.
 */

export type OcrUnit = "mm" | "cm";

/** Session 2B.6 — which recognition engine produced a candidate. Always
 * recorded and shown alongside the result — never switched automatically
 * without the user explicitly choosing it first. `"paddleocr"` exists in
 * the type for forward-compatibility with the Engine dropdown's
 * labeling, but no code path in this session actually runs it: the
 * investigated `@paddleocr/paddleocr-js` package is reported BLOCKED
 * (bundled OpenCV.js dependency, no documented iPad Safari support, no
 * out-of-the-box self-hosting — see the Session 2B.6 final report) and
 * was never installed. */
export type OcrEngine = "tesseract" | "paddleocr";

/** Session 2B.6 — which detection/crop strategy produced the region this
 * candidate was read from, so "fair comparison" results are always
 * labeled with how the region was obtained, never silently mixed. */
export type OcrTestMode = "auto-detection" | "manual-crop";

/** How a text region/candidate was produced. */
export type OcrRegionMethod = "auto-region" | "manual-region";

/**
 * Lifecycle for an OCR candidate — intentionally separate from the
 * project's Dimension `ReviewStatus` enum (types/project.ts), because an
 * OCR candidate is not a Dimension record; it is evidence a user may or
 * may not choose to turn into one. A candidate must never start as
 * "confirmed" (see CLAUDE.md §6 / Session 2B spec §7).
 */
export type OcrCandidateStatus = "read" | "ambiguous" | "confirmed" | "rejected";

/** Below this engine confidence (0-100), a candidate is reported as
 * `ambiguous` even if the text happened to parse cleanly as a number —
 * a low-confidence read can still be "confidently wrong" in the sense
 * that matters here: plausible-looking but not trustworthy. Session 2B
 * spec §14: "Do not treat OCR confidence as proof of correctness" — this
 * constant exists to flag LOW confidence, never to treat high confidence
 * as proof of anything. */
export const MIN_CONFIDENCE_FOR_READ = 60;

export interface OcrAlternative {
  text: string;
  /** 0-100, or null if the engine did not report one for this attempt. */
  confidence: number | null;
}

/** A candidate text region found by (or manually drawn for) OCR, before
 * any recognition has run against it. Bounding box in ORIGINAL IMAGE
 * PIXEL coordinates — never screen space (CLAUDE.md §7). */
export interface TextRegionCandidate {
  id: string;
  region: Region;
  method: OcrRegionMethod;
  /** How many connected ink components were merged into this region —
   * purely diagnostic, never a real-world measurement. */
  sourceComponentCount: number;
}

export interface OcrCandidate {
  id: string;
  region: TextRegionCandidate;
  /** Raw text exactly as the OCR engine returned it, untouched. */
  rawText: string;
  /** Parsed numeric value, or null if the text could not be cleanly
   * parsed as a single number — never a guess. */
  parsedValue: number | null;
  /** Parsed unit, or null if no unit was recognized — NEVER defaulted
   * to mm/cm (CLAUDE.md §4 / Session 2B spec §7). */
  parsedUnit: OcrUnit | null;
  /** Degrees the region was rotated before this OCR attempt (0 = as
   * drawn in the source image). */
  orientationDeg: number;
  /** 0-100 engine confidence for this attempt, or null if unavailable. */
  confidence: number | null;
  /** Other orientation/attempt results kept for comparison when the
   * best attempt is not clearly dominant — never silently discarded. */
  alternatives: OcrAlternative[];
  status: OcrCandidateStatus;
  /** sha256 of the source image this candidate was read from (see
   * SourceImage in types/project.ts) — the "image evidence reference"
   * required by the Session 2B spec; combined with `region`, it is
   * always enough to re-derive the exact crop that produced this text. */
  sourceImageSha256: string;
  /** Session 2B.6 — which engine produced this candidate. Always set,
   * never implicit, so mixed-engine comparison results stay labeled. */
  engine: OcrEngine;
  /** Session 2B.6 — which detection/crop strategy produced this
   * candidate's region. Always set, never implicit. */
  testMode: OcrTestMode;
  /** User-entered correction, if any — kept separate from the raw OCR
   * output so the original evidence is never overwritten. */
  userValue?: number;
  userUnit?: OcrUnit;
  note?: string;
}

export interface OcrRegionDetectionOptions {
  /** Session 2B.6 — adaptive character-grouping parameters (see
   * `characterGrouping.ts`). Replaces the old fixed `charGroupingGapPx`
   * pixel constant, which split multi-digit numbers whenever a
   * drawing's actual digit spacing exceeded that one hardcoded value —
   * every one of these is expressed relative to each pair's own
   * measured size, never an absolute pixel count. */
  charGrouping: CharGroupingOptions;
  /** Extra pixels added around each detected cluster's bounding box. */
  paddingPx: number;
  /** A component is treated as a dimension LINE (and excluded from text
   * candidates) once its PCA linearity is at least this high... */
  lineLinearityThreshold: number;
  /** ...AND its fitted length is at least this long, in pixels. Both
   * conditions must hold — a short straight stroke (e.g. the digit "1")
   * must not be mistaken for a leader/extension line. */
  lineMinLengthPx: number;
  /** Minimum merged-cluster pixel count to even consider it a text
   * region (drops stray specks/noise). */
  minClusterPixelCount: number;
  /** Maximum merged-cluster bounding-box area, as a fraction of the full
   * image area — guards against a pathological over-merge swallowing
   * most of the drawing into one "text" region. */
  maxClusterAreaFraction: number;
}

export const DEFAULT_OCR_REGION_OPTIONS: OcrRegionDetectionOptions = {
  charGrouping: DEFAULT_CHAR_GROUPING_OPTIONS,
  paddingPx: 6,
  lineLinearityThreshold: 0.9,
  lineMinLengthPx: 40,
  minClusterPixelCount: 6,
  maxClusterAreaFraction: 0.1,
};

/**
 * Session 2B.1 — user-visible OCR stages. Every stage the UI can show
 * must be one of these; there is no "generic 0%" fallback. `progress`
 * on the diagnostics record is `null` whenever the engine did not
 * report a real number for the current stage — the UI must render that
 * as "no percentage available," never as a fabricated 0%.
 */
export type OcrStage =
  | "idle"
  | "preparing-image"
  | "detecting-regions"
  | "initializing-worker"
  | "loading-core"
  | "loading-language"
  | "recognizing"
  | "completed"
  | "failed"
  | "cancelled";

export interface OcrDiagnostics {
  stage: OcrStage;
  /** 0-1 engine-reported progress for the CURRENT stage, or null if the
   * engine has not reported one — never a placeholder/fake value. */
  progress: number | null;
  /** 1-based index of the region currently being recognized, null
   * outside the "recognizing" stage. */
  regionIndex: number | null;
  regionTotal: number | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export const IDLE_OCR_DIAGNOSTICS: OcrDiagnostics = {
  stage: "idle",
  progress: null,
  regionIndex: null,
  regionTotal: null,
  errorCode: null,
  errorMessage: null,
};

/** Per-stage timeouts (ms) — configurable, never used as a silent
 * "problem solved" substitute for the real fix (Session 2B.1 §4): a
 * timeout firing is always surfaced to the user as a `failed` stage
 * with an explicit error code/message, not swallowed. */
export interface OcrTimeoutConfig {
  workerInitMs: number;
  recognizeMs: number;
}

export const DEFAULT_OCR_TIMEOUTS: OcrTimeoutConfig = {
  workerInitMs: 45000,
  recognizeMs: 25000,
};

/**
 * Guard limits for Automatic OCR (Session 2B.1 §6) — a real sketch can
 * contain far more "dimension-colored ink clusters" than are actually
 * numbers (stray marks, a misconfigured palette, etc.). These bound the
 * worst case instead of silently dropping regions with no explanation;
 * see textRegionGuard.ts for how a violation is reported to the user.
 */
export interface OcrAutoRunGuardLimits {
  maxRegions: number;
  maxRegionAreaPx: number;
}

export const DEFAULT_OCR_GUARD_LIMITS: OcrAutoRunGuardLimits = {
  maxRegions: 60,
  maxRegionAreaPx: 2_000_000, // a single text region bigger than this is almost certainly a mis-detected non-text blob, not a number
};
