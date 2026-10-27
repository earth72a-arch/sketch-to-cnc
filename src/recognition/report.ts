import { COLOR_CATEGORIES } from "./types";
import type { ColorCategory, Palette, RecognitionResult } from "./types";
import type { RecognitionOptions } from "./pipeline";
import { rgbToHex } from "./colorHex";

export const RECOGNITION_ALGORITHM_VERSION = "session2a1-skeleton-line-v1";
const REPORT_SCHEMA_VERSION = "1.0.0";

export interface RecognitionImageMeta {
  fileName: string;
  width: number;
  height: number;
  sha256: string;
}

export interface RecognitionReport {
  reportSchemaVersion: string;
  algorithmVersion: string;
  generatedAt: string;
  image: RecognitionImageMeta;
  palette: Array<{ category: ColorCategory; colorHex: string; tolerance: number }>;
  options: RecognitionOptions;
  processingTimeMs: number;
  counts: {
    perCategory: Record<ColorCategory, number>;
    unclassifiedPixels: number;
    backgroundPixels: number;
  };
  /** Detected line segments — pixel coordinates / pixel lengths only. */
  segments: Array<{
    id: string;
    category: ColorCategory;
    start: { x: number; y: number };
    end: { x: number; y: number };
    angleDeg: number;
    lengthPx: number;
    linearity: number;
    pixelCount: number;
    axisGroup: 0 | 1 | 2 | null;
  }>;
  axisClustering: {
    axisCentroidsDeg: [number, number, number] | null;
    reason: string | null;
    countPerAxis: [number, number, number];
    unclassifiedAxisCount: number;
  };
  rejectedBlobCount: number;
}

/**
 * Assembles the Recognition Report — a debug/QA artifact, separate from
 * the Furniture Spec JSON. Every size value here is in image pixels; no
 * real-world unit is ever attached unless it came from a user-confirmed
 * Dimension record, which this module never touches (see CLAUDE.md §4).
 */
export function buildRecognitionReport(
  result: RecognitionResult,
  image: RecognitionImageMeta,
  palette: Palette,
  options: RecognitionOptions,
): RecognitionReport {
  const countPerAxis: [number, number, number] = [0, 0, 0];
  let unclassifiedAxisCount = 0;
  for (const assignment of result.axisClustering.assignments) {
    if (assignment === null) unclassifiedAxisCount++;
    else countPerAxis[assignment]++;
  }

  const segments = result.lines.map((line, idx) => ({
    id: line.id,
    category: line.category,
    start: line.start,
    end: line.end,
    angleDeg: line.angleDeg,
    lengthPx: line.lengthPx,
    linearity: line.linearity,
    pixelCount: line.pixelCount,
    axisGroup: result.axisClustering.assignments[idx] ?? null,
  }));

  const perCategory = {} as Record<ColorCategory, number>;
  for (const category of COLOR_CATEGORIES) {
    perCategory[category] = result.classification.counts[category];
  }

  return {
    reportSchemaVersion: REPORT_SCHEMA_VERSION,
    algorithmVersion: RECOGNITION_ALGORITHM_VERSION,
    generatedAt: new Date().toISOString(),
    image,
    palette: COLOR_CATEGORIES.map((category) => ({
      category,
      colorHex: rgbToHex(palette[category].color),
      tolerance: palette[category].tolerance,
    })),
    options,
    processingTimeMs: result.processingTimeMs,
    counts: {
      perCategory,
      unclassifiedPixels: result.classification.counts.unclassified,
      backgroundPixels: result.classification.counts.background,
    },
    segments,
    axisClustering: {
      axisCentroidsDeg: result.axisClustering.axisCentroidsDeg,
      reason: result.axisClustering.reason,
      countPerAxis,
      unclassifiedAxisCount,
    },
    rejectedBlobCount: result.rejectedBlobCount,
  };
}

export function serializeRecognitionReport(report: RecognitionReport): string {
  return JSON.stringify(report, null, 2);
}
