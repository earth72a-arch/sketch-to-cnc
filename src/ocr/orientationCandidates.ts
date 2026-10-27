/**
 * Builds the list of rotation angles (degrees) to try OCR at for one
 * text region (Session 2B §6). Always includes plain horizontal (0°)
 * and vertical (90°) text, plus whatever ISO axis estimates Session
 * 2A.1's `clusterAxes` already produced for this drawing — a number
 * written along a sloping ISO edge is usually aligned with one of those
 * axes, not at an arbitrary angle. Never rotates the whole image: the
 * angles returned here are applied to a single small cropped region
 * (see `pixelTransform.ts`).
 */
export function buildOrientationCandidates(isoAxisCentroidsDeg: readonly number[] | null): number[] {
  const base = [0, 90];
  if (!isoAxisCentroidsDeg) return base;

  // A hand-drawn number along a sloping ISO edge may lean either way
  // relative to that axis, so both the axis angle and its mirror image
  // (-angle) are tried as de-skew rotations — we cannot know in advance
  // which direction the text actually leans.
  const candidateDegrees = isoAxisCentroidsDeg.flatMap((deg) => [deg, -deg]);
  const extra = candidateDegrees
    .map((deg) => Math.round((((deg % 180) + 180) % 180) * 10) / 10)
    .filter((deg) => !base.some((b) => Math.abs(angleDiffMod180(deg, b)) < 1));

  return [...base, ...dedupe(extra)];
}

function angleDiffMod180(a: number, b: number): number {
  const diff = Math.abs(a - b) % 180;
  return Math.min(diff, 180 - diff);
}

function dedupe(angles: number[]): number[] {
  const out: number[] = [];
  for (const a of angles) {
    if (!out.some((o) => angleDiffMod180(o, a) < 1)) out.push(a);
  }
  return out;
}
