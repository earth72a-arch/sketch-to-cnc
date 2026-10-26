import { describe, expect, it } from "vitest";
import { validateProject, isApprovable } from "./validation";
import {
  createApprovableSyntheticTestCase001,
  createSyntheticTestCase001,
} from "../fixtures/testCase001.synthetic";
import { createEmptyProject } from "../types/project";

describe("validateProject — Test Case 001 (synthetic) draft", () => {
  const project = createSyntheticTestCase001();
  const issues = validateProject(project);

  it("flags unconfirmed 'read' dimensions as blocking", () => {
    const unresolved = issues.filter((i) => i.code === "DIMENSION_UNRESOLVED_STATUS");
    // overall width, depth, door-left width, door-right width are still "read"
    expect(unresolved.length).toBe(4);
  });

  it("flags missing material on every component", () => {
    const missingMaterial = issues.filter((i) => i.code === "COMPONENT_MISSING_MATERIAL");
    expect(missingMaterial.length).toBe(3);
  });

  it("does NOT flag the explicit 600+600=1200 chain as a sum mismatch", () => {
    const mismatches = issues.filter((i) => i.code === "SPAN_CHAIN_SUM_MISMATCH");
    expect(mismatches).toHaveLength(0);
  });

  it("does NOT treat cabinet body height (440mm) vs door height (450mm) as a conflict", () => {
    // these are two different components — differing heights are expected
    const conflicts = issues.filter((i) => i.code === "COMPONENT_PROPERTY_CONFLICT");
    expect(conflicts).toHaveLength(0);
  });

  it("is not approvable while blocking issues remain", () => {
    expect(isApprovable(project)).toBe(false);
  });
});

describe("validateProject — Test Case 001 (synthetic) fully resolved", () => {
  it("is approvable once dimensions are confirmed and materials assigned", () => {
    const project = createApprovableSyntheticTestCase001();
    const issues = validateProject(project);
    expect(issues.filter((i) => i.severity === "blocking")).toHaveLength(0);
    expect(isApprovable(project)).toBe(true);
  });
});

describe("validateProject — dimension chain sum mismatch", () => {
  it("flags a chain whose children no longer sum to the parent", () => {
    const project = createApprovableSyntheticTestCase001();
    const broken = {
      ...project,
      dimensions: project.dimensions.map((d) =>
        d.id === "synthetic-dim-door-right-width"
          ? { ...d, value: 650, normalizedValueMm: 650 }
          : d,
      ),
    };
    const issues = validateProject(broken);
    const mismatches = issues.filter((i) => i.code === "SPAN_CHAIN_SUM_MISMATCH");
    expect(mismatches).toHaveLength(1);
  });
});

describe("validateProject — conflicting properties on the same component", () => {
  it("flags two confirmed dimensions with different values for the same component+property", () => {
    const project = createApprovableSyntheticTestCase001();
    const conflicting = {
      ...project,
      dimensions: [
        ...project.dimensions,
        {
          ...project.dimensions.find((d) => d.id === "synthetic-dim-cabinet-body-height")!,
          id: "synthetic-dim-cabinet-body-height-duplicate",
          value: 460,
          normalizedValueMm: 460,
        },
      ],
    };
    const issues = validateProject(conflicting);
    expect(issues.some((i) => i.code === "COMPONENT_PROPERTY_CONFLICT")).toBe(true);
    expect(issues.some((i) => i.code === "COMPONENT_REPEATED_PROPERTY")).toBe(true);
  });
});

describe("validateProject — invalid input handling", () => {
  it("flags NaN / non-finite dimension values", () => {
    const project = createApprovableSyntheticTestCase001();
    const invalid = {
      ...project,
      dimensions: project.dimensions.map((d) =>
        d.id === "synthetic-dim-depth" ? { ...d, value: Number.NaN } : d,
      ),
    };
    const issues = validateProject(invalid);
    expect(issues.some((i) => i.code === "DIMENSION_INVALID_VALUE")).toBe(true);
  });

  it("flags a normalizedValueMm that doesn't match value/unit", () => {
    const project = createApprovableSyntheticTestCase001();
    const invalid = {
      ...project,
      dimensions: project.dimensions.map((d) =>
        d.id === "synthetic-dim-depth" ? { ...d, normalizedValueMm: 9999 } : d,
      ),
    };
    const issues = validateProject(invalid);
    expect(issues.some((i) => i.code === "DIMENSION_NORMALIZATION_MISMATCH")).toBe(true);
  });

  it("flags a dimension with no component association", () => {
    const project = createApprovableSyntheticTestCase001();
    const invalid = {
      ...project,
      dimensions: project.dimensions.map((d) =>
        d.id === "synthetic-dim-depth" ? { ...d, componentId: null } : d,
      ),
    };
    const issues = validateProject(invalid);
    expect(issues.some((i) => i.code === "DIMENSION_MISSING_COMPONENT")).toBe(true);
  });

  it("flags a completely empty project as not approvable", () => {
    const project = createEmptyProject("empty");
    const issues = validateProject(project);
    expect(issues.some((i) => i.code === "PROJECT_NO_COMPONENTS")).toBe(true);
    expect(issues.some((i) => i.code === "PROJECT_NO_DIMENSIONS")).toBe(true);
    expect(isApprovable(project)).toBe(false);
  });
});
