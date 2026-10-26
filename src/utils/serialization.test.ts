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
import { createEmptyProject } from "../types/project";

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
});
