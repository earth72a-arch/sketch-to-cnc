import { SCHEMA_VERSION, createSeedMaterials, type Component, type Dimension, type DimensionSpan, type DrawingView, type ProjectFile } from "../types/project";

/**
 * SYNTHETIC TEST FIXTURE — Test Case 001 (wall-mounted cabinet).
 *
 * This is NOT a real customer drawing. It is a programmatically generated
 * fixture that encodes the known facts from the Session 1 spec, section 8,
 * so automated tests can exercise the manual-first workflow end-to-end.
 *
 * Known facts encoded here:
 * - Overall width: 1200 mm (read from drawing, needs confirmation)
 * - Depth: 250 mm (read from drawing, needs confirmation)
 * - Cabinet body height: 440 mm (confirmed)
 * - Door height: 450 mm (confirmed)
 * - Two doors, each a 600 mm division of the 1200 mm overall width
 *   (read, individual confirmation required); the two 600 mm widths are
 *   linked via an explicit dimension-span chain to the 1200 mm overall
 *   width span.
 * - Door bottom overhang: 10 mm (confirmed), used as a finger pull.
 * - An additional "isometric_without_doors" view exists.
 * - Material assignment: deliberately left MISSING on every component.
 * - Door top alignment and manufacturing details are UNRESOLVED — this
 *   fixture intentionally contains no fabricated values for them.
 */

const NOW = "2026-01-01T00:00:00.000Z";

export function createSyntheticTestCase001(): ProjectFile {
  const assemblyView: DrawingView = {
    id: "synthetic-view-assembly",
    type: "isometric_assembly",
    label: "Isometric Assembly (synthetic)",
    region: { x: 0, y: 0, width: 800, height: 600 },
    assemblyState: "with_doors",
    componentIds: [
      "synthetic-cabinet-body",
      "synthetic-door-left",
      "synthetic-door-right",
    ],
  };

  const withoutDoorsView: DrawingView = {
    id: "synthetic-view-without-doors",
    type: "isometric_without_doors",
    label: "Isometric Without Doors (synthetic)",
    region: { x: 0, y: 600, width: 800, height: 600 },
    assemblyState: "without_doors",
    componentIds: ["synthetic-cabinet-body"],
  };

  const cabinetBody: Component = {
    id: "synthetic-cabinet-body",
    name: "Cabinet Body",
    type: "cabinet_body",
    parentComponentId: null,
    viewIds: [assemblyView.id, withoutDoorsView.id],
    materialId: null, // Material assignment: Missing (per test case facts)
    requiresMaterial: true,
    reviewStatus: "read",
  };

  const doorLeft: Component = {
    id: "synthetic-door-left",
    name: "Door Left",
    type: "door_left",
    parentComponentId: cabinetBody.id,
    viewIds: [assemblyView.id],
    materialId: null,
    requiresMaterial: true,
    reviewStatus: "read",
  };

  const doorRight: Component = {
    id: "synthetic-door-right",
    name: "Door Right",
    type: "door_right",
    parentComponentId: cabinetBody.id,
    viewIds: [assemblyView.id],
    materialId: null,
    requiresMaterial: true,
    reviewStatus: "read",
  };

  const overallWidth: Dimension = {
    id: "synthetic-dim-overall-width",
    value: 1200,
    unit: "mm",
    normalizedValueMm: 1200,
    componentId: cabinetBody.id,
    property: "width",
    annotation: null,
    reviewStatus: "read", // needs explicit user confirmation
    provenance: { source: "user_read", timestamp: NOW },
  };

  const depth: Dimension = {
    id: "synthetic-dim-depth",
    value: 250,
    unit: "mm",
    normalizedValueMm: 250,
    componentId: cabinetBody.id,
    property: "depth",
    annotation: null,
    reviewStatus: "read", // needs explicit user confirmation
    provenance: { source: "user_read", timestamp: NOW },
  };

  const cabinetBodyHeight: Dimension = {
    id: "synthetic-dim-cabinet-body-height",
    value: 440,
    unit: "mm",
    normalizedValueMm: 440,
    componentId: cabinetBody.id,
    property: "height",
    annotation: null,
    reviewStatus: "confirmed",
    provenance: { source: "user_confirmed", timestamp: NOW },
  };

  const doorHeight: Dimension = {
    id: "synthetic-dim-door-height",
    value: 450,
    unit: "mm",
    normalizedValueMm: 450,
    componentId: doorLeft.id,
    property: "height",
    annotation: null,
    reviewStatus: "confirmed",
    provenance: { source: "user_confirmed", timestamp: NOW },
  };

  const doorLeftWidth: Dimension = {
    id: "synthetic-dim-door-left-width",
    value: 600,
    unit: "mm",
    normalizedValueMm: 600,
    componentId: doorLeft.id,
    property: "width",
    annotation: null,
    reviewStatus: "read", // one of the two 600mm divisions, needs individual confirmation
    provenance: { source: "user_read", timestamp: NOW },
  };

  const doorRightWidth: Dimension = {
    id: "synthetic-dim-door-right-width",
    value: 600,
    unit: "mm",
    normalizedValueMm: 600,
    componentId: doorRight.id,
    property: "width",
    annotation: null,
    reviewStatus: "read",
    provenance: { source: "user_read", timestamp: NOW },
  };

  const doorLeftOverhang: Dimension = {
    id: "synthetic-dim-door-left-overhang",
    value: 10,
    unit: "mm",
    normalizedValueMm: 10,
    componentId: doorLeft.id,
    property: "overhang",
    annotation: null,
    reviewStatus: "confirmed",
    provenance: { source: "user_confirmed", timestamp: NOW },
    note: "ใช้เป็นร่องดึงเปิดบานประตู (finger pull)",
  };

  const doorRightOverhang: Dimension = {
    id: "synthetic-dim-door-right-overhang",
    value: 10,
    unit: "mm",
    normalizedValueMm: 10,
    componentId: doorRight.id,
    property: "overhang",
    annotation: null,
    reviewStatus: "confirmed",
    provenance: { source: "user_confirmed", timestamp: NOW },
    note: "ใช้เป็นร่องดึงเปิดบานประตู (finger pull)",
  };

  // Explicit dimension-span chain: the two 600mm door widths together make
  // up the 1200mm overall cabinet width. This relationship is NEVER
  // inferred automatically — it exists only because these spans were
  // explicitly declared as a chain.
  const overallWidthSpan: DimensionSpan = {
    id: "synthetic-span-overall-width",
    viewId: assemblyView.id,
    axis: "x",
    startPoint: { x: 10, y: 50 },
    endPoint: { x: 790, y: 50 },
    componentId: cabinetBody.id,
    dimensionId: overallWidth.id,
    parentSpanId: null,
  };

  const doorLeftWidthSpan: DimensionSpan = {
    id: "synthetic-span-door-left-width",
    viewId: assemblyView.id,
    axis: "x",
    startPoint: { x: 10, y: 50 },
    endPoint: { x: 400, y: 50 },
    componentId: doorLeft.id,
    dimensionId: doorLeftWidth.id,
    parentSpanId: overallWidthSpan.id,
  };

  const doorRightWidthSpan: DimensionSpan = {
    id: "synthetic-span-door-right-width",
    viewId: assemblyView.id,
    axis: "x",
    startPoint: { x: 400, y: 50 },
    endPoint: { x: 790, y: 50 },
    componentId: doorRight.id,
    dimensionId: doorRightWidth.id,
    parentSpanId: overallWidthSpan.id,
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    projectId: "synthetic-project-test-case-001",
    projectName: "Test Case 001 — Wall-mounted Cabinet (SYNTHETIC)",
    createdAt: NOW,
    updatedAt: NOW,
    sourceImage: null, // no real customer PNG is embedded in the repository
    views: [assemblyView, withoutDoorsView],
    components: [cabinetBody, doorLeft, doorRight],
    dimensions: [
      overallWidth,
      depth,
      cabinetBodyHeight,
      doorHeight,
      doorLeftWidth,
      doorRightWidth,
      doorLeftOverhang,
      doorRightOverhang,
    ],
    spans: [overallWidthSpan, doorLeftWidthSpan, doorRightWidthSpan],
    materials: createSeedMaterials(),
  };
}

/**
 * Returns a copy of the synthetic Test Case 001 project with every
 * blocking issue resolved (dimensions confirmed, materials assigned), for
 * tests that need to exercise the "approvable" path. Still synthetic.
 */
export function createApprovableSyntheticTestCase001(): ProjectFile {
  const project = createSyntheticTestCase001();
  const materialId = project.materials[0].id;

  return {
    ...project,
    components: project.components.map((c) => ({ ...c, materialId })),
    dimensions: project.dimensions.map((d) =>
      d.reviewStatus === "read"
        ? {
            ...d,
            reviewStatus: "confirmed",
            provenance: { source: "user_confirmed", timestamp: NOW },
          }
        : d,
    ),
  };
}
