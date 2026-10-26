import { describe, expect, it } from "vitest";
import { projectReducer } from "./projectReducer";
import { createEmptyProject } from "../types/project";
import { createSyntheticTestCase001 } from "../fixtures/testCase001.synthetic";

describe("projectReducer — component relationships", () => {
  it("adds a component and links it as a parent of another", () => {
    let project = createEmptyProject("test");
    project = projectReducer(project, {
      type: "ADD_COMPONENT",
      component: {
        id: "body",
        name: "Cabinet Body",
        type: "cabinet_body",
        parentComponentId: null,
        viewIds: [],
        materialId: null,
        requiresMaterial: true,
        reviewStatus: "read",
      },
    });
    project = projectReducer(project, {
      type: "ADD_COMPONENT",
      component: {
        id: "door",
        name: "Door",
        type: "door_left",
        parentComponentId: "body",
        viewIds: [],
        materialId: null,
        requiresMaterial: true,
        reviewStatus: "read",
      },
    });

    expect(project.components).toHaveLength(2);
    expect(project.components.find((c) => c.id === "door")?.parentComponentId).toBe("body");
  });

  it("clears dangling componentId references on dimensions/spans when a component is deleted", () => {
    const project = createSyntheticTestCase001();
    const afterDelete = projectReducer(project, {
      type: "DELETE_COMPONENT",
      id: "synthetic-door-left",
    });

    expect(afterDelete.components.some((c) => c.id === "synthetic-door-left")).toBe(false);
    const orphanedDimension = afterDelete.dimensions.find(
      (d) => d.id === "synthetic-dim-door-left-width",
    );
    expect(orphanedDimension?.componentId).toBeNull();
    const orphanedSpan = afterDelete.spans.find(
      (s) => s.id === "synthetic-span-door-left-width",
    );
    expect(orphanedSpan?.componentId).toBeNull();
  });

  it("is a pure function — does not mutate the input project", () => {
    const project = createEmptyProject("test");
    const snapshot = JSON.stringify(project);
    projectReducer(project, { type: "RENAME_PROJECT", name: "renamed" });
    expect(JSON.stringify(project)).toBe(snapshot);
  });
});

describe("projectReducer — dimension status transitions", () => {
  it("moves a dimension from read to confirmed only via an explicit, single action", () => {
    const project = createSyntheticTestCase001();
    const before = project.dimensions.find((d) => d.id === "synthetic-dim-overall-width");
    expect(before?.reviewStatus).toBe("read");

    const after = projectReducer(project, {
      type: "SET_DIMENSION_STATUS",
      id: "synthetic-dim-overall-width",
      status: "confirmed",
    });

    const updated = after.dimensions.find((d) => d.id === "synthetic-dim-overall-width");
    expect(updated?.reviewStatus).toBe("confirmed");

    // Every other still-unconfirmed dimension must remain untouched —
    // there is no "confirm all" behavior anywhere in this reducer.
    const stillRead = after.dimensions.filter((d) => d.reviewStatus === "read");
    expect(stillRead.length).toBe(3);
  });

  it("clears the dimensionId reference on spans when a dimension is deleted", () => {
    const project = createSyntheticTestCase001();
    const after = projectReducer(project, {
      type: "DELETE_DIMENSION",
      id: "synthetic-dim-door-left-width",
    });
    const span = after.spans.find((s) => s.id === "synthetic-span-door-left-width");
    expect(span?.dimensionId).toBeNull();
  });

  it("supports marking a dimension ambiguous or conflicting", () => {
    const project = createSyntheticTestCase001();
    const ambiguous = projectReducer(project, {
      type: "SET_DIMENSION_STATUS",
      id: "synthetic-dim-depth",
      status: "ambiguous",
      note: "เส้นวัดไม่ชัดเจนในภาพ",
    });
    const dim = ambiguous.dimensions.find((d) => d.id === "synthetic-dim-depth");
    expect(dim?.reviewStatus).toBe("ambiguous");
    expect(dim?.note).toBe("เส้นวัดไม่ชัดเจนในภาพ");
  });
});

describe("projectReducer — load/reset", () => {
  it("LOAD_PROJECT replaces the whole project state", () => {
    const empty = createEmptyProject("empty");
    const loaded = createSyntheticTestCase001();
    const result = projectReducer(empty, { type: "LOAD_PROJECT", project: loaded });
    expect(result).toEqual(loaded);
  });

  it("RESET_PROJECT produces a fresh empty project with seed materials", () => {
    const project = createSyntheticTestCase001();
    const result = projectReducer(project, { type: "RESET_PROJECT", projectName: "new" });
    expect(result.components).toHaveLength(0);
    expect(result.dimensions).toHaveLength(0);
    expect(result.materials.length).toBeGreaterThan(0);
    expect(result.projectName).toBe("new");
  });
});
