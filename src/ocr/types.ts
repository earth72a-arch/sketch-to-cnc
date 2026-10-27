import type { Region } from "../types/project";

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
  /** User-entered correction, if any — kept separate from the raw OCR
   * output so the original evidence is never overwritten. */
  userValue?: number;
  userUnit?: OcrUnit;
  note?: string;
}

export interface OcrRegionDetectionOptions {
  /** Pixel gap under which two separate ink components are merged into
   * one text-region candidate (handles adjacent/connected characters). */
  charGroupingGapPx: number;
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
  charGroupingGapPx: 14,
  paddingPx: 6,
  lineLinearityThreshold: 0.9,
  lineMinLengthPx: 40,
  minClusterPixelCount: 6,
  maxClusterAreaFraction: 0.1,
};
