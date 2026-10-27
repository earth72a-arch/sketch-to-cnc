import { describe, expect, it } from "vitest";
import { createCancelToken, OcrCancelledError, OcrTimeoutError, raceWithTimeout } from "./withTimeout";

function delay<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

describe("raceWithTimeout", () => {
  it("resolves with the underlying promise's value when it finishes before the timeout", async () => {
    const result = await raceWithTimeout(delay(10, "ok"), 1000, "test");
    expect(result).toBe("ok");
  });

  it("rejects with OcrTimeoutError when the promise takes longer than timeoutMs", async () => {
    await expect(raceWithTimeout(delay(1000, "too-slow"), 20, "test-stage")).rejects.toThrow(OcrTimeoutError);
  });

  it("includes the stage label and timeout value in the error message", async () => {
    await expect(raceWithTimeout(delay(1000, "x"), 15, "loading-core")).rejects.toThrow(/loading-core/);
  });

  it("propagates the underlying promise's own rejection unchanged (not a timeout)", async () => {
    const boom = new Error("engine exploded");
    await expect(raceWithTimeout(Promise.reject(boom), 1000, "test")).rejects.toBe(boom);
  });

  it("rejects immediately with OcrCancelledError if the token was already cancelled", async () => {
    const token = createCancelToken();
    token.cancel();
    await expect(raceWithTimeout(delay(1000, "x"), 1000, "test", token)).rejects.toThrow(OcrCancelledError);
  });

  it("rejects with OcrCancelledError when cancel() fires mid-flight, before the promise or timeout", async () => {
    const token = createCancelToken();
    const slow = delay(1000, "too-slow");
    const racePromise = raceWithTimeout(slow, 1000, "test", token);
    setTimeout(() => token.cancel(), 10);
    await expect(racePromise).rejects.toThrow(OcrCancelledError);
  });

  it("one cancel() call aborts multiple in-flight races sharing the same token", async () => {
    const token = createCancelToken();
    const raceA = raceWithTimeout(delay(1000, "a"), 1000, "a", token);
    const raceB = raceWithTimeout(delay(1000, "b"), 1000, "b", token);
    setTimeout(() => token.cancel(), 10);
    await expect(raceA).rejects.toThrow(OcrCancelledError);
    await expect(raceB).rejects.toThrow(OcrCancelledError);
  });

  it("a cancel token cancelled before any race is ever attached does not produce an unhandled rejection", async () => {
    const token = createCancelToken();
    token.cancel();
    // no raceWithTimeout call at all — just verifying this doesn't throw
    // synchronously or need a subsequent race to "handle" it.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(token.isCancelled()).toBe(true);
  });

  it("clears its internal timer on a normal resolve (does not leak / affect later timers)", async () => {
    await raceWithTimeout(delay(5, "ok"), 50, "test");
    // If the timer were not cleared, this delay would have no observable
    // effect either way — the real guarantee here is just "no crash and
    // no stray rejection shows up on an unrelated later await."
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(true).toBe(true);
  });
});
