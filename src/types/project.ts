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
  viewId: z.string(),
  region: RegionSchema,
});
export type DimensionAnnotation = z.infer<typeof DimensionAnnotationSchema>;

export const DimensionSchema = z.object({
  id: z.string(),
  value: z.number(),
  unit: LengthUnitSchema,
  normalizedValueMm: z.number(),
  /** May be null: a dimension can exist with an unresolved component association. */
  componentId: z.string().nullable(),
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
