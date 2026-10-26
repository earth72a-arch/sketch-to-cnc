import type { LengthUnit } from "../types/project";

/** Converts a length value in the given unit to millimeters. */
export function toMillimeters(value: number, unit: LengthUnit): number {
  switch (unit) {
    case "mm":
      return value;
    case "cm":
      return value * 10;
    default: {
      const exhaustive: never = unit;
      throw new Error(`Unsupported unit: ${exhaustive}`);
    }
  }
}

/** True if the value is a finite, usable measurement (not NaN/Infinity). */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Properties that must be strictly positive (a zero-length panel makes no sense). */
const STRICTLY_POSITIVE_PROPERTIES = new Set([
  "width",
  "height",
  "depth",
  "spacing",
]);

/** Properties that may legitimately be zero (e.g. a flush overhang/offset). */
const NON_NEGATIVE_PROPERTIES = new Set(["offset", "overhang", "custom"]);

export function isValidValueForProperty(
  value: number,
  property: string,
): boolean {
  if (!isFiniteNumber(value)) return false;
  if (STRICTLY_POSITIVE_PROPERTIES.has(property)) return value > 0;
  if (NON_NEGATIVE_PROPERTIES.has(property)) return value >= 0;
  return value >= 0;
}
