/**
 * Recognition Inspector — core types.
 *
 * Everything here is a visual QA / debug aid (Session 2A). None of it
 * writes into the Furniture Spec data model, auto-creates components, or
 * asserts real-world sizes — see CLAUDE.md §3/§4. A Recognition Report is
 * a separate, parallel JSON artifact, never merged into project.json.
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** A plain, framework-agnostic pixel buffer — deliberately NOT ImageData,
 * so the entire recognition pipeline is testable in plain Node/Vitest
 * without a canvas polyfill. The browser-only adapter that produces one of
 * these from a real <img> lives in imageDataAdapter.ts and is the only
 * non-pure, non-unit-tested part of this module. */
export interface PixelBuffer {
  width: number;
  height: number;
  /** RGBA, row-major, 4 bytes per pixel — same layout as ImageData.data. */
  data: Uint8ClampedArray;
}

export const COLOR_CATEGORIES = [
  "cabinet_structure",
  "door_front",
  "dimension",
  "comment",
  "detail_view",
] as const;

export type ColorCategory = (typeof COLOR_CATEGORIES)[number];

export const CATEGORY_LABELS_TH: Record<ColorCategory, string> = {
  cabinet_structure: "โครงตู้ (Cabinet Structure)",
  door_front: "บานประตู/หน้าบาน (Door / Front Panel)",
  dimension: "มิติ (Dimension)",
  comment: "คำอธิบาย (Comment)",
  detail_view: "มุมมองรายละเอียด (Detail View)",
};

export interface PaletteEntry {
  category: ColorCategory;
  color: RGB;
  /** Max Euclidean RGB distance to still count as a match (0-441.67). */
  tolerance: number;
}

export type Palette = Record<ColorCategory, PaletteEntry>;

export interface ClassificationResult {
  width: number;
  height: number;
  /** One boolean mask per category, same pixel order as PixelBuffer. */
  masks: Record<ColorCategory, Uint8Array>;
  /** Pixels that are ink (not background) but match no palette color. */
  unclassifiedMask: Uint8Array;
  backgroundMask: Uint8Array;
  counts: Record<ColorCategory, number> & { unclassified: number; background: number };
}

export interface ComponentStats {
  count: number;
  sumX: number;
  sumY: number;
  sumXX: number;
  sumYY: number;
  sumXY: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface FittedLine {
  id: string;
  category: ColorCategory;
  centroid: { x: number; y: number };
  /** Endpoints in ORIGINAL IMAGE PIXEL coordinates — never screen space. */
  start: { x: number; y: number };
  end: { x: number; y: number };
  /** Angle of the line's principal axis, degrees, normalized to [0, 180). */
  angleDeg: number;
  /** Pixel length, estimated from pixel-count variance. NEVER a real-world
   * size — see CLAUDE.md §4 and the "never guess" rule. */
  lengthPx: number;
  /** 0 (isotropic blob) .. 1 (perfectly straight). */
  linearity: number;
  pixelCount: number;
}

export type AxisGroupIndex = 0 | 1 | 2;

export interface AxisClusteringResult {
  /** null when there weren't enough lines to even attempt clustering. */
  axisCentroidsDeg: [number, number, number] | null;
  /** Same length/order as the input line array. null = unclassified axis. */
  assignments: (AxisGroupIndex | null)[];
  reason: string | null;
}

export interface RecognitionResult {
  width: number;
  height: number;
  classification: ClassificationResult;
  lines: FittedLine[];
  rejectedBlobCount: number;
  axisClustering: AxisClusteringResult;
  processingTimeMs: number;
}
