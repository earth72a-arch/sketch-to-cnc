import { ProjectFileSchema, type ProjectFile } from "../types/project";
import { validateProject, type ValidationIssue } from "./validation";

export interface ApprovedFurnitureSpec extends ProjectFile {
  kind: "approved_furniture_spec";
  approvedAt: string;
}

export type ApprovalResult =
  | { ok: true; spec: ApprovedFurnitureSpec }
  | { ok: false; issues: ValidationIssue[] };

/**
 * Builds the Approved Furniture Spec in memory. Never returns a spec unless
 * zero blocking validation issues remain (CLAUDE.md §6). Passing
 * JSON.stringify never on its own counts as approval.
 */
export function buildApprovedFurnitureSpec(
  project: ProjectFile,
): ApprovalResult {
  const issues = validateProject(project);
  const blocking = issues.filter((i) => i.severity === "blocking");
  if (blocking.length > 0) {
    return { ok: false, issues: blocking };
  }
  return {
    ok: true,
    spec: {
      ...project,
      kind: "approved_furniture_spec",
      approvedAt: new Date().toISOString(),
    },
  };
}

/** Draft export is always available, even with incomplete information. */
export function serializeDraftProject(project: ProjectFile): string {
  const parsed = ProjectFileSchema.parse(project);
  return JSON.stringify(parsed, null, 2);
}

export function serializeApprovedFurnitureSpec(project: ProjectFile): string {
  const result = buildApprovedFurnitureSpec(project);
  if (!result.ok) {
    throw new Error(
      "Cannot export Approved Furniture Spec: blocking validation issues remain.",
    );
  }
  return JSON.stringify(result.spec, null, 2);
}

export interface ParsedProjectResult {
  ok: boolean;
  project?: ProjectFile;
  error?: string;
}

/** Parses and validates a Project JSON file against the schema. Never
 * trusts the file blindly — malformed or tampered files are rejected. */
export function parseProjectFile(json: string): ParsedProjectResult {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { ok: false, error: "ไฟล์ไม่ใช่ JSON ที่ถูกต้อง" };
  }

  const result = ProjectFileSchema.safeParse(data);
  if (!result.success) {
    return {
      ok: false,
      error: `โครงสร้างไฟล์โปรเจกต์ไม่ถูกต้อง: ${result.error.message}`,
    };
  }
  return { ok: true, project: result.data };
}

/** Triggers a browser download of a JSON string. Browser-only — not used in
 * unit tests, which exercise serialize/parse directly. */
export function triggerJsonDownload(filename: string, json: string): void {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
