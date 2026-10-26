import type { Dimension, DimensionSpan, ProjectFile } from "../types/project";
import { RESOLVED_STATUSES } from "../types/project";
import { isValidValueForProperty, toMillimeters } from "./units";

export type ValidationSeverity = "blocking" | "warning";

export type ValidationEntityType =
  | "dimension"
  | "component"
  | "span"
  | "project";

export interface ValidationIssue {
  severity: ValidationSeverity;
  code: string;
  message: string;
  entityType: ValidationEntityType;
  entityId: string;
}

const EPSILON_MM = 0.01;

/**
 * Deterministic, rule-based validation. No AI, no guessing — every issue
 * here is derived mechanically from data the user explicitly entered (see
 * CLAUDE.md §4 and §6).
 */
export function validateProject(project: ProjectFile): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (project.components.length === 0) {
    issues.push({
      severity: "blocking",
      code: "PROJECT_NO_COMPONENTS",
      message: "โปรเจกต์ยังไม่มีส่วนประกอบ (component) ใดเลย",
      entityType: "project",
      entityId: project.projectId,
    });
  }
  if (project.dimensions.length === 0) {
    issues.push({
      severity: "blocking",
      code: "PROJECT_NO_DIMENSIONS",
      message: "โปรเจกต์ยังไม่มีมิติ (dimension) ใดเลย",
      entityType: "project",
      entityId: project.projectId,
    });
  }

  validateDimensions(project, issues);
  validateRepeatedAndConflictingProperties(project, issues);
  validateMaterials(project, issues);
  validateSpanChains(project, issues);

  return issues;
}

export function isApprovable(project: ProjectFile): boolean {
  return !validateProject(project).some((i) => i.severity === "blocking");
}

function validateDimensions(
  project: ProjectFile,
  issues: ValidationIssue[],
): void {
  for (const dim of project.dimensions) {
    if (!isValidValueForProperty(dim.value, dim.property)) {
      issues.push({
        severity: "blocking",
        code: "DIMENSION_INVALID_VALUE",
        message: `มิตินี้มีค่าตัวเลขไม่ถูกต้องสำหรับคุณสมบัติ "${dim.property}" (ค่า: ${dim.value})`,
        entityType: "dimension",
        entityId: dim.id,
      });
    }

    const expectedMm = toMillimeters(dim.value, dim.unit);
    if (Math.abs(expectedMm - dim.normalizedValueMm) > EPSILON_MM) {
      issues.push({
        severity: "blocking",
        code: "DIMENSION_NORMALIZATION_MISMATCH",
        message: `ค่าที่แปลงเป็นมิลลิเมตรไม่ตรงกับค่าต้นฉบับ (${dim.value} ${dim.unit} ควรเป็น ${expectedMm} mm แต่บันทึกไว้ ${dim.normalizedValueMm} mm)`,
        entityType: "dimension",
        entityId: dim.id,
      });
    }

    if (dim.property === "custom" && !dim.customPropertyLabel?.trim()) {
      issues.push({
        severity: "blocking",
        code: "DIMENSION_CUSTOM_LABEL_MISSING",
        message: "มิติที่กำหนดคุณสมบัติเป็น custom ต้องระบุชื่อคุณสมบัติ",
        entityType: "dimension",
        entityId: dim.id,
      });
    }

    if (!dim.componentId) {
      issues.push({
        severity: "blocking",
        code: "DIMENSION_MISSING_COMPONENT",
        message: "มิตินี้ยังไม่ได้ผูกกับส่วนประกอบ (component) ใดเลย",
        entityType: "dimension",
        entityId: dim.id,
      });
    }

    if (!RESOLVED_STATUSES.includes(dim.reviewStatus)) {
      issues.push({
        severity: "blocking",
        code: "DIMENSION_UNRESOLVED_STATUS",
        message: `มิตินี้ยังไม่ได้รับการยืนยัน (สถานะปัจจุบัน: ${dim.reviewStatus})`,
        entityType: "dimension",
        entityId: dim.id,
      });
    }
  }
}

function propertyGroupKey(dim: Dimension): string {
  const propKey =
    dim.property === "custom"
      ? `custom:${dim.customPropertyLabel ?? ""}`
      : dim.property;
  return `${dim.componentId}::${propKey}`;
}

function validateRepeatedAndConflictingProperties(
  project: ProjectFile,
  issues: ValidationIssue[],
): void {
  const groups = new Map<string, Dimension[]>();
  for (const dim of project.dimensions) {
    if (!dim.componentId) continue;
    const key = propertyGroupKey(dim);
    const arr = groups.get(key) ?? [];
    arr.push(dim);
    groups.set(key, arr);
  }

  for (const dims of groups.values()) {
    if (dims.length <= 1) continue;

    for (const dim of dims) {
      issues.push({
        severity: "warning",
        code: "COMPONENT_REPEATED_PROPERTY",
        message: `ส่วนประกอบนี้มีมิติคุณสมบัติ "${dim.property}" มากกว่า 1 รายการ — ต้องตรวจสอบว่ารายการใดถูกต้อง`,
        entityType: "dimension",
        entityId: dim.id,
      });
    }

    const confirmed = dims.filter((d) => d.reviewStatus === "confirmed");
    const distinctValues = new Set(
      confirmed.map((d) => Math.round(d.normalizedValueMm * 1000) / 1000),
    );
    if (distinctValues.size > 1) {
      for (const dim of confirmed) {
        issues.push({
          severity: "blocking",
          code: "COMPONENT_PROPERTY_CONFLICT",
          message: `ค่ามิติ "${dim.property}" ของส่วนประกอบเดียวกันขัดแย้งกันระหว่างรายการที่ยืนยันแล้ว (${[...distinctValues].join(" mm, ")} mm)`,
          entityType: "dimension",
          entityId: dim.id,
        });
      }
    }
  }
}

function validateMaterials(
  project: ProjectFile,
  issues: ValidationIssue[],
): void {
  for (const comp of project.components) {
    if (comp.requiresMaterial && !comp.materialId) {
      issues.push({
        severity: "blocking",
        code: "COMPONENT_MISSING_MATERIAL",
        message: `ส่วนประกอบ "${comp.name}" ยังไม่ได้กำหนดวัสดุ (material)`,
        entityType: "component",
        entityId: comp.id,
      });
    }
  }
}

function validateSpanChains(
  project: ProjectFile,
  issues: ValidationIssue[],
): void {
  const childrenByParent = new Map<string, DimensionSpan[]>();
  for (const span of project.spans) {
    if (!span.parentSpanId) continue;
    const arr = childrenByParent.get(span.parentSpanId) ?? [];
    arr.push(span);
    childrenByParent.set(span.parentSpanId, arr);
  }

  const dimById = new Map(project.dimensions.map((d) => [d.id, d]));
  const spanById = new Map(project.spans.map((s) => [s.id, s]));

  for (const [parentId, children] of childrenByParent) {
    const parentSpan = spanById.get(parentId);
    if (!parentSpan?.dimensionId) continue;
    const parentDim = dimById.get(parentSpan.dimensionId);
    if (!parentDim) continue;

    const childDims = children.map((c) =>
      c.dimensionId ? dimById.get(c.dimensionId) : undefined,
    );
    // Chain explicitly declared but not fully populated yet: allowed in a
    // draft, nothing to validate yet.
    if (childDims.some((d) => !d)) continue;

    const sum = childDims.reduce(
      (acc, d) => acc + (d as Dimension).normalizedValueMm,
      0,
    );
    if (Math.abs(sum - parentDim.normalizedValueMm) > EPSILON_MM) {
      issues.push({
        severity: "blocking",
        code: "SPAN_CHAIN_SUM_MISMATCH",
        message: `ผลรวมของสายโซ่มิติ (dimension chain) ไม่เท่ากับมิติหลัก: ${sum} mm ≠ ${parentDim.normalizedValueMm} mm`,
        entityType: "span",
        entityId: parentId,
      });
    }
  }
}
