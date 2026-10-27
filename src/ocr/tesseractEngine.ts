import * as TesseractJS from "tesseract.js";
import type Tesseract from "tesseract.js";

/**
 * Thin, environment-agnostic wrapper around tesseract.js (Session 2B).
 *
 * - Self-hosted assets ONLY: the caller must supply `workerPath`,
 *   `corePath` and `langPath` pointing at files this project serves
 *   itself (see `public/tesseract/`) — never a CDN, per the Session 2B
 *   "no runtime CDN dependency" / "no customer image transmitted
 *   externally" requirements. In Node (tests), omitting these lets
 *   tesseract.js fall back to resolving its own installed packages,
 *   which is fine there since Node tests never touch a CDN either.
 * - One worker is created and reused across every call (Session 2B
 *   §10 "reuse OCR workers instead of recreating them for every
 *   region") until `terminateOcrEngine()` is called.
 * - Never throws: engine/environment failures (WASM unsupported, OOM,
 *   a self-hosted asset failing to load, etc.) come back as a typed
 *   `{ ok: false }` result so callers can degrade gracefully instead of
 *   crashing the Recognition Inspector.
 */

export interface TesseractEngineOptions {
  workerPath?: string;
  corePath?: string;
  langPath?: string;
  cachePath?: string;
  gzip?: boolean;
  onProgress?: (status: string, progress: number) => void;
}

export type OcrEngineOutcome =
  | { ok: true; text: string; confidence: number | null }
  | { ok: false; errorMessage: string };

const CHAR_WHITELIST = "0123456789.cmCM";

let workerPromise: Promise<Tesseract.Worker> | null = null;
let activeOptionsKey: string | null = null;

function optionsKey(options: TesseractEngineOptions): string {
  return JSON.stringify({
    workerPath: options.workerPath ?? null,
    corePath: options.corePath ?? null,
    langPath: options.langPath ?? null,
  });
}

function getWorker(options: TesseractEngineOptions): Promise<Tesseract.Worker> {
  const key = optionsKey(options);
  if (workerPromise && activeOptionsKey === key) return workerPromise;

  activeOptionsKey = key;
  workerPromise = (async () => {
    const workerOptions: Partial<Tesseract.WorkerOptions> = {
      gzip: options.gzip ?? true,
      // Without this, tesseract.js re-throws a worker-level error inside
      // its internal message-event handler (in addition to rejecting
      // the in-flight recognize() promise), which becomes an UNCAUGHT
      // exception outside this module's try/catch — exactly the
      // "unsupported environment / memory error" case the Session 2B
      // spec requires handling gracefully. Supplying this swallows that
      // second, redundant throw; the real error still reaches the
      // caller via the rejected promise below.
      errorHandler: () => {},
    };
    if (options.workerPath) workerOptions.workerPath = options.workerPath;
    if (options.corePath) workerOptions.corePath = options.corePath;
    if (options.langPath) workerOptions.langPath = options.langPath;
    if (options.cachePath) workerOptions.cachePath = options.cachePath;
    if (options.onProgress) {
      workerOptions.logger = (m) => options.onProgress?.(m.status, m.progress);
    }

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
  try {
    const worker = await getWorker(options);
    const { data } = await worker.recognize(image);
    return {
      ok: true,
      text: data.text,
      confidence: Number.isFinite(data.confidence) ? data.confidence : null,
    };
  } catch (error) {
    return { ok: false, errorMessage: error instanceof Error ? error.message : String(error) };
  }
}

/** Releases the OCR worker and its WASM memory (Session 2B §10
 * "release resources when appropriate"). Safe to call even if no
 * worker was ever created. */
export async function terminateOcrEngine(): Promise<void> {
  if (!workerPromise) return;
  const pending = workerPromise;
  workerPromise = null;
  activeOptionsKey = null;
  try {
    const worker = await pending;
    await worker.terminate();
  } catch {
    // Already failed/terminated — nothing further to release.
  }
}
