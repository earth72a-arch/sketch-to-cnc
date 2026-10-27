import type { OcrCandidate } from "./types";

export const OCR_ALGORITHM_VERSION = "session2b-tesseract-lstm-v1";
const REPORT_SCHEMA_VERSION = "1.0.0";

export interface OcrImageMeta {
  fileName: string;
  width: number;
  height: number;
  sha256: string;
}

export interface OcrDebugReport {
  reportSchemaVersion: string;
  algorithmVersion: string;
  generatedAt: string;
  image: OcrImageMeta;
  candidates: Array<{
    id: string;
    region: OcrCandidate["region"];
    rawText: string;
    parsedValue: number | null;
    parsedUnit: string | null;
    orientationDeg: number;
    confidence: number | null;
    alternatives: OcrCandidate["alternatives"];
    status: string;
    userValue?: number;
    userUnit?: string;
    note?: string;
  }>;
  counts: {
    totalCandidates: number;
    byStatus: Record<string, number>;
    withParsedValue: number;
    withParsedUnit: number;
  };
  processingTimeMs: number;
}

/**
 * Assembles the OCR Debug Report — a review/debug artifact, separate
 * from the Furniture Spec JSON (same posture as Session 2A's Recognition
 * Report, see recognition/report.ts). Every candidate here keeps its
 * raw text and region so a reviewer can re-check it against the source
 * image; nothing here is ever manufacturing-approved on its own.
 */
export function buildOcrDebugReport(
  candidates: OcrCandidate[],
  image: OcrImageMeta,
  processingTimeMs: number,
): OcrDebugReport {
  const byStatus: Record<string, number> = {};
  let withParsedValue = 0;
  let withParsedUnit = 0;
  for (const c of candidates) {
    byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
    if (c.parsedValue !== null) withParsedValue++;
    if (c.parsedUnit !== null) withParsedUnit++;
  }

  return {
    reportSchemaVersion: REPORT_SCHEMA_VERSION,
    algorithmVersion: OCR_ALGORITHM_VERSION,
    generatedAt: new Date().toISOString(),
    image,
    candidates: candidates.map((c) => ({
      id: c.id,
      region: c.region,
      rawText: c.rawText,
      parsedValue: c.parsedValue,
      parsedUnit: c.parsedUnit,
      orientationDeg: c.orientationDeg,
      confidence: c.confidence,
      alternatives: c.alternatives,
      status: c.status,
      userValue: c.userValue,
      userUnit: c.userUnit,
      note: c.note,
    })),
    counts: {
      totalCandidates: candidates.length,
      byStatus,
      withParsedValue,
      withParsedUnit,
    },
    processingTimeMs,
  };
}

export function serializeOcrDebugReport(report: OcrDebugReport): string {
  return JSON.stringify(report, null, 2);
}
