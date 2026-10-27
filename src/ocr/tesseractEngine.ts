import * as TesseractJS from "tesseract.js";
import type Tesseract from "tesseract.js";
import { raceWithTimeout, type CancelToken } from "./withTimeout";
import { DEFAULT_OCR_TIMEOUTS, type OcrStage, type OcrTimeoutConfig } from "./types";

/**
 * Thin, environment-agnostic wrapper around tesseract.js (Session 2B,
 * revised in Session 2B.1).
 *
 * ROOT CAUSE FIX (Session 2B.1): tesseract.js's browser worker spawner
 * defaults `workerBlobURL` to `true` (confirmed in
 * node_modules/tesseract.js/src/worker/browser/defaultOptions.js and
 * spawnWorker.js) — it wraps the worker script in a `Blob` and does
 * `importScripts("<workerPath>")` from inside a worker created from a
 * `blob:` URL, rather than loading `workerPath` as the worker directly.
 * This project never overrode that default. A blob-URL worker's own
 * `self.location` has no real origin/path context, which is a
 * well-documented source of Safari/WebKit-specific failures for
 * workers that go on to do further resource loading (exactly what
 * happens next: the worker script itself calls `importScripts()` again
 * to load the WASM core — see
 * node_modules/tesseract.js/src/worker-script/browser/getCore.js).
 * Matches both reported symptoms with ONE mechanism: Automatic OCR
 * stuck at "0%" and Manual Region OCR never producing a result are the
 * SAME underlying worker-creation call (this module's singleton)
 * hanging silently — no message ever arrives, so neither the progress
 * logger nor an error/resolve ever fires. `workerBlobURL: false` makes
 * tesseract.js spawn the worker directly via `new Worker(workerPath)`,
 * giving it a real page-relative location. This could not have been
 * caught by this project's existing Node test suite (Session 2B):
 * Node uses a completely different worker/node spawn path
 * (worker_threads), never the browser blob-URL path at all.
 *
 * - Self-hosted assets ONLY: the caller must supply `workerPath`,
 *   `corePath` and `langPath` pointing at files this project serves
 *   itself (see `public/tesseract/`) — never a CDN.
 * - One worker is created and reused across every call until
 *   `terminateOcrEngine()` is called.
 * - Session 2B.1: every engine call (worker init, each recognize
 *   attempt) is raced against a configurable timeout and an optional
 *   shared cancel token (see withTimeout.ts), so a hang — for this
 *   reason or any other — surfaces as a bounded, explicit failure
 *   instead of an indefinite spinner. A timed-out/cancelled worker is
 *   terminated and the singleton reset, so the NEXT attempt gets a
 *   fresh worker rather than queuing behind a dead one.
 * - Never throws: failures come back as a typed `{ ok: false }` result
 *   with an error code so callers/UI can degrade gracefully.
 */

export interface TesseractEngineOptions {
  workerPath?: string;
  corePath?: string;
  langPath?: string;
  cachePath?: string;
  gzip?: boolean;
  timeouts?: OcrTimeoutConfig;
  cancelToken?: CancelToken;
  onStage?: (stage: OcrStage, progress: number | null) => void;
}

export type OcrErrorCode = "worker-init-timeout" | "worker-init-failed" | "recognize-timeout" | "recognize-failed" | "cancelled";

export type OcrEngineOutcome =
  | { ok: true; text: string; confidence: number | null }
  | { ok: false; errorCode: OcrErrorCode; errorMessage: string };

const CHAR_WHITELIST = "0123456789.cmCM";

/** tesseract.js's own logger `status` strings (see
 * node_modules/tesseract.js/src/worker-script/index.js and
 * worker-script/browser/getCore.js) mapped onto this project's
 * user-facing OcrStage enum. Falls back to "initializing-worker" for
 * any status this mapping doesn't recognize, rather than crashing on an
 * unexpected string from a future tesseract.js version. */
function mapLoggerStatusToStage(status: string): OcrStage {
  if (status.includes("loading tesseract core")) return "loading-core";
  if (status.includes("loading language")) return "loading-language";
  if (status.includes("recognizing")) return "recognizing";
  if (status.includes("initializing")) return "initializing-worker";
  return "initializing-worker";
}

let workerPromise: Promise<Tesseract.Worker> | null = null;
let activeOptionsKey: string | null = null;

function optionsKey(options: TesseractEngineOptions): string {
  return JSON.stringify({
    workerPath: options.workerPath ?? null,
    corePath: options.corePath ?? null,
    langPath: options.langPath ?? null,
  });
}

/** Kills the current worker (if any) and clears the singleton so the
 * next call builds a fresh one — used after a timeout/cancel/failure,
 * since a worker that hung or errored once should not be trusted or
 * queued behind for subsequent calls.
 *
 * Deliberately SYNCHRONOUS and never awaits the old `pending` promise:
 * the whole reason this runs is that `pending` may itself be the thing
 * that is hung (e.g. a langPath fetch that never settles). Awaiting it
 * here would re-introduce the exact indefinite hang this function
 * exists to escape — caught by this project's own Session 2B.1 test
 * suite timing out instead of completing in bounded time. The old
 * promise, if it ever does settle later, is cleaned up best-effort via
 * `.then`; if it never settles, it is simply abandoned (harmless: no
 * code still references it once `workerPromise` has been cleared). */
function resetWorker(): void {
  const pending = workerPromise;
  workerPromise = null;
  activeOptionsKey = null;
  pending?.then(
    (worker) => {
      worker.terminate().catch(() => {});
    },
    () => {},
  );
}

function getWorker(options: TesseractEngineOptions): Promise<Tesseract.Worker> {
  const key = optionsKey(options);
  if (workerPromise && activeOptionsKey === key) return workerPromise;

  activeOptionsKey = key;
  workerPromise = (async () => {
    const workerOptions: Partial<Tesseract.WorkerOptions> = {
      gzip: options.gzip ?? true,
      // ROOT CAUSE FIX — see module doc comment above.
      workerBlobURL: false,
      // Without this, tesseract.js re-throws a worker-level error inside
      // its internal message-event handler (in addition to rejecting
      // the in-flight recognize() promise), which becomes an UNCAUGHT
      // exception outside this module's try/catch. Supplying this
      // swallows that second, redundant throw; the real error still
      // reaches the caller via the rejected promise below.
      errorHandler: () => {},
      logger: (m) => options.onStage?.(mapLoggerStatusToStage(m.status), Number.isFinite(m.progress) ? m.progress : null),
    };
    if (options.workerPath) workerOptions.workerPath = options.workerPath;
    if (options.corePath) workerOptions.corePath = options.corePath;
    if (options.langPath) workerOptions.langPath = options.langPath;
    if (options.cachePath) workerOptions.cachePath = options.cachePath;

    options.onStage?.("initializing-worker", null);
    const worker = await TesseractJS.createWorker("eng", TesseractJS.OEM.LSTM_ONLY, workerOptions);
    await worker.setParameters({
      tessedit_char_whitelist: CHAR_WHITELIST,
      tessedit_pageseg_mode: TesseractJS.PSM.SINGLE_LINE,
    });
    return worker;
  })();

  return workerPromise;
}

export async function recognizeImage(
  image: Tesseract.ImageLike,
  options: TesseractEngineOptions = {},
): Promise<OcrEngineOutcome> {
  const timeouts = options.timeouts ?? DEFAULT_OCR_TIMEOUTS;

  let worker: Tesseract.Worker;
  try {
    worker = await raceWithTimeout(getWorker(options), timeouts.workerInitMs, "initializing-worker", options.cancelToken);
  } catch (error) {
    resetWorker();
    return classifyFailure(error, "worker-init-timeout", "worker-init-failed");
  }

  try {
    options.onStage?.("recognizing", null);
    const { data } = await raceWithTimeout(worker.recognize(image), timeouts.recognizeMs, "recognizing", options.cancelToken);
    return {
      ok: true,
      text: data.text,
      confidence: Number.isFinite(data.confidence) ? data.confidence : null,
    };
  } catch (error) {
    const outcome = classifyFailure(error, "recognize-timeout", "recognize-failed");
    // A recognize() call that timed out leaves the worker in an unknown
    // state (still crunching, or genuinely stuck) — don't trust it for
    // the next region; reset so the next call gets a fresh worker.
    if (outcome.errorCode === "recognize-timeout") resetWorker();
    return outcome;
  }
}

function classifyFailure(
  error: unknown,
  timeoutCode: OcrErrorCode,
  genericCode: OcrErrorCode,
): { ok: false; errorCode: OcrErrorCode; errorMessage: string } {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof Error && error.name === "OcrCancelledError") {
    return { ok: false, errorCode: "cancelled", errorMessage: message };
  }
  if (error instanceof Error && error.name === "OcrTimeoutError") {
    return { ok: false, errorCode: timeoutCode, errorMessage: message };
  }
  return { ok: false, errorCode: genericCode, errorMessage: message };
}

/** Releases the OCR worker and its WASM memory. Safe to call even if no
 * worker was ever created. */
export async function terminateOcrEngine(): Promise<void> {
  resetWorker();
}

/** Convenience re-export so callers don't need a second import just to
 * build a cancel token for an OCR run. */
export { createCancelToken, type CancelToken } from "./withTimeout";
