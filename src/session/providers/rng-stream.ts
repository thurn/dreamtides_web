// Shared RNG adapters for the game content providers.
//
// The reducer hands each content seam a keyed `(drawIndex) => number` stream
// derived from `(genesis.seed, seq, drawIndex)` (see `src/eventlog/rng.ts`), so
// every fold of the same event draws identical values. The content generators,
// though, consume a `() => number` stream (`Math.random`-shaped). These helpers
// bridge the two WITHOUT introducing any ambient state, so a provider stays a
// pure function of its inputs and every fold of the same log computes
// byte-identical content.

import type { JourneySeed } from "../../types/journey-seed";

/**
 * Adapt a keyed `(drawIndex) => number` rng into the `() => number` stream the
 * content generators expect. A local counter advances the draw index on each
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
 * lifecycle provider to seed atlas generation from the run seed: every fold of
 * the same `START_JOURNEY` derives the same stream and builds a byte-identical
 * atlas.
 */
export function seededJourneyRng(
  seed: JourneySeed,
  namespace: "atlas",
): () => number {
  let state = hashStringToSeed(`${seed}:${namespace}`);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
