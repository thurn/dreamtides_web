// Shared RNG adapters for the coop content providers.
//
// The reducer hands each content seam a keyed `(drawIndex) => number` stream
// derived from `(genesis.seed, seq, drawIndex)` (see `src/eventlog/rng.ts`), so
// the same event on any client draws identical values. The legacy generators,
// though, consume a `() => number` stream (`Math.random`-shaped). These helpers
// bridge the two WITHOUT introducing any ambient state, so a provider stays a
// pure function of its inputs and every client folding the same log computes
// byte-identical content.

/**
 * Adapt a keyed `(drawIndex) => number` rng into the `() => number` stream the
 * legacy generators expect. A local counter advances the draw index on each
 * call, so successive draws within one event are independent yet deterministic
 * for a fixed `(seed, seq)`.
 */
export function streamFromKeyed(rng: (drawIndex: number) => number): () => number {
  let drawIndex = 0;
  return () => rng(drawIndex++);
}

/** FNV-1a hash of a string into a 32-bit unsigned integer. */
function hashStringToSeed(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * A deterministic `[0, 1)` stream seeded by a string (mulberry32). Used by the
 * lifecycle provider to seed atlas generation from the run seed: two clients
 * folding the same `START_JOURNEY` derive the same stream and build a
 * byte-identical atlas.
 */
export function seededRngFromString(seed: string): () => number {
  let state = hashStringToSeed(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
