// @vitest-environment node
//
// Session 2B spec §11: "Test the actual OCR engine, not only mocks of
// OCR responses." This file runs under plain Node (not jsdom — see the
// pragma above) so tesseract.js uses its real Node code path
// (worker_threads + fs), exercising the ACTUAL self-hosted WASM engine
// and the ACTUAL self-hosted "fast" English language data this project
// ships under public/tesseract/ — not a mock of either. Input images
// are produced by the hand-authored bitmap font + BMP encoder (see
// fixtures/syntheticText.ts and testSupport/bmpEncoder.node.ts) because
// this project has no canvas/font-rendering dependency to generate real
// glyph pixels any other way (see CLAUDE.md §7 "lightweight
// dependencies" — adding one just for this would be disproportionate).
//
// This is a Node/Vitest measurement, not an iPad Safari measurement —
// see the Session 2B final report for that distinction.
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { recognizeImage, terminateOcrEngine } from "./tesseractEngine";
import { encodeBmp } from "./testSupport/bmpEncoder.node";
import { renderSyntheticText } from "./fixtures/syntheticText";

const engineOptions = {
  langPath: path.resolve(process.cwd(), "public/tesseract/lang-data"),
  cachePath: path.resolve(process.cwd(), ".vitest-tesseract-cache"),
  gzip: true,
};

afterAll(async () => {
  await terminateOcrEngine();
});

describe("tesseractEngine — real engine, self-hosted assets", () => {
  it(
    "reads a clean synthetic '45mm' sample correctly with a numeric confidence",
    async () => {
      const buffer = renderSyntheticText("45mm");
      const outcome = await recognizeImage(encodeBmp(buffer), engineOptions);
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      expect(outcome.text.trim().toLowerCase()).toBe("45mm");
      expect(typeof outcome.confidence).toBe("number");
    },
    30000,
  );

  it(
    "reads a clean synthetic '1' sample correctly (single short digit)",
    async () => {
      const buffer = renderSyntheticText("1");
      const outcome = await recognizeImage(encodeBmp(buffer), engineOptions);
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      expect(outcome.text.trim()).toBe("1");
    },
    30000,
  );

  it(
    "returns a typed failure instead of throwing for a corrupt/invalid image buffer",
    async () => {
      const garbage = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]);
      const outcome = await recognizeImage(garbage, engineOptions);
      expect(outcome.ok).toBe(false);
    },
    30000,
  );

  it(
    "serves a second call fast — proof the engine/model was not reloaded from scratch",
    async () => {
      // Prime the worker (may include first-time engine/model load cost).
      await recognizeImage(encodeBmp(renderSyntheticText("25")), engineOptions);

      const start = Date.now();
      const outcome = await recognizeImage(encodeBmp(renderSyntheticText("60")), engineOptions);
      const elapsedMs = Date.now() - start;

      expect(outcome.ok).toBe(true);
      // A from-scratch engine+model load measured in the thousands of ms
      // in this environment; a reused worker recognizing one short crop
      // comfortably finishes in a small fraction of that.
      expect(elapsedMs).toBeLessThan(3000);
    },
    30000,
  );
});
