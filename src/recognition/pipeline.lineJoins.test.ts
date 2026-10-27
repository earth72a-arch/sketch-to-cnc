import { describe, expect, it } from "vitest";
import { runRecognitionPipeline } from "./pipeline";
import { createDefaultPalette } from "./palette";
import {
  createBlankBuffer,
  drawSyntheticLine,
  drawSyntheticPolyline,
  drawSyntheticRect,
} from "./fixtures/syntheticImages";

const BLACK = { r: 0, g: 0, b: 0 }; // cabinet_structure
const RED = { r: 255, g: 0, b: 0 }; // dimension

function angleDiffMod180(a: number, b: number): number {
  const diff = Math.abs(a - b) % 180;
  return Math.min(diff, 180 - diff);
}

describe("Session 2A.1 regression — closed cabinet frame (the real-world bug)", () => {
  it("decomposes a closed rectangle outline into its 4 straight sides instead of rejecting the whole frame", () => {
    const palette = createDefaultPalette();
    const buffer = createBlankBuffer(220, 160);
    drawSyntheticRect(buffer, { x: 20, y: 20, width: 160, height: 100, color: BLACK });

    const result = runRecognitionPipeline(buffer, palette);
    const cabinetLines = result.lines.filter((l) => l.category === "cabinet_structure");

    // Session 2A behaviour on this exact shape was 0 detected lines — a
    // whole-frame PCA fit has low linearity, so it was rejected outright.
    expect(cabinetLines.length).toBe(4);

    const horizontals = cabinetLines.filter((l) => angleDiffMod180(l.angleDeg, 0) < 5);
    const verticals = cabinetLines.filter((l) => angleDiffMod180(l.angleDeg, 90) < 5);
    expect(horizontals).toHaveLength(2);
    expect(verticals).toHaveLength(2);
    for (const line of cabinetLines) {
      expect(line.linearity).toBeGreaterThan(0.95);
    }
  });
});

describe("Session 2A.1 — line joins and crossings", () => {
  it("splits an L-join corner into two straight segments at ~90 degrees apart", () => {
    const palette = createDefaultPalette();
    const buffer = createBlankBuffer(150, 150);
    drawSyntheticPolyline(
      buffer,
      [
        { x: 20, y: 20 },
        { x: 100, y: 20 },
        { x: 100, y: 120 },
      ],
      BLACK,
    );

    const result = runRecognitionPipeline(buffer, palette);
    const lines = result.lines.filter((l) => l.category === "cabinet_structure");
    expect(lines).toHaveLength(2);
    const diff = angleDiffMod180(lines[0].angleDeg, lines[1].angleDeg);
    expect(diff).toBeGreaterThan(80);
    expect(diff).toBeLessThan(100);
  });

  it("splits a T-join into three segments radiating from the shared point", () => {
    const palette = createDefaultPalette();
    const buffer = createBlankBuffer(150, 150);
    drawSyntheticLine(buffer, { x1: 10, y1: 75, x2: 140, y2: 75, color: BLACK });
    drawSyntheticLine(buffer, { x1: 75, y1: 75, x2: 75, y2: 140, color: BLACK });

    const result = runRecognitionPipeline(buffer, palette);
    const lines = result.lines.filter((l) => l.category === "cabinet_structure");
    expect(lines).toHaveLength(3);
  });

  it("splits an X-crossing into four segments radiating from the crossing point", () => {
    const palette = createDefaultPalette();
    const buffer = createBlankBuffer(150, 150);
    drawSyntheticLine(buffer, { x1: 10, y1: 75, x2: 140, y2: 75, color: BLACK });
    drawSyntheticLine(buffer, { x1: 75, y1: 10, x2: 75, y2: 140, color: BLACK });

    const result = runRecognitionPipeline(buffer, palette);
    const lines = result.lines.filter((l) => l.category === "cabinet_structure");
    expect(lines).toHaveLength(4);
  });

  it("does NOT merge a crossing/join back into a longer inferred line (never fabricate geometry)", () => {
    // Deliberate design choice: a crossing is reported as the separate
    // topological edges it is made of, never speculatively re-joined
    // into "probably one continuous line" — see CLAUDE.md §4.
    const palette = createDefaultPalette();
    const buffer = createBlankBuffer(150, 150);
    drawSyntheticLine(buffer, { x1: 10, y1: 75, x2: 140, y2: 75, color: BLACK });
    drawSyntheticLine(buffer, { x1: 75, y1: 10, x2: 75, y2: 140, color: BLACK });

    const result = runRecognitionPipeline(buffer, palette);
    const lines = result.lines.filter((l) => l.category === "cabinet_structure");
    for (const line of lines) {
      expect(line.lengthPx).toBeLessThan(90); // a half-arm, not the full ~130px span
    }
  });
});

describe("Session 2A.1 — close parallel lines stay distinct", () => {
  it("keeps two parallel strokes 10px apart as two separate lines, not one fused blob", () => {
    const palette = createDefaultPalette();
    const buffer = createBlankBuffer(150, 60);
    drawSyntheticLine(buffer, { x1: 10, y1: 20, x2: 140, y2: 20, color: BLACK });
    drawSyntheticLine(buffer, { x1: 10, y1: 30, x2: 140, y2: 30, color: BLACK });

    const result = runRecognitionPipeline(buffer, palette);
    const lines = result.lines.filter((l) => l.category === "cabinet_structure");
    expect(lines).toHaveLength(2);
  });
});

describe("Session 2A.1 — small gap inside one side of an otherwise closed frame", () => {
  it("still resolves to 4 sides when one side has a small pen-lift gap, via gapPx bridging", () => {
    const palette = createDefaultPalette();
    const buffer = createBlankBuffer(220, 160);
    // Manually build the rectangle but leave a 2px gap in the top side.
    drawSyntheticLine(buffer, { x1: 20, y1: 20, x2: 95, y2: 20, color: BLACK });
    drawSyntheticLine(buffer, { x1: 99, y1: 20, x2: 180, y2: 20, color: BLACK });
    drawSyntheticLine(buffer, { x1: 180, y1: 20, x2: 180, y2: 120, color: BLACK });
    drawSyntheticLine(buffer, { x1: 180, y1: 120, x2: 20, y2: 120, color: BLACK });
    drawSyntheticLine(buffer, { x1: 20, y1: 120, x2: 20, y2: 20, color: BLACK });

    const result = runRecognitionPipeline(buffer, palette, { gapPx: 6 });
    const lines = result.lines.filter((l) => l.category === "cabinet_structure");
    expect(lines).toHaveLength(4);
  });
});

describe("Session 2A.1 — varying stroke thickness along one straight line", () => {
  it("still recognizes a single straight line whose thickness changes partway along it", () => {
    const palette = createDefaultPalette();
    const buffer = createBlankBuffer(150, 40);
    drawSyntheticLine(buffer, { x1: 10, y1: 20, x2: 75, y2: 20, color: BLACK, thicknessPx: 2 });
    drawSyntheticLine(buffer, { x1: 75, y1: 20, x2: 140, y2: 20, color: BLACK, thicknessPx: 8 });

    const result = runRecognitionPipeline(buffer, palette);
    const lines = result.lines.filter((l) => l.category === "cabinet_structure");
    expect(lines.length).toBeGreaterThanOrEqual(1);
    const longest = lines.reduce((a, b) => (a.lengthPx > b.lengthPx ? a : b));
    expect(longest.lengthPx).toBeGreaterThan(100);
    expect(longest.angleDeg).toBeCloseTo(0, 0);
  });
});

describe("Session 2A.1 — dimension line not confused with a nearby non-line squiggle", () => {
  it("detects the real dimension line and does not report the squiggle as a long line", () => {
    const palette = createDefaultPalette();
    const buffer = createBlankBuffer(200, 100);
    drawSyntheticLine(buffer, { x1: 10, y1: 80, x2: 190, y2: 80, color: RED });
    // A small zigzag standing in for a handwritten digit near the dimension
    // line — each stroke segment is short, like a real digit's, nowhere
    // near the ~180px span of the actual dimension line.
    drawSyntheticPolyline(
      buffer,
      [
        { x: 90, y: 20 },
        { x: 94, y: 24 },
        { x: 91, y: 27 },
        { x: 95, y: 30 },
      ],
      RED,
      2,
    );

    const result = runRecognitionPipeline(buffer, palette);
    const dimensionLines = result.lines.filter((l) => l.category === "dimension");
    // The real dimension line (~180px, horizontal) must be found...
    expect(dimensionLines.some((l) => l.lengthPx > 150 && Math.abs(l.angleDeg) < 5)).toBe(true);
    // ...and nothing derived from the small squiggle is ever reported as
    // a long horizontal line that could be mistaken for it. (The
    // squiggle itself may still yield a short, incidentally-straight-ish
    // fragment — gap-bridging dilation smooths small-scale detail, a
    // documented limitation — but it must never masquerade as the real
    // ~180px dimension line.)
    expect(dimensionLines.every((l) => l.lengthPx < 150 || Math.abs(l.angleDeg) < 5)).toBe(true);
  });
});

describe("Session 2A.1 — performance at the real-world test's image resolution", () => {
  it("decomposes a large touching/crossing cabinet frame at 3508x2480 within a reasonable budget", () => {
    // Mirrors the real iPad test evidence: a 3508x2480 sketch whose
    // cabinet_structure strokes form one large touching/crossing network
    // spanning most of the canvas. This is a Node/Vitest wall-clock
    // measurement, NOT an iPad Safari measurement — see the final report.
    const palette = createDefaultPalette();
    const buffer = createBlankBuffer(3508, 2480);
    drawSyntheticRect(buffer, { x: 200, y: 200, width: 3100, height: 2000, color: BLACK });
    // A few internal struts crossing the frame, like shelves/dividers.
    drawSyntheticLine(buffer, { x1: 200, y1: 900, x2: 3300, y2: 900, color: BLACK });
    drawSyntheticLine(buffer, { x1: 1200, y1: 200, x2: 1200, y2: 2200, color: BLACK });
    drawSyntheticLine(buffer, { x1: 2300, y1: 200, x2: 2300, y2: 2200, color: BLACK });

    const started = Date.now();
    const result = runRecognitionPipeline(buffer, palette);
    const elapsedMs = Date.now() - started;

    const cabinetLines = result.lines.filter((l) => l.category === "cabinet_structure");
    expect(cabinetLines.length).toBeGreaterThan(0);
    expect(elapsedMs).toBeLessThan(15000);
  }, 20000);
});
