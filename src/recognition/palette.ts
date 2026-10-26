import type { Palette, PaletteEntry } from "./types";

/** Default color convention (Session 2A spec). Users may edit color and
 * tolerance per category in the Recognition Inspector — this is only the
 * starting point, never a hardcoded assumption baked into results. */
export function createDefaultPalette(): Palette {
  const entries: PaletteEntry[] = [
    { category: "cabinet_structure", color: { r: 0, g: 0, b: 0 }, tolerance: 60 },
    { category: "door_front", color: { r: 0, g: 0, b: 255 }, tolerance: 60 },
    { category: "dimension", color: { r: 255, g: 0, b: 0 }, tolerance: 60 },
    { category: "comment", color: { r: 0, g: 160, b: 0 }, tolerance: 60 },
    { category: "detail_view", color: { r: 128, g: 0, b: 128 }, tolerance: 60 },
  ];
  const palette = {} as Palette;
  for (const entry of entries) palette[entry.category] = entry;
  return palette;
}
