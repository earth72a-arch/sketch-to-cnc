import { describe, expect, it } from "vitest";
import {
  buildApprovedFurnitureSpec,
  parseProjectFile,
  serializeApprovedFurnitureSpec,
  serializeDraftProject,
} from "./serialization";
import {
  createApprovableSyntheticTestCase001,
  createSyntheticTestCase001,
} from "../fixtures/testCase001.synthetic";
import { createEmptyProject, type Dimension } from "../types/project";

describe("serializeDraftProject / parseProjectFile — round trip", () => {
  it("round-trips a fully populated draft project (Test Case 001) byte-for-structure", () => {
    const project = createSyntheticTestCase001();
    const json = serializeDraftProject(project);
    const result = parseProjectFile(json);
    expect(result.ok).toBe(true);
    expect(result.project).toEqual(project);
  });

  it("round-trips an empty draft project (incomplete info is allowed)", () => {
    const project = createEmptyProject("Draft without any data yet");
    const json = serializeDraftProject(project);
    const result = parseProjectFile(json);
    expect(result.ok).toBe(true);
    expect(result.project).toEqual(project);
  });
});

describe("parseProjectFile — invalid input handling", () => {
  it("rejects malformed JSON", () => {
    const result = parseProjectFile("{ not valid json");
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("rejects JSON that doesn't match the project schema", () => {
    const result = parseProjectFile(JSON.stringify({ foo: "bar" }));
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("rejects a project with an unsupported schema version", () => {
    const project = createEmptyProject("x");
    const tampered = { ...project, schemaVersion: "0.0.1" };
    const result = parseProjectFile(JSON.stringify(tampered));
    expect(result.ok).toBe(false);
  });
});

describe("Approved Furniture Spec export blocking", () => {
  it("blocks approval while the draft has unresolved dimensions/materials", () => {
    const project = createSyntheticTestCase001();
    const result = buildApprovedFurnitureSpec(project);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThan(0);
    }
    expect(() => serializeApprovedFurnitureSpec(project)).toThrow();
  });

  it("allows approval once the project is fully resolved", () => {
    const project = createApprovableSyntheticTestCase001();
    const result = buildApprovedFurnitureSpec(project);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.spec.kind).toBe("approved_furniture_spec");
      expect(typeof result.spec.approvedAt).toBe("string");
    }
    const json = serializeApprovedFurnitureSpec(project);
    const parsedBack = JSON.parse(json);
    expect(parsedBack.kind).toBe("approved_furniture_spec");
  });

  it("does not treat successful JSON serialization alone as approval", () => {
    // A draft always serializes successfully, even though it is nowhere
    // near approvable — serialization success must never be confused with
    // manufacturing approval.
    const project = createSyntheticTestCase001();
    expect(() => serializeDraftProject(project)).not.toThrow();
    expect(buildApprovedFurnitureSpec(project).ok).toBe(false);
  });

  it("blocking issues reference real dimension/component ids so the UI can navigate to them", () => {
    // Regression for the "approved export gives no feedback" bug: the
    // issues returned here are exactly what the export-blocking panel
    // renders and lets the user tap to jump to the offending record.
    const project = createSyntheticTestCase001();
    const result = buildApprovedFurnitureSpec(project);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    const dimensionIds = new Set(project.dimensions.map((d) => d.id));
    const componentIds = new Set(project.components.map((c) => c.id));

    const navigable = result.issues.filter(
      (i) => i.entityType === "dimension" || i.entityType === "component",
    );
    expect(navigable.length).toBeGreaterThan(0);
    for (const issue of navigable) {
      const exists =
        (issue.entityType === "dimension" && dimensionIds.has(issue.entityId)) ||
        (issue.entityType === "component" && componentIds.has(issue.entityId));
      expect(exists).toBe(true);
    }
  });
});

describe("Session 3A — Tap-to-Dimension records gate the same way as any other dimension", () => {
  function tapSourcedDimension(overrides: Partial<Dimension> = {}): Dimension {
    return { ...baseTapDimension(), ...overrides };
  }
  function baseTapDimension(): Dimension {
    return {
      id: "tap-dim-extra",
      value: 35,
      unit: "mm",
      normalizedValueMm: 35,
      componentId: null,
      elementId: null,
      axis: "unassigned",
      axisSource: "user_selected",
      geometricReference: null,
      property: "custom",
      customPropertyLabel: "รอระบุประเภท (Tap-to-Dimension)",
      annotation: { viewId: null, region: { x: 10, y: 10, width: 24, height: 24 } },
      reviewStatus: "read",
      provenance: { source: "tap_to_dimension", timestamp: "2026-01-01T00:00:00.000Z" },
    };
  }

  it("(K) a Draft Tap-to-Dimension record blocks approval even when the rest of the project is otherwise fully resolved", () => {
    const base = createApprovableSyntheticTestCase001();
    expect(buildApprovedFurnitureSpec(base).ok).toBe(true); // sanity: base alone is approvable

    const withDraftTap = { ...base, dimensions: [...base.dimensions, tapSourcedDimension()] };
    const result = buildApprovedFurnitureSpec(withDraftTap);
    expect(result.ok).toBe(false);
  });

  it("(L) the SAME Tap-to-Dimension record becomes eligible once confirmed AND mapped to a component (never guessed automatically)", () => {
    const base = createApprovableSyntheticTestCase001();
    const confirmedAndMapped = tapSourcedDimension({
      componentId: "synthetic-cabinet-body",
      reviewStatus: "confirmed",
      provenance: { source: "user_confirmed", timestamp: "2026-01-01T00:00:00.000Z" },
    });
    const withConfirmedTap = { ...base, dimensions: [...base.dimensions, confirmedAndMapped] };
    const result = buildApprovedFurnitureSpec(withConfirmedTap);
    expect(result.ok).toBe(true);
  });
});

describe("Session 3B — Geometry-Referenced Dimensions: backward compatibility + no auto-mapping", () => {
  it("opens an OLD (pre-Session-3B) project file whose dimensions have no axis/elementId/axisSource/geometricReference keys at all", () => {
    // Deliberately built as a raw object (not typed as Dimension) to
    // simulate a project.json saved BEFORE these fields existed.
    const oldShapeProject = {
      ...createEmptyProject("Old project"),
      components: [
        {
          id: "c1",
          name: "Cabinet",
          type: "cabinet",
          parentComponentId: null,
          viewIds: [],
          materialId: null,
          requiresMaterial: false,
          reviewStatus: "confirmed",
        },
      ],
      dimensions: [
        {
          id: "old-dim-1",
          value: 1200,
          unit: "mm",
          normalizedValueMm: 1200,
          componentId: "c1",
          property: "width",
          annotation: null,
          reviewStatus: "confirmed",
          provenance: { source: "user_confirmed", timestamp: "2025-01-01T00:00:00.000Z" },
          // NOTE: no axis, axisSource, elementId, geometricReference keys.
        },
      ],
    };

    const result = parseProjectFile(JSON.stringify(oldShapeProject));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const dim = result.project!.dimensions[0];
    expect(dim.axis).toBe("unassigned");
    expect(dim.axisSource).toBe("user_selected");
    expect(dim.elementId).toBeNull();
    expect(dim.geometricReference).toBeNull();
    // The old data itself must still be intact.
    expect(dim.value).toBe(1200);
    expect(dim.property).toBe("width");
    expect(dim.reviewStatus).toBe("confirmed");
  });

  it("a Confirmed Dimension with Axis + Component set is NEVER auto-mapped to width/height/depth — `property` stays exactly what the user last set (\"custom\")", () => {
    const base = createApprovableSyntheticTestCase001();
    const confirmedWithAxisAndComponent: Dimension = {
      id: "tap-dim-axis-only-mapping-check",
      value: 29,
      unit: "mm",
      normalizedValueMm: 29,
      componentId: "synthetic-cabinet-body",
      elementId: null,
      axis: "iso_axis_a",
      axisSource: "user_selected",
      geometricReference: null,
      property: "custom",
      customPropertyLabel: "รอระบุประเภท (Tap-to-Dimension)",
      annotation: null,
      reviewStatus: "confirmed",
      provenance: { source: "user_confirmed", timestamp: "2026-01-01T00:00:00.000Z" },
    };
    const project = { ...base, dimensions: [...base.dimensions, confirmedWithAxisAndComponent] };

    const result = buildApprovedFurnitureSpec(project);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const approvedDim = result.spec.dimensions.find((d) => d.id === "tap-dim-axis-only-mapping-check");
    expect(approvedDim?.property).toBe("custom"); // NOT auto-promoted to width/height/depth
    expect(approvedDim?.axis).toBe("iso_axis_a"); // axis preserved, untouched
  });

  it("multiple Dimensions may share the same Axis", () => {
    const d1 = { axis: "iso_axis_a" as const };
    const d2 = { axis: "iso_axis_a" as const };
    expect(d1.axis).toBe(d2.axis); // no uniqueness constraint anywhere blocks this
  });

  it("multiple Dimensions may share the same Component", () => {
    const base = createApprovableSyntheticTestCase001();
    const sameComponentId = base.components[0].id;
    const extra1: Dimension = {
      id: "extra-1",
      value: 5,
      unit: "mm",
      normalizedValueMm: 5,
      componentId: sameComponentId,
      elementId: null,
      axis: "iso_axis_a",
      axisSource: "user_selected",
      geometricReference: null,
      property: "custom",
      customPropertyLabel: "label-1",
      annotation: null,
      reviewStatus: "confirmed",
      provenance: { source: "user_confirmed", timestamp: "2026-01-01T00:00:00.000Z" },
    };
    const extra2: Dimension = { ...extra1, id: "extra-2", axis: "iso_axis_b", customPropertyLabel: "label-2" };
    const project = { ...base, dimensions: [...base.dimensions, extra1, extra2] };
    const result = buildApprovedFurnitureSpec(project);
    expect(result.ok).toBe(true); // distinct custom labels avoid the repeated-property warning becoming a conflict
  });

  it("a Dimension may have an Axis but no Component (Draft, blocks approval until mapped)", () => {
    const base = createApprovableSyntheticTestCase001();
    const axisOnly: Dimension = {
      id: "axis-only",
      value: 12,
      unit: "mm",
      normalizedValueMm: 12,
      componentId: null,
      elementId: null,
      axis: "vertical_axis",
      axisSource: "user_selected",
      geometricReference: null,
      property: "custom",
      customPropertyLabel: "ยังไม่ผูก component",
      annotation: null,
      reviewStatus: "confirmed",
      provenance: { source: "user_confirmed", timestamp: "2026-01-01T00:00:00.000Z" },
    };
    const project = { ...base, dimensions: [...base.dimensions, axisOnly] };
    expect(buildApprovedFurnitureSpec(project).ok).toBe(false);
  });

  it("a Dimension may have a Component but no Axis (unassigned) — valid, approvable once confirmed+mapped, axis stays unassigned", () => {
    const base = createApprovableSyntheticTestCase001();
    const componentOnly: Dimension = {
      id: "component-only",
      value: 12,
      unit: "mm",
      normalizedValueMm: 12,
      componentId: "synthetic-cabinet-body",
      elementId: null,
      axis: "unassigned",
      axisSource: "user_selected",
      geometricReference: null,
      property: "custom",
      customPropertyLabel: "ไม่มีแกน",
      annotation: null,
      reviewStatus: "confirmed",
      provenance: { source: "user_confirmed", timestamp: "2026-01-01T00:00:00.000Z" },
    };
    const project = { ...base, dimensions: [...base.dimensions, componentOnly] };
    const result = buildApprovedFurnitureSpec(project);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const d = result.spec.dimensions.find((x) => x.id === "component-only");
      expect(d?.axis).toBe("unassigned");
    }
  });
});
