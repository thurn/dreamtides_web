import { sha256 } from "js-sha256";

/** Uniform [0, 1) deterministic stream. */
export type AuguryRng = () => number;

const DEFAULT_BAND_FRACTION = 0.25;
const DEFAULT_BAND_MINIMUM = 5;

/**
 * Creates a deterministic uniform [0, 1) stream salted by the given parts.
 * Each call hashes the salt joined with an internal counter, so draws are
 * reproducible for the same salt and independent across different salts.
 */
export function auguryRng(...saltParts: string[]): AuguryRng {
  const salt = saltParts.join("|");
  let counter = 0;
  return () => {
    const digest = sha256(`${salt}|${counter}`);
    counter += 1;
    const value = Number.parseInt(digest.slice(0, 13), 16);
    return value / 0x10000000000000;
  };
}

/**
 * Picks one item with probability proportional to its weight. Items with
 * non-positive or non-finite weights are never picked. Returns null when no
 * item has positive weight.
 */
export function weightedSample<T>(
  items: readonly T[],
  weight: (t: T) => number,
  rng: AuguryRng,
): T | null {
  const weights = items.map((item) => {
    const w = weight(item);
    return Number.isFinite(w) && w > 0 ? w : 0;
  });
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) {
    return null;
  }
  let threshold = rng() * total;
  for (let i = 0; i < items.length; i += 1) {
    threshold -= weights[i];
    if (threshold < 0) {
      return items[i];
    }
  }
  for (let i = items.length - 1; i >= 0; i -= 1) {
    if (weights[i] > 0) {
      return items[i];
    }
  }
  return null;
}

/**
 * Band sampling: ranks items by score descending, keeps the top
 * `max(ceil(bandFraction * n), min(bandMinimum, n))` items, then uniformly
 * samples `count` of them without replacement. Returns fewer items when the
 * band is smaller than `count`.
 */
export function bandSample<T>(
  items: readonly T[],
  score: (t: T) => number,
  count: number,
  rng: AuguryRng,
  opts?: { bandFraction?: number; bandMinimum?: number },
): T[] {
  const n = items.length;
  if (n === 0 || count <= 0) {
    return [];
  }
  const bandFraction = opts?.bandFraction ?? DEFAULT_BAND_FRACTION;
  const bandMinimum = opts?.bandMinimum ?? DEFAULT_BAND_MINIMUM;
  const bandSize = Math.min(n, Math.max(Math.ceil(bandFraction * n), Math.min(bandMinimum, n)));
  const ranked = items
    .map((item) => ({ item, score: score(item) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, bandSize)
    .map((entry) => entry.item);
  const picks: T[] = [];
  const pool = [...ranked];
  const target = Math.min(count, pool.length);
  while (picks.length < target) {
    const index = Math.min(Math.floor(rng() * pool.length), pool.length - 1);
    picks.push(pool[index]);
    pool.splice(index, 1);
  }
  return picks;
}
