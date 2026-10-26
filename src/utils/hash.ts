/** Computes the SHA-256 hash of a file's bytes and returns it as a lowercase
 * hex string, using the browser/runtime Web Crypto API. All processing stays
 * local — nothing is uploaded (see CLAUDE.md §2). */
export async function sha256OfFile(file: File | Blob): Promise<string> {
  const buffer = await file.arrayBuffer();
  return sha256OfArrayBuffer(buffer);
}

export async function sha256OfArrayBuffer(
  buffer: ArrayBuffer,
): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return bufferToHex(digest);
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Checks a freshly-imported image against the hash recorded in a project
 * file. Used when reopening a project so the user gets a clear mismatch
 * warning instead of silently proceeding with the wrong image. */
export async function verifyImageMatchesHash(
  file: File | Blob,
  expectedSha256: string,
): Promise<boolean> {
  const actual = await sha256OfFile(file);
  return actual.toLowerCase() === expectedSha256.toLowerCase();
}
