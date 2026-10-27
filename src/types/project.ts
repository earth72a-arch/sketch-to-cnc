import { z } from "zod";
import { generateId } from "../utils/id";

/**
 * Sketch-to-CNC — Furniture Spec / Project data model.
 *
 * This is the single source of truth schema (see CLAUDE.md §3). All
 * read/write paths (state, save/load, draft export, approved export) must
 * go through these zod schemas so invalid data cannot silently enter the
 * project.
 */

export const SCHEMA_VERSION = "1.0.0";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const PointSchema = z.object({
  x: z.number(),
  y: z.number(),
});
export type Point = z.infer<typeof PointSchema>;

export const RegionSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});
export type Region = z.infer<typeof RegionSchema>;

export const ReviewStatusSchema = z.enum([
  "read",
  "confirmed",
  "derived",
  "rule",
  "missing",
  "ambiguous",
  "conflict",
]);
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

/** Statuses that count as "resolved" for approval purposes. See CLAUDE.md §6. */
export const RESOLVED_STATUSES: ReviewStatus[] = ["confirmed"];

export const ProvenanceSourceSchema = z.enum([
  "user_read", // user transcribed a value they read off the sketch, not yet confirmed
  "user_confirmed", // user explicitly confirmed the value is correct
  "tap_to_dimension", // Session 3A — entered via the Tap-to-Dimension workflow, not yet confirmed
  "ocr_transfer", // Session 2B — transferred from an (experimental) OCR candidate, not yet confirmed
  "derived", // computed from other values (e.g. unit conversion, chain math)
  "rule", // produced by a deterministic validation rule
  "system", // system default / seed data (e.g. seeded materials)
]);
export type ProvenanceSource = z.infer<typeof ProvenanceSourceSchema>;

export const ProvenanceSchema = z.object({
  source: ProvenanceSourceSchema,
  note: z.string().optional(),
  timestamp: z.string(), // ISO 8601
});
export type Provenance = z.infer<typeof ProvenanceSchema>;

export const LengthUnitSchema = z.enum(["mm", "cm"]);
export type LengthUnit = z.infer<typeof LengthUnitSchema>;

// ---------------------------------------------------------------------------
// Source image
// ---------------------------------------------------------------------------

export const SourceImageSchema = z.object({
  fileName: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/i),
});
export type SourceImage = z.infer<typeof SourceImageSchema>;

// ---------------------------------------------------------------------------
// Drawing views
// ---------------------------------------------------------------------------

export const DrawingViewTypeSchema = z.enum([
  "isometric_assembly",
  "isometric_without_doors",
  "detail_view",
  "custom",
]);
export type DrawingViewType = z.infer<typeof DrawingViewTypeSchema>;

export const AssemblyStateSchema = z.enum([
  "with_doors",
  "without_doors",
  "custom",
]);
export type AssemblyState = z.infer<typeof AssemblyStateSchema>;

export const DrawingViewSchema = z.object({
  id: z.string(),
  type: DrawingViewTypeSchema,
  label: z.string().min(1),
  region: RegionSchema,
  assemblyState: AssemblyStateSchema,
  componentIds: z.array(z.string()),
});
export type DrawingView = z.infer<typeof DrawingViewSchema>;

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

export const MaterialSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  nominalThicknessMm: z.number().positive(),
  /** Unknown until physically verified. Must stay null until then. */
  actualThicknessMm: z.number().positive().nullable(),
  actualThicknessVerified: z.boolean(),
});
export type Material = z.infer<typeof MaterialSchema>;

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export const ComponentSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  type: z.string().min(1),
  parentComponentId: z.string().nullable(),
  viewIds: z.array(z.string()),
  materialId: z.string().nullable(),
  /** Whether this component is expected to carry a material assignment. */
  requiresMaterial: z.boolean(),
  reviewStatus: ReviewStatusSchema,
});
export type Component = z.infer<typeof ComponentSchema>;

// ---------------------------------------------------------------------------
// Dimensions
// ---------------------------------------------------------------------------

export const DimensionPropertySchema = z.enum([
  "width",
  "height",
  "depth",
  "offset",
  "overhang",
  "spacing",
  "custom",
]);
export type DimensionProperty = z.infer<typeof DimensionPropertySchema>;

export const DimensionAnnotationSchema = z.object({
  /** Session 3A — nullable: Tap-to-Dimension lets a user place a marker
   * directly on the image without first defining a Drawing View. The
   * `region` (image-coordinate marker position) is always required;
   * only the optional View association may be deferred. */
  viewId: z.string().nullable(),
  region: RegionSchema,
});
export type DimensionAnnotation = z.infer<typeof DimensionAnnotationSchema>;

// ---------------------------------------------------------------------------
// Session 3B — Axis / Direction (geometry-referenced dimensions)
// ---------------------------------------------------------------------------

/**
 * A dimension's direction reference — deliberately NOT a Width/Height/
 * Depth classification (Session 3B §2: "การกำหนดชื่อ Property เป็นเพียง
 * ขั้นตอน Mapping ภายหลัง ไม่ใช่โครงสร้างหลักของ Dimension"). "ISO Axis
 * A"/"B" are NOT fixed to specific real-world directions — which
 * detected angle is "A" vs "B" is only ever a stable display ordering
 * (see `utils/axisSuggestion.ts`), never an assumption about which is
 * width vs depth. `"unassigned"` is the default for every new Dimension
 * (Session 3B §3: Axis may be left blank in a Draft).
 */
export const DimensionAxisSchema = z.enum([
  "iso_axis_a",
  "iso_axis_b",
  "vertical_axis",
  "custom",
  "unassigned",
]);
export type DimensionAxis = z.infer<typeof DimensionAxisSchema>;

/**
 * Whether a Dimension's current `axis` value is a system SUGGESTION
 * (derived from ISO Recognition, Session 3B §4 — shown to the user but
 * never written in without their action) or something the user
 * explicitly picked/accepted. A Dimension is never created with
 * `"suggested"` already applied to its `axis` field — a suggestion is
 * only ever a separate, non-persisted hint until the user acts on it;
 * `axisSource` exists so future code can still tell the two apart if a
 * suggestion is ever persisted speculatively (CLAUDE.md §4: never guess
 * on the user's behalf).
 */
export const DimensionAxisSourceSchema = z.enum(["suggested", "user_selected"]);
export type DimensionAxisSource = z.infer<typeof DimensionAxisSourceSchema>;

/**
 * Session 3B §2 — an OPTIONAL, forward-compatible slot for a future
 * Geometry Editor to attach a precise start/end point pair or reference
 * edge to a Dimension. Nothing in this session writes a non-null value
 * here or builds any editor for it — it exists only so later sessions
 * don't need another schema migration to add geometric precision.
 */
export const GeometricReferenceSchema = z.object({
  kind: z.enum(["point_pair", "edge"]),
  startPoint: PointSchema.nullable(),
  endPoint: PointSchema.nullable(),
});
export type GeometricReference = z.infer<typeof GeometricReferenceSchema>;

export const DimensionSchema = z.object({
  id: z.string(),
  value: z.number(),
  unit: LengthUnitSchema,
  normalizedValueMm: z.number(),
  /** May be null: a dimension can exist with an unresolved component association. */
  componentId: z.string().nullable(),
  /** Session 3B §5 — an optional, finer-grained reference than
   * `componentId` (e.g. a specific edge/face of that component) for a
   * future Geometry Editor to populate. Freeform id, not tied to any
   * entity model this session introduces. */
  elementId: z.string().nullable().default(null),
  /** Session 3B — direction/axis reference, independent of `property`.
   * See `DimensionAxisSchema`. Defaults to "unassigned" so old,
   * pre-Session-3B projects (and any new Draft) parse cleanly without
   * claiming a direction nobody chose. */
  axis: DimensionAxisSchema.default("unassigned"),
  axisSource: DimensionAxisSourceSchema.default("user_selected"),
  /** Required when axis === "custom". */
  customAxisLabel: z.string().optional(),
  /** Session 3B — optional forward-compatible geometry slot; see
   * `GeometricReferenceSchema`. Always null unless a future session
   * populates it. */
  geometricReference: GeometricReferenceSchema.nullable().default(null),
  property: DimensionPropertySchema,
  /** Required when property === "custom". */
  customPropertyLabel: z.string().optional(),
  annotation: DimensionAnnotationSchema.nullable(),
  reviewStatus: ReviewStatusSchema,
  provenance: ProvenanceSchema,
  note: z.string().optional(),
});
export type Dimension = z.infer<typeof DimensionSchema>;

// ---------------------------------------------------------------------------
// Dimension spans
// ---------------------------------------------------------------------------

export const SpanAxisSchema = z.enum(["x", "y", "z", "custom"]);
export type SpanAxis = z.infer<typeof SpanAxisSchema>;

export const DimensionSpanSchema = z.object({
  id: z.string(),
  viewId: z.string(),
  axis: SpanAxisSchema,
  startPoint: PointSchema.nullable(),
  endPoint: PointSchema.nullable(),
  componentId: z.string().nullable(),
  dimensionId: z.string().nullable(),
  /** Explicit, user-defined chain membership. Never inferred automatically. */
  parentSpanId: z.string().nullable(),
});
export type DimensionSpan = z.infer<typeof DimensionSpanSchema>;

// ---------------------------------------------------------------------------
// Project file (root)
// ---------------------------------------------------------------------------

export const ProjectFileSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  projectId: z.string(),
  projectName: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  sourceImage: SourceImageSchema.nullable(),
  views: z.array(DrawingViewSchema),
  components: z.array(ComponentSchema),
  dimensions: z.array(DimensionSchema),
  spans: z.array(DimensionSpanSchema),
  materials: z.array(MaterialSchema),
});
export type ProjectFile = z.infer<typeof ProjectFileSchema>;

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

/** Initial materials per CLAUDE.md §5. Actual thickness unknown until verified. */
export function createSeedMaterials(): Material[] {
  return [
    {
      id: "mat-aluminium-honeycomb-9mm",
      name: "Aluminium Honeycomb 9mm",
      nominalThicknessMm: 9,
      actualThicknessMm: null,
      actualThicknessVerified: false,
    },
    {
      id: "mat-aluminium-honeycomb-18mm",
      name: "Aluminium Honeycomb 18mm",
      nominalThicknessMm: 18,
      actualThicknessMm: null,
      actualThicknessVerified: false,
    },
  ];
}

export function createEmptyProject(projectName: string): ProjectFile {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    projectId: generateId("project"),
    projectName,
    createdAt: now,
    updatedAt: now,
    sourceImage: null,
    views: [],
    components: [],
    dimensions: [],
    spans: [],
    materials: createSeedMaterials(),
  };
}
