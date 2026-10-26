import { describe, expect, it } from "vitest";
import { sha256OfFile, verifyImageMatchesHash } from "./hash";

// Known SHA-256 of the ASCII string "hello world" (verified independently).
const HELLO_WORLD_SHA256 =
  "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9";

describe("sha256OfFile", () => {
  it("computes the correct SHA-256 digest of file contents", async () => {
    const file = new File(["hello world"], "hello.txt", { type: "text/plain" });
    const digest = await sha256OfFile(file);
    expect(digest).toBe(HELLO_WORLD_SHA256);
  });

  it("produces different hashes for different content", async () => {
    const a = await sha256OfFile(new File(["content A"], "a.png"));
    const b = await sha256OfFile(new File(["content B"], "b.png"));
    expect(a).not.toBe(b);
  });
});

describe("verifyImageMatchesHash — SHA-256 image verification on reopen", () => {
  it("returns true when the re-imported file matches the recorded hash", async () => {
    const file = new File(["hello world"], "sketch.png");
    const ok = await verifyImageMatchesHash(file, HELLO_WORLD_SHA256);
    expect(ok).toBe(true);
  });

  it("is case-insensitive when comparing hex digests", async () => {
    const file = new File(["hello world"], "sketch.png");
    const ok = await verifyImageMatchesHash(file, HELLO_WORLD_SHA256.toUpperCase());
    expect(ok).toBe(true);
  });

  it("returns false and clearly signals a mismatch for a different image", async () => {
    const file = new File(["a completely different image"], "sketch.png");
    const ok = await verifyImageMatchesHash(file, HELLO_WORLD_SHA256);
    expect(ok).toBe(false);
  });
});
