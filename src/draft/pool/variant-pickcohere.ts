// The `pickcohere` variant: `pickfit` exactly — the same draft-pick-record
// corpus ({@link buildPickfitCorpus}: an availability-corrected pick-rate prior
// and a shrunk excess-lift synergy affinity) and the same shared affinity grower
// — differing only in how the seed card is chosen. Where `pickfit` draws one
// seed uniformly and grows it, `pickcohere` draws several candidate seeds, grows
// a pool from each, and keeps the most internally COHERENT one (the pool whose
// cards partner each other most strongly, by `poolCoherence`).
//
// The motivation is the tail, not the average. A uniform draw occasionally lands
// on a generic glue card — premium removal, card draw — whose synergy is spread
// so thinly that the grower can only assemble a loose, scattered pool: a pool
// that carries build-around payoffs it cannot actually support, the worst kind
// of draft experience. Such a pool scores low on internal coherence, so
// best-of-K coherence selection steers away from those seeds. The whole decision
// reads only the corpus affinity, so it stays purely derived from the bundled
// draft records — no card metadata feeds the choice. Cards are identified by
// their stable cards_v2 UUID throughout, exactly as `pickfit`.

import {
  type AffinityCorpus,
  type AffinityGrowerTuning,
  growPoolFromCorpus,
} from "./affinity-grower.ts";
import type { PoolStrategy } from "./strategy.ts";
import type { PoolData, VariantResult } from "./types.ts";
import { buildPickfitCorpus, PICKFIT } from "./variant-pickfit.ts";

interface PickCohereTuning extends AffinityGrowerTuning {
  targetSize: number;
}
// Identical to `PICKFIT` in every shared field — the variant is exactly
// "pickfit, but keep the most coherent of `seedDraws` candidate seeds", so the
// best-of-K seed selection is the single deliberate difference. K = 5
// suppresses the bad tail by roughly an order of magnitude in simulation while
// leaving card coverage intact.
export const PICKCOHERE: PickCohereTuning = {
  targetSize: PICKFIT.targetSize,
  cap: PICKFIT.cap,
  seedAffinityWeight: PICKFIT.seedAffinityWeight,
  priorWeight: PICKFIT.priorWeight,
  secondCopyFactor: PICKFIT.secondCopyFactor,
  topPartnerCount: PICKFIT.topPartnerCount,
  seedDraws: 5,
};

// Reuses `pickfit`'s corpus verbatim: the only difference between the two
// variants is seed selection, so they must share the exact same affinity data.
export function buildPickCohereCorpus(poolData: PoolData): AffinityCorpus | null {
  return buildPickfitCorpus(poolData);
}

// Build a `pickcohere` pool: draw `PICKCOHERE.seedDraws` candidate seeds, grow a
// pool from each, keep the most internally coherent, mapped back onto current
// display names. Falls back to the `default` algorithm when no draft records are
// bundled (the shared grower throws on an empty corpus).
export function generatePickCohere(
  rng: () => number,
  poolData: PoolData,
): VariantResult {
  return growPoolFromCorpus(
    rng,
    poolData,
    buildPickCohereCorpus(poolData),
    PICKCOHERE.targetSize,
    PICKCOHERE,
    "pickcohere",
  );
}

/** Strategy adapter for the `pickcohere` algorithm. */
export const pickCohereStrategy: PoolStrategy = {
  id: "pickcohere",
  description:
    "Like pickfit, but draws several candidate seeds and keeps the one that grows " +
    "the most internally coherent pool — steering away from generic seeds that " +
    "grow scattered, poorly-supported pools, the worst draft experiences.",
  generate: ({ rng, poolData }) => generatePickCohere(rng, poolData),
};
