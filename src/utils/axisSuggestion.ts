import type { DimensionAxis } from "../types/project";

/**
 * Session 3B §4 — turns Session 2A.1's ISO Recognition output
 * (`axisCentroidsDeg`, three detected angle clusters with NO inherent
 * "A"/"B"/"Vertical" ordering — see `recognition/axisClustering.ts`)
 * into SUGGESTED, human-labeled axis options. Purely a display/ordering
 * convention computed fresh from the actual detected angles — never a
 * claim about which direction is width/depth/height (CLAUDE.md §4: "ISO
 * Axis เป็น Direction Reference ไม่ใช่ Property Classification").
 *
 * Convention: the detected angle closest to 90° (vertical in image
 * pixel space, y-down) is labeled "Vertical Axis"; the remaining two are
 * labeled "ISO Axis A" / "ISO Axis B" in ascending angle order — a
 * stable, deterministic tie-break, not a physical-direction assertion.
 *
 * Nothing here writes to a Dimension — these are SUGGESTIONS only,
 * returned for the UI to show as tappable hints that the user may
 * accept (which is itself the user's selection — see
 * `DimensionAxisSourceSchema`'s doc comment) or ignore entirely.
 */

export const AXIS_LABEL_TH: Record<DimensionAxis, string> = {
  iso_axis_a: "ISO Axis A",
  iso_axis_b: "ISO Axis B",
  vertical_axis: "Vertical Axis",
  custom: "Custom Direction",
  unassigned: "(ยังไม่ระบุ / Unassigned)",
};

/** Short on-image marker glyph — never claims width/height/depth. */
export const AXIS_SHORT_LABEL: Record<DimensionAxis, string> = {
  iso_axis_a: "A",
  iso_axis_b: "B",
  vertical_axis: "V",
  custom: "C",
  unassigned: "?",
};

export interface SuggestedAxisOption {
  axis: DimensionAxis;
  angleDeg: number;
  label: string;
}

function angleDiffTo90(deg: number): number {
  const mod = ((deg % 180) + 180) % 180;
  return Math.abs(mod - 90);
}

export function suggestAxisOptions(isoAxisCentroidsDeg: readonly number[] | null): SuggestedAxisOption[] {
  if (!isoAxisCentroidsDeg || isoAxisCentroidsDeg.length === 0) return [];

  const sorted = [...isoAxisCentroidsDeg].sort((a, b) => angleDiffTo90(a) - angleDiffTo90(b));
  const [verticalDeg, ...rest] = sorted;
  const [firstDeg, secondDeg] = [...rest].sort((a, b) => a - b);

  const options: SuggestedAxisOption[] = [];
  if (verticalDeg !== undefined) {
    options.push({ axis: "vertical_axis", angleDeg: verticalDeg, label: `Vertical Axis (${verticalDeg.toFixed(1)}°)` });
  }
  if (firstDeg !== undefined) {
    options.push({ axis: "iso_axis_a", angleDeg: firstDeg, label: `ISO Axis A (${firstDeg.toFixed(1)}°)` });
  }
  if (secondDeg !== undefined) {
    options.push({ axis: "iso_axis_b", angleDeg: secondDeg, label: `ISO Axis B (${secondDeg.toFixed(1)}°)` });
  }
  return options;
}
