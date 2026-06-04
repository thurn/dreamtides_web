// Seedable RNG (mulberry32) and the random-selection helpers built on it, so
// runs are reproducible from a seed.

export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(rng: () => number, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

export function shuffle<T>(rng: () => number, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function weightedPick<T>(
  rng: () => number,
  items: T[],
  weights: number[],
): T {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

/**
 * Sample `count` distinct items from `items`, weighted, without replacement,
 * using the Efraimidis-Spirakis key trick (key = u^(1/weight), take the
 * largest). Returns fewer than `count` only if `items` is shorter.
 */
export function weightedSample<T>(
  rng: () => number,
  items: readonly T[],
  weight: (item: T) => number,
  count: number,
): T[] {
  return [...items]
    .map((item): [T, number] => [
      item,
      rng() ** (1 / Math.max(1e-9, weight(item))),
    ])
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([item]) => item);
}
