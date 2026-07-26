// The `sigseed` variant: an avatar's pool is grown ONLY from its signature
// cards. Where `picksig` lets the signature merely BIAS a seed draw that still
// ranges over the whole corpus — and then lets a signature-blind best-of-K
// coherence step discard on-theme seeds for tighter off-theme clusters — `sigseed`
// makes the signature the sole starting point: every pool is anchored on an actual
// signature card, so it can never drift onto an unrelated identity.
//
// The starting point is a RANDOM SUBSET of the signature (1..`maxSeedCards` of the
// signature cards that resolve into the corpus), drawn fresh each run. Growth from
// that subset is the shared deterministic affinity grower
// ({@link growAffinityPoolFromSeeds}), so the pool is a pure function of the chosen
// subset — and the subset is where run-to-run VARIETY comes from: different
// combinations of signature anchors lean the same identity in different directions
// (a single signature card gives a pure lean; a pair or triple blends them). The
// grower's seed-affinity term reads a candidate's strongest tie to ANY of the
// chosen anchors, so the whole pool stays tied to the signature region.
//
// `sigseed` shares `pickfit`/`pickcohere`/`picksig`'s corpus verbatim (the
// availability-corrected pick-rate prior and shrunk excess-lift synergy affinity)
// and resolves the signature onto it exactly as `picksig` does. With no signature
// (or none of its cards present in the corpus) there is nothing to anchor on, so it
// reduces to plain `pickcohere`. Cards are identified by UUID throughout.

import {
  type AffinityCorpus,
  type AffinityGrowerTuning,
  growAffinityPoolFromSeeds,
  toVariantResult,
} from "./affinity-grower.ts";
import type { PoolStrategy } from "./strategy.ts";
import { missingPoolData, type PoolData, type VariantResult } from "./types.ts";
import { generatePickCohere } from "./variant-pickcohere.ts";
import { buildPickfitCorpus, PICKFIT } from "./variant-pickfit.ts";
import { resolveSignatureToCorpus } from "./variant-picksig.ts";

interface SigSeedTuning extends AffinityGrowerTuning {
  targetSize: number;
  // Most signature cards used as the multi-seed start. The subset size is drawn
  // uniformly in [1, min(maxSeedCards, signature size)], so the pool starts from
  // a single signature card up to this many of them.
  maxSeedCards: number;
}
// Shares every grower field with `PICKFIT` so growth behaves identically to the
// other pick-corpus variants; the one new dial, `maxSeedCards`, bounds how many
// signature cards seed a pool. `seedDraws` is unused — `sigseed` grows exactly one
// pool per run (its variety is the subset draw, not best-of-K), so it is omitted.
export const SIGSEED: SigSeedTuning = {
  targetSize: PICKFIT.targetSize,
  cap: PICKFIT.cap,
  seedAffinityWeight: PICKFIT.seedAffinityWeight,
  priorWeight: PICKFIT.priorWeight,
  secondCopyFactor: PICKFIT.secondCopyFactor,
  topPartnerCount: PICKFIT.topPartnerCount,
  // 4 maximises distinct pools: with the ~6 signature cards a DreamAvatar has and
  // deterministic growth, the count of distinct subset-seeded pools saturates here
  // (~28-30 per DreamAvatar), and raising it further only converges pools toward
  // the all-signatures start without adding on-theme strength.
  maxSeedCards: 4,
};

// Reuses `pickfit`'s corpus verbatim: `sigseed` differs only in how the pool is
// seeded, so it must read the exact same affinity data.
export function buildSigSeedCorpus(poolData: PoolData): AffinityCorpus | null {
  return buildPickfitCorpus(poolData);
}

// A random subset of the resolved signature keys, of size 1..min(maxSeedCards,
// keys). `keys` must be in a deterministic order (sorted by the caller) so the
// draw is reproducible from the seed. Consumes one `rng()` for the size and one
// per chosen card (a partial Fisher-Yates over a copy), so determinism and
// rng-consumption depend only on the seed.
export function drawSignatureSubset(
  rng: () => number,
  keys: readonly string[],
  maxSeedCards: number,
): string[] {
  const n = keys.length;
  if (n === 0) return [];
  const hi = Math.max(1, Math.min(maxSeedCards, n));
  const size = 1 + Math.floor(rng() * hi);
  const clamped = Math.min(size, n);
  const arr = [...keys];
  for (let i = 0; i < clamped; i++) {
    const j = i + Math.floor(rng() * (n - i));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr.slice(0, clamped);
}

// Build a `sigseed` pool: resolve the signature onto the corpus, draw a random
// subset of those signature cards, and grow one deterministic pool anchored on
// them, emitted keyed by UUID. Throws when no draft records are
// bundled (an empty corpus), and reduces to plain `pickcohere` when the signature
// is empty or none of its cards are in the corpus (nothing to anchor on).
export function generateSigSeed(
  rng: () => number,
  poolData: PoolData,
  signatureCards?: readonly string[],
): VariantResult {
  const corpus = buildSigSeedCorpus(poolData);
  if (!corpus || corpus.cards.length === 0) {
    missingPoolData(
      "sigseed",
      "its draft-record corpus is empty (the draft records were not loaded)",
    );
  }

  const signatureSet = resolveSignatureToCorpus(corpus, signatureCards ?? []);
  if (signatureSet.size === 0) {
    // No signature anchor in the corpus: there is nothing to seed exclusively
    // from, so fall back to the unsteered best-of-K base, exactly like `picksig`.
    return generatePickCohere(rng, poolData);
  }

  const keys = [...signatureSet].sort();
  const seeds = drawSignatureSubset(rng, keys, SIGSEED.maxSeedCards);
  const grown = growAffinityPoolFromSeeds(
    corpus,
    seeds,
    SIGSEED.targetSize,
    SIGSEED,
  );
  return toVariantResult(grown.counts, grown.provenance, "sigseed");
}

/** Strategy adapter for the `sigseed` algorithm. */
export const sigSeedStrategy: PoolStrategy = {
  id: "sigseed",
  description:
    "Grows the pool exclusively from an avatar's signature cards: each run " +
    "starts from a random subset of the signature and expands by pick-affinity, " +
    "so every pool is anchored on the avatar's identity and never drifts " +
    "onto an unrelated theme. Reduces to pickcohere when no signature is given.",
  generate: ({ rng, poolData, signatureCards }) =>
    generateSigSeed(rng, poolData, signatureCards),
};
