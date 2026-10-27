/**
 * Session 2B.1 — generic promise race against a timeout and/or a
 * cancellation signal. No tesseract.js dependency: every OCR engine
 * call (worker init, each recognize attempt) is wrapped with this so a
 * hang — for ANY reason, known or not — surfaces as a clear, bounded
 * failure instead of an indefinite spinner (the exact bug reported from
 * the real iPad Safari test: "กำลังอ่านผล OCR (0%)" stuck forever with
 * no error). Pure and fully unit-testable with fake promises/timers.
 */

export class OcrTimeoutError extends Error {
  constructor(label: string, timeoutMs: number) {
    super(`หมดเวลา: ${label} (เกิน ${timeoutMs}ms)`);
    this.name = "OcrTimeoutError";
  }
}

export class OcrCancelledError extends Error {
  constructor() {
    super("ผู้ใช้ยกเลิกการทำงาน");
    this.name = "OcrCancelledError";
  }
}

export interface CancelToken {
  isCancelled: () => boolean;
  /** Settles (rejects) the moment cancel() is called — lets a race()
   * react immediately instead of polling isCancelled() in a loop. */
  whenCancelled: Promise<never>;
  cancel: () => void;
}

/** One cancel token per OCR run (created fresh by the caller for each
 * "Run OCR" click) — `cancel()` aborts every race currently (or still
 * to be) attached to it, since they all share the same settled promise. */
export function createCancelToken(): CancelToken {
  let cancelled = false;
  let rejectFn: (e: Error) => void = () => {};
  const whenCancelled = new Promise<never>((_resolve, reject) => {
    rejectFn = reject;
  });
  // A promise with no attached handler that later rejects is reported as
  // an unhandled rejection; this project's own race() always consumes it,
  // but attach a permanent silent catch too so a token created and never
  // raced (e.g. cancelled before any work started) never warns.
  whenCancelled.catch(() => {});

  return {
    isCancelled: () => cancelled,
    whenCancelled,
    cancel: () => {
      if (cancelled) return;
      cancelled = true;
      rejectFn(new OcrCancelledError());
    },
  };
}

/**
 * Races `promise` against a timeout, and optionally a shared cancel
 * token. Whichever settles first wins; the timer is always cleared
 * afterward so a won race never leaves a dangling setTimeout.
 */
export async function raceWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
  cancelToken?: CancelToken,
): Promise<T> {
  if (cancelToken?.isCancelled()) throw new OcrCancelledError();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new OcrTimeoutError(label, timeoutMs)), timeoutMs);
  });

  const racers: Array<Promise<T>> = [promise, timeout];
  if (cancelToken) racers.push(cancelToken.whenCancelled);

  try {
    return await Promise.race(racers);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
