import type { ComponentStats } from "../recognition/types";

/**
 * Session 2B.6 — adaptive character grouping for dimension text.
 *
 * Replaces the old fixed-pixel proximity merge (`charGroupingGapPx: 14`
 * constant, Session 2B) that split multi-digit numbers like "35" into
 * separate single-character regions whenever the actual digit spacing in
 * a given drawing (Procreate scribble stroke width/size varies a lot)
 * exceeded that one hardcoded value. No fixed pixel threshold exists
 * anywhere in this module: every distance check is expressed as a
 * multiple of each pair's own measured size, so it scales with both
 * small and large hand-drawn digits in the same drawing.
 *
 * TWO-PASS design (the real-world case that drove this): a single
 * scribbled glyph can itself be broken into several raw ink components
 * (anti-aliasing erosion at a thin connector, or a genuine pen-stroke
 * gap like an "8"'s waist pinch) — those sub-glyph fragments can sit at
 * ANY relative angle to each other (e.g. a digit's top stroke above its
 * vertical stroke), so requiring "the merge direction looks like a text
 * baseline" for them would wrongly reject legitimate same-character
 * fragments. Only CHARACTER-to-character spacing should be held to that
 * standard. So:
 *
 *  Pass 1 — `assembleGlyphs`: merges raw components into one GLYPH
 *  purely by proximity + similar height, no direction/alignment
 *  requirement at all — this is "is this plausibly the same scribbled
 *  character," not "is this the next character in the number."
 *
 *  Pass 2 — `groupCharacters`: merges GLYPHS (each already a clean,
 *  single centroid) into one text-region RUN, same adaptive
 *  proximity+height test as pass 1 but ALSO requiring the resulting
 *  run's glyph centroids stay aligned along one direction — for 2
 *  glyphs, the direction between their centroids must be plausible
 *  (near 0°/90°/a supplied ISO axis hint); for 3+, a PCA fit through
 *  all glyph centroids must be both well-aligned and plausible. ISO
 *  axis is SUPPORTING evidence only (optional) — the primary signal is
 *  always the glyphs' own arrangement, never an assumption of
 *  horizontal text. This is what stops two genuinely separate nearby
 *  numbers (CLAUDE.md: never guess/merge without evidence) from being
 *  merged just because they happen to be close.
 */

export interface CharGroupingOptions {
  /** Pass 1 — max bounding-box gap between two raw components, as a
   * multiple of `max(fragmentationScale, their average own size)`, to
   * still be considered fragments of the SAME scribbled glyph (no
   * alignment check applied at this tier — intra-glyph fragments can
   * sit at any angle). `fragmentationScale` (see
   * `estimateFragmentationScale`) is the median nearest-neighbor gap
   * across ALL candidate components in this call — real scanned/
   * compressed ink typically breaks into many tiny (1-10px) ink
   * speckles whose OWN bounding-box size is not a meaningful proxy for
   * "how far apart can two pieces of the same glyph be," so a
   * per-image, data-derived noise-gap floor is used instead of relying
   * on the pair's own size alone. This is still fully adaptive (differs
   * per image/resolution) — never a fixed universal pixel constant. */
  tightGapFactor: number;
  /** Pass 1 — max bounding-box gap between two raw components, as a
   * multiple of THEIR OWN average size alone (ignoring
   * `fragmentationScale` entirely) — the budget used when there is not
   * enough surrounding data to trust a per-image noise-gap estimate
   * (see `estimateFragmentationScale`). Deliberately smaller/more
   * conservative than `tightGapFactor`: with no other components to
   * calibrate against, a component's own size is the only honest size
   * reference available, and over-trusting it risks silently merging
   * two genuinely separate nearby marks (CLAUDE.md: never guess/merge
   * without evidence). A merge is accepted if EITHER this budget OR the
   * `tightGapFactor`×`fragmentationScale` budget is satisfied. */
  tightSizeGapFactor: number;
  /** Pass 2 — max bounding-box gap between two GLYPHS, as a multiple of
   * their average "own size," to be considered adjacent characters of
   * the same text run (alignment IS checked at this tier). */
  gapFactor: number;
  /** Pass 2 — minimum height ratio (smaller/larger) between two glyphs
   * for them to be considered part of the same text run. */
  minHeightRatio: number;
  /** Pass 2 — minimum PCA linearity (0..1) of a 3+-glyph run's centroids
   * for the run to be accepted as one aligned text line. */
  minAlignmentLinearity: number;
  /** Pass 2 — degrees of tolerance when checking a candidate text
   * direction against the 0°/90°/ISO-axis supporting hints. */
  angleToleranceDeg: number;
  /** Pass 1 — hard cap on a single glyph's own bounding-box size, as a
   * multiple of `fragmentationScale` (ignored when there are too few
   * components to estimate one — see `estimateFragmentationScale`).
   * Without this, greedy nearest-pair merging on a real scanned
   * drawing's many small noise speckles (tick marks, arrowhead bits)
   * can chain-merge transitively across an entire dimension line,
   * since each individual step looks "close enough" even though the
   * endpoints are nowhere near each other. This caps how big ONE
   * glyph-reassembly pass is allowed to grow — large enough for one
   * real hand-drawn character, far too small to ever bridge two
   * separate numbers on the same drawing. */
  maxGlyphSizeFactor: number;
  /** Pass 2 — same anti-chaining safeguard as `maxGlyphSizeFactor`, one
   * tier up: caps how big a single TEXT RUN (multiple glyphs) is
   * allowed to grow, as a multiple of `fragmentationScale`. Without
   * this, the alignment check alone is not always enough to stop a
   * real scanned drawing's tick marks/arrowhead noise (which often
   * really is roughly aligned with a dimension line's 0°/90°/ISO
   * angle) from chain-merging a real number together with unrelated
   * nearby ink along the same line. Large enough for a realistic
   * multi-digit dimension number, far smaller than "most of a
   * drawing." */
  maxRunSizeFactor: number;
}

export const DEFAULT_CHAR_GROUPING_OPTIONS: CharGroupingOptions = {
  tightGapFactor: 4,
  tightSizeGapFactor: 0.35,
  gapFactor: 0.9,
  minHeightRatio: 0.35,
  minAlignmentLinearity: 0.5,
  angleToleranceDeg: 25,
  maxGlyphSizeFactor: 12,
  maxRunSizeFactor: 15,
};

export interface CharCluster {
  members: ComponentStats[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  count: number;
}

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function width(c: Box): number {
  return c.maxX - c.minX + 1;
}
function height(c: Box): number {
  return c.maxY - c.minY + 1;
}
function ownSize(c: Box): number {
  return Math.max(width(c), height(c));
}

/** Edge-to-edge Euclidean gap between two axis-aligned boxes; 0 if they
 * touch or overlap. */
function bboxGap(a: Box, b: Box): number {
  const dx = Math.max(0, Math.max(a.minX, b.minX) - Math.min(a.maxX, b.maxX));
  const dy = Math.max(0, Math.max(a.minY, b.minY) - Math.min(a.maxY, b.maxY));
  return Math.sqrt(dx * dx + dy * dy);
}

function normalizeAngleDeg(deg: number): number {
  return ((deg % 180) + 180) % 180;
}
function angleDiffMod180(a: number, b: number): number {
  const diff = Math.abs(a - b) % 180;
  return Math.min(diff, 180 - diff);
}

/** PCA line fit through a set of (unweighted) points — same closed-form
 * 2x2 eigen-decomposition as `recognition/lineFit.ts`, but over a set of
 * POINTS (e.g. glyph centroids) instead of per-pixel moments, since what
 * is being tested here is "do these characters line up," not "is this
 * stroke straight." Kept local to this module (OCR-only), never
 * touching `src/recognition/*` (CLAUDE.md: never modify ISO
 * Recognition). */
function fitLineThroughPoints(points: Array<{ x: number; y: number }>): { angleDeg: number; linearity: number } | null {
  if (points.length === 0) return null;
  const n = points.length;
  let sumX = 0;
  let sumY = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
  }
  const cx = sumX / n;
  const cy = sumY / n;
  let varX = 0;
  let varY = 0;
  let covXY = 0;
  for (const p of points) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    varX += dx * dx;
    varY += dy * dy;
    covXY += dx * dy;
  }
  varX /= n;
  varY /= n;
  covXY /= n;

  const trace = varX + varY;
  const det = varX * varY - covXY * covXY;
  const m = trace / 2;
  const discriminant = Math.max(0, m * m - det);
  const d = Math.sqrt(discriminant);
  const lambda1 = Math.max(0, m + d);
  const lambda2 = Math.max(0, m - d);

  let vx: number;
  let vy: number;
  if (Math.abs(covXY) > 1e-9) {
    vx = covXY;
    vy = lambda1 - varX;
  } else {
    vx = varX >= varY ? 1 : 0;
    vy = varX >= varY ? 0 : 1;
  }

  const angleDeg = normalizeAngleDeg((Math.atan2(vy, vx) * 180) / Math.PI);
  const linearity = lambda1 > 1e-9 ? 1 - lambda2 / lambda1 : 0;
  return { angleDeg, linearity };
}

function angleIsPlausible(angleDeg: number, isoAxisCentroidsDeg: readonly number[] | null, toleranceDeg: number): boolean {
  const candidates = [0, 90, ...((isoAxisCentroidsDeg ?? []).flatMap((d) => [normalizeAngleDeg(d), normalizeAngleDeg(-d)]))];
  return candidates.some((c) => angleDiffMod180(angleDeg, c) <= toleranceDeg);
}

// ---------------------------------------------------------------------
// Pass 1 — same-glyph fragment reassembly (proximity + height only, NO
// direction/alignment requirement: a glyph's own sub-strokes can sit at
// any relative angle, e.g. a "4"'s diagonal next to its vertical).
// ---------------------------------------------------------------------

interface Glyph {
  members: ComponentStats[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  count: number;
  sumX: number;
  sumY: number;
}

function glyphOf(c: ComponentStats): Glyph {
  return { members: [c], minX: c.minX, minY: c.minY, maxX: c.maxX, maxY: c.maxY, count: c.count, sumX: c.sumX, sumY: c.sumY };
}

function mergeGlyphs(a: Glyph, b: Glyph): Glyph {
  return {
    members: [...a.members, ...b.members],
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
    count: a.count + b.count,
    sumX: a.sumX + b.sumX,
    sumY: a.sumY + b.sumY,
  };
}

function glyphCentroid(g: Glyph): { x: number; y: number } {
  return { x: g.sumX / g.count, y: g.sumY / g.count };
}

/** Median nearest-neighbor bounding-box gap across all given boxes — a
 * per-image, data-derived estimate of "how fragmented is this
 * drawing's ink," used as a floor under the pairwise own-size budget in
 * `canMergeTight` (see its doc comment for why: real scanned ink breaks
 * into tiny speckles whose own size alone is not a usable distance
 * reference). O(n^2); fine at the component counts (tens to low
 * hundreds) this module ever sees per color mask. */
function estimateFragmentationScale(boxes: Box[]): number {
  // Degenerate for very small candidate sets (e.g. exactly the pair
  // being tested, with nothing else to calibrate against) — only trust
  // this estimate once there is a real quorum of independent ink to
  // measure a "typical gap" from.
  if (boxes.length < 6) return 0;
  const nearestGaps: number[] = [];
  for (let i = 0; i < boxes.length; i++) {
    let best = Infinity;
    for (let j = 0; j < boxes.length; j++) {
      if (i === j) continue;
      const g = bboxGap(boxes[i], boxes[j]);
      if (g < best) best = g;
    }
    if (Number.isFinite(best)) nearestGaps.push(best);
  }
  if (nearestGaps.length === 0) return 0;
  nearestGaps.sort((a, b) => a - b);
  return nearestGaps[Math.floor(nearestGaps.length / 2)];
}

function canMergeTight(
  a: Glyph,
  b: Glyph,
  tightGapFactor: number,
  tightSizeGapFactor: number,
  fragmentationScale: number,
  maxGlyphSizeFactor: number,
): boolean {
  const pairwiseAvgSize = (ownSize(a) + ownSize(b)) / 2;
  if (pairwiseAvgSize <= 0 && fragmentationScale <= 0) return false;
  const gap = bboxGap(a, b);
  const sizeBudget = tightSizeGapFactor * pairwiseAvgSize;
  const noiseBudget = fragmentationScale > 0 ? tightGapFactor * fragmentationScale : -1;
  if (gap > sizeBudget && gap > noiseBudget) return false;

  if (fragmentationScale > 0) {
    const merged = mergeGlyphs(a, b);
    if (ownSize(merged) > maxGlyphSizeFactor * fragmentationScale) return false;
  }
  return true;
}

function assembleGlyphs(components: ComponentStats[], tightGapFactor: number, tightSizeGapFactor: number, maxGlyphSizeFactor: number): Glyph[] {
  const fragmentationScale = estimateFragmentationScale(components);
  let glyphs = components.map(glyphOf);
  for (;;) {
    let bestI = -1;
    let bestJ = -1;
    let bestGap = Infinity;
    for (let i = 0; i < glyphs.length; i++) {
      for (let j = i + 1; j < glyphs.length; j++) {
        if (!canMergeTight(glyphs[i], glyphs[j], tightGapFactor, tightSizeGapFactor, fragmentationScale, maxGlyphSizeFactor)) continue;
        const gap = bboxGap(glyphs[i], glyphs[j]);
        if (gap < bestGap) {
          bestGap = gap;
          bestI = i;
          bestJ = j;
        }
      }
    }
    if (bestI < 0) break;
    const merged = mergeGlyphs(glyphs[bestI], glyphs[bestJ]);
    glyphs = glyphs.filter((_, idx) => idx !== bestI && idx !== bestJ);
    glyphs.push(merged);
  }
  return glyphs;
}

// ---------------------------------------------------------------------
// Pass 2 — glyph-to-glyph text-run assembly (proximity + height AND
// direction/alignment, since this is where distinct-text false merges
// must be rejected).
// ---------------------------------------------------------------------

interface TextRun {
  glyphs: Glyph[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  count: number;
}

function runOf(g: Glyph): TextRun {
  return { glyphs: [g], minX: g.minX, minY: g.minY, maxX: g.maxX, maxY: g.maxY, count: g.count };
}

function mergeRuns(a: TextRun, b: TextRun): TextRun {
  return {
    glyphs: [...a.glyphs, ...b.glyphs],
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
    count: a.count + b.count,
  };
}

function runAlignmentOk(run: TextRun, isoAxisCentroidsDeg: readonly number[] | null, options: CharGroupingOptions): boolean {
  if (run.glyphs.length <= 1) return true;
  const points = run.glyphs.map(glyphCentroid);

  if (run.glyphs.length === 2) {
    const [a, b] = points;
    if (a.x === b.x && a.y === b.y) return true;
    const angle = normalizeAngleDeg((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI);
    return angleIsPlausible(angle, isoAxisCentroidsDeg, options.angleToleranceDeg);
  }

  const fit = fitLineThroughPoints(points);
  if (!fit) return false;
  if (fit.linearity < options.minAlignmentLinearity) return false;
  return angleIsPlausible(fit.angleDeg, isoAxisCentroidsDeg, options.angleToleranceDeg);
}

function canMergeLoose(
  a: TextRun,
  b: TextRun,
  isoAxisCentroidsDeg: readonly number[] | null,
  options: CharGroupingOptions,
  fragmentationScale: number,
): boolean {
  const refSize = (ownSize(a) + ownSize(b)) / 2;
  if (refSize <= 0) return false;
  if (bboxGap(a, b) > options.gapFactor * refSize) return false;

  const heightRatio = Math.min(height(a), height(b)) / Math.max(height(a), height(b));
  if (heightRatio < options.minHeightRatio) return false;

  const merged = mergeRuns(a, b);
  if (fragmentationScale > 0 && ownSize(merged) > options.maxRunSizeFactor * fragmentationScale) return false;

  return runAlignmentOk(merged, isoAxisCentroidsDeg, options);
}

/**
 * Greedy nearest-valid-pair agglomerative grouping, run in two passes
 * (see module doc comment). Never forces equal character widths (only
 * height is compared) and never assumes a fixed orientation.
 */
export function groupCharacters(
  components: ComponentStats[],
  isoAxisCentroidsDeg: readonly number[] | null = null,
  options: CharGroupingOptions = DEFAULT_CHAR_GROUPING_OPTIONS,
): CharCluster[] {
  const glyphs = assembleGlyphs(components, options.tightGapFactor, options.tightSizeGapFactor, options.maxGlyphSizeFactor);
  const glyphFragmentationScale = estimateFragmentationScale(glyphs);

  let runs: TextRun[] = glyphs.map(runOf);
  for (;;) {
    let bestI = -1;
    let bestJ = -1;
    let bestGap = Infinity;
    for (let i = 0; i < runs.length; i++) {
      for (let j = i + 1; j < runs.length; j++) {
        if (!canMergeLoose(runs[i], runs[j], isoAxisCentroidsDeg, options, glyphFragmentationScale)) continue;
        const gap = bboxGap(runs[i], runs[j]);
        if (gap < bestGap) {
          bestGap = gap;
          bestI = i;
          bestJ = j;
        }
      }
    }
    if (bestI < 0) break;
    const merged = mergeRuns(runs[bestI], runs[bestJ]);
    runs = runs.filter((_, idx) => idx !== bestI && idx !== bestJ);
    runs.push(merged);
  }

  return runs.map((run) => ({
    members: run.glyphs.flatMap((g) => g.members),
    minX: run.minX,
    minY: run.minY,
    maxX: run.maxX,
    maxY: run.maxY,
    count: run.count,
  }));
}
