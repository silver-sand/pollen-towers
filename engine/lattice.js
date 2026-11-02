/**
 * Shared lattice quantisation used by the encoder and both decoders.
 *
 * The paper's finding: models hide letters by setting the HEIGHT of each
 * object to a position on a regular lattice (A=1..Z=26, often stepped,
 * e.g. h = base + k * step). If heights snap to a lattice with near-zero
 * residual, a message is almost certainly present.
 */

/** Mappable symbols, in lattice order: A–Z then 0–9 (index = position + 1). */
export const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** Index 1..36 -> symbol, 0 = space. */
export function indexToChar(i) {
  if (i === 0) return " ";
  return ALPHABET[i - 1] ?? "?";
}

/** Symbol -> index 1..36 (space -> 0). Null if unmappable. */
export function charToIndex(ch) {
  if (ch === " ") return 0;
  const i = ALPHABET.indexOf(ch);
  return i < 0 ? null : i + 1;
}

export const MAX_INDEX = ALPHABET.length;

/**
 * Find the lattice (step) that best explains a set of heights.
 * Candidate steps come from gaps between distinct sorted values plus
 * small divisors, so step/2 and step/3 are also tested.
 * Returns { step, residual, snapRate } — residual is mean absolute
 * distance to the nearest lattice point, snapRate is the fraction of
 * values within 25% of the step of a lattice point.
 */
export function fitLattice(values) {
  const uniq = [...new Set(values)].sort((a, b) => a - b);
  if (uniq.length < 2) return { step: 0, residual: Infinity, snapRate: 0, validRate: 0 };
  const maxV = uniq[uniq.length - 1];
  const candidates = new Set();
  for (let i = 1; i < uniq.length; i++) {
    const g = uniq[i] - uniq[i - 1];
    if (g > 0) for (const d of [1, 2, 3]) candidates.add(g / d);
  }
  // The encoder keeps every height within MAX_INDEX steps of zero, so any
  // step larger than maxV / MAX_INDEX cannot be the real one. Seeding that
  // bound gives the search a correct starting point even when the observed
  // gaps are coarse (JPEG ringing merges neighbouring lattice levels).
  candidates.add(maxV / MAX_INDEX);
  let best = { step: 0, residual: Infinity, snapRate: 0, validRate: 0 };
  for (const step of candidates) {
    if (step <= 0.25 || step * MAX_INDEX < maxV) continue;
    let total = 0;
    let snapped = 0;
    let valid = 0;
    for (const v of values) {
      const idx = Math.round(v / step); // absolute lattice anchored at 0
      const r = Math.abs(v - idx * step);
      total += r;
      if (r < step * 0.25) snapped++;
      if (idx >= 1 && idx <= MAX_INDEX) valid++;
    }
    const residual = total / values.length;
    if (residual < best.residual) {
      best = { step, residual, snapRate: snapped / values.length, validRate: valid / values.length };
    }
  }
  return best;
}

/**
 * Decode heights on an absolute lattice (anchored at zero, the same origin
 * the encoder uses) into text. Heights that fall off the vocabulary become
 * "?" — the caller treats those as evidence of no hidden message.
 */
export function heightsToText(heights, step) {
  return heights.map((h) => indexToChar(Math.round(h / step))).join("");
}

/** Normalised similarity, 0..1 — the paper's grading metric. */
export function similarity(a, b) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  a = norm(a);
  b = norm(b);
  if (!a.length || !b.length) return 0;
  if (a === b) return 1;
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}
