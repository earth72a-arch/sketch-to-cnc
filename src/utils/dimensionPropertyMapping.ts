import type { Dimension, DimensionProperty } from "../types/project";

/**
 * Session 3B §6 — the ONE explicit "Mapping/Adapter" step that is
 * allowed to set a Dimension's `property` (Width/Height/Depth/...).
 * Every parameter here must come from a human's deliberate choice in
 * the UI (the Dimension Editor's property dropdown) — this function
 * itself performs NO inference from `axis`, `componentId`, or
 * `geometricReference`, and nothing elsewhere in the codebase may set
 * `property` automatically from those fields (Session 3B §6: "ห้ามให้
 * Dimension ที่มี Axis + Component อย่างเดียวถูกนำไปกำหนด Width / Height
 * / Depth โดยอัตโนมัติ"). Confirming a Dimension's VALUE
 * (`reviewStatus: "confirmed"`) is a SEPARATE action from mapping it to
 * a property — calling this does not change `reviewStatus`, and setting
 * `reviewStatus` elsewhere never calls this.
 */
export function mapDimensionToProperty(
  dimension: Dimension,
  property: DimensionProperty,
  customPropertyLabel?: string,
): Dimension {
  return {
    ...dimension,
    property,
    customPropertyLabel: property === "custom" ? customPropertyLabel : undefined,
  };
}
