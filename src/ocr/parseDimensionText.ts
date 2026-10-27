import type { OcrUnit } from "./types";

export interface ParsedDimensionText {
  value: number | null;
  unit: OcrUnit | null;
  /** True when the raw text could not be cleanly interpreted as "one
   * number, optionally followed by one unit" — the caller should mark
   * the candidate `ambiguous`, never guess a value from it. */
  ambiguous: boolean;
}

const NUMBER_WITH_OPTIONAL_UNIT = /^(\d{1,4}(?:\.\d{1,2})?)\s*(mm|cm)?$/i;

/**
 * Parses raw OCR text into a numeric value + optional unit. Strict by
 * design (Session 2B spec §7): the ENTIRE trimmed string must match
 * "number, optionally a unit" — never extracts a number from inside a
 * longer, noisier string, and never defaults a missing unit to mm/cm.
 * Anything else is reported as ambiguous with value/unit both null, so
 * the raw OCR text is still visible to the user for manual correction
 * instead of being silently dropped.
 */
export function parseDimensionText(rawText: string): ParsedDimensionText {
  const trimmed = rawText.trim();
  if (trimmed.length === 0) {
    return { value: null, unit: null, ambiguous: true };
  }

  const match = trimmed.match(NUMBER_WITH_OPTIONAL_UNIT);
  if (!match) {
    return { value: null, unit: null, ambiguous: true };
  }

  const value = Number(match[1]);
  if (!Number.isFinite(value)) {
    return { value: null, unit: null, ambiguous: true };
  }

  const unit = match[2] ? (match[2].toLowerCase() as OcrUnit) : null;
  return { value, unit, ambiguous: false };
}
