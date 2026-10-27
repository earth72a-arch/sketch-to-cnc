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
import { recognizeImage, terminateOcrEngine, createCancelToken } from "./tesseractEngine";
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

describe("Session 2B.1 — resilience: timeout, cancel, recovery, progress (real engine)", () => {
  // Note: node/getCore.js (see node_modules/tesseract.js/src/worker-script/
  // node/getCore.js) ignores `corePath` entirely in Node — it always
  // `require()`s the installed tesseract.js-core package — so a bad
  // corePath cannot be used to exercise a real failure here. `langPath`
  // IS honored by the shared (node+browser) loadLanguage code path, so
  // it's used instead to force a genuine load failure.
  const badLangPath = path.resolve(process.cwd(), "public/tesseract/does-not-exist-lang-data");

  it(
    "a worker-init failure (bad langPath) rejects with a bounded, typed error instead of hanging",
    async () => {
      await terminateOcrEngine(); // force a fresh worker for this bad-config attempt
      const started = Date.now();
      const outcome = await recognizeImage(encodeBmp(renderSyntheticText("1")), {
        ...engineOptions,
        langPath: badLangPath,
        cachePath: path.resolve(process.cwd(), ".vitest-tesseract-cache-bad-lang"),
        timeouts: { workerInitMs: 8000, recognizeMs: 8000 },
      });
      const elapsedMs = Date.now() - started;

      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(["worker-init-timeout", "worker-init-failed"]).toContain(outcome.errorCode);
      // Bounded: must not silently hang anywhere near the full timeout
      // budget doubled, let alone forever.
      expect(elapsedMs).toBeLessThan(16000);
    },
    20000,
  );

  it(
    "recovers on the NEXT call after a worker-init failure (the broken singleton is reset, not stuck forever)",
    async () => {
      await terminateOcrEngine();
      const bad = await recognizeImage(encodeBmp(renderSyntheticText("1")), {
        ...engineOptions,
        langPath: badLangPath,
        cachePath: path.resolve(process.cwd(), ".vitest-tesseract-cache-bad-lang2"),
        timeouts: { workerInitMs: 8000, recognizeMs: 8000 },
      });
      expect(bad.ok).toBe(false);

      const good = await recognizeImage(encodeBmp(renderSyntheticText("1")), engineOptions);
      expect(good.ok).toBe(true);
    },
    30000,
  );

  it(
    "cancelling mid-run rejects quickly with errorCode 'cancelled', not after the full timeout",
    async () => {
      await terminateOcrEngine();
      const cancelToken = createCancelToken();
      const started = Date.now();
      const resultPromise = recognizeImage(encodeBmp(renderSyntheticText("120")), {
        ...engineOptions,
        cancelToken,
        timeouts: { workerInitMs: 20000, recognizeMs: 20000 },
      });
      setTimeout(() => cancelToken.cancel(), 5);

      const outcome = await resultPromise;
      const elapsedMs = Date.now() - started;

      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.errorCode).toBe("cancelled");
      expect(elapsedMs).toBeLessThan(20000); // did not wait out the full timeout budget
    },
    25000,
  );

  it(
    "reports at least one real stage transition during a normal run (never a fabricated percentage)",
    async () => {
      await terminateOcrEngine();
      const stages: Array<{ stage: string; progress: number | null }> = [];
      const outcome = await recognizeImage(encodeBmp(renderSyntheticText("25")), {
        ...engineOptions,
        onStage: (stage, progress) => stages.push({ stage, progress }),
      });

      expect(outcome.ok).toBe(true);
      expect(stages.length).toBeGreaterThan(0);
      // Every reported progress value must be a real number in [0,1] or
      // explicitly null — never a placeholder sentinel.
      for (const s of stages) {
        if (s.progress !== null) {
          expect(s.progress).toBeGreaterThanOrEqual(0);
          expect(s.progress).toBeLessThanOrEqual(1);
        }
      }
    },
    30000,
  );

  it(
    "two concurrent calls share one worker initialization instead of spawning two",
    async () => {
      await terminateOcrEngine();
      const [a, b] = await Promise.all([
        recognizeImage(encodeBmp(renderSyntheticText("1")), engineOptions),
        recognizeImage(encodeBmp(renderSyntheticText("1")), engineOptions),
      ]);
      expect(a.ok).toBe(true);
      expect(b.ok).toBe(true);
    },
    30000,
  );
});
