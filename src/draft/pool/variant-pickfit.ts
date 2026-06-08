// The `pickfit` variant: the same single-card affinity-grown pool as `seed`, but
// built from real draft PICK records instead of finished decklists. It shares
// `seed`'s grower ({@link growAffinityPool}) exactly and changes only the corpus
// feeding it, so any difference between the two is attributable purely to the
// data source — pick behaviour vs. deck co-occurrence.
//
// Decklists record only what ended up together; they cannot tell genuine synergy
// from shared popularity. Draft records add the taken-over-passed signal: for
// every pick we know the full pack (what was offered) and what was chosen. From
// that this variant builds two statistics decklists structurally cannot:
//
//   * an availability-corrected play-rate PRIOR — pickRate(c) = taken(c) /
//     offered(c) — a card's desirability that controls for how often it was even
//     offered, replacing `seed`'s decklist document-frequency prior; and
//   * a behavioural synergy AFFINITY — the EXCESS pick rate of c when d is
//     already in the drafter's pool: condRate(c | d picked earlier) minus c's
//     baseline pick rate, shrunk by the evidence behind the pair and floored at
//     zero. This isolates synergy from raw card power: a strong card has a high
//     baseline, so it only registers affinity to d if holding d makes drafters
//     take it MORE than usual. Power is carried separately by the prior, exactly
//     as `seed` carries play-rate separately from co-occurrence — keeping the
//     synergy signal from collapsing pools onto globally-strong staples.
//
// The grower then draws one card uniformly at random from the corpus and expands
// outward by the blend `seed` uses (affinity to the seed, affinity to the pool so
// far, and the prior), dialled by the `PICKFIT` block below.
//
// Cards are identified by their stable cards_v2 UUID, not by display name (the
// same rename-proof identity `seed` uses). The record corpus already arrives in
// UUID space — `PickRecord.packs`/`picks` hold ids, frozen into the corpus by
// `add-uuids-to-draft-records.mjs` — so the whole computation runs on ids and a
// card rename never shifts the draw, growth, or provenance. The finished pool is
// mapped back onto current names on the way out via `PoolData.cardNameById`;
// absent that map (synthetic test cards keyed by name), keys pass through as-is.

import {
  type AffinityCorpus,
  type AffinityGrowerTuning,
  growPoolFromCorpus,
} from "./affinity-grower.ts";
import { accumulatePickStats, buildExcessLiftCorpus } from "./pick-stats.ts";
import type { PoolStrategy } from "./strategy.ts";
import type { PoolData, VariantResult } from "./types.ts";

// Tuning for the `pickfit` variant. Mirrors `SEED`, extending the shared grower
// tuning with the pool-size target and the two dials governing how the synergy
// affinity is estimated from sparse pick evidence.
interface PickfitTuning extends AffinityGrowerTuning {
  // Desired pool size in TOTAL copies (each card contributes 1 or 2). Matches
  // `SEED.targetSize` so the two variants are size-comparable.
  targetSize: number;
  // Shrinkage constant for the conditional pick rate: a (d→c) estimate is
  // w·condRate + (1-w)·prior(c) with w = support / (support + shrinkage). Larger
  // values demand more evidence before the estimate departs from the baseline.
  shrinkage: number;
  // Minimum co-offer support before a (d→c) synergy entry is recorded at all;
  // thinner pairs are dropped and contribute only through the prior term.
  minSupport: number;
}
export const PICKFIT: PickfitTuning = {
  targetSize: 150,
  cap: 2,
  seedAffinityWeight: 0.4,
  priorWeight: 0.1,
  secondCopyFactor: 0.55,
  topPartnerCount: 8,
  shrinkage: 5,
  minSupport: 3,
};

const pickfitCorpusCache = new WeakMap<PoolData, AffinityCorpus | null>();

// Build the `pickfit` corpus from the bundled draft pick records: equal-weight
// pick stats over every pick (the shared accumulator), turned into an
// availability-corrected pick-rate prior and shrunk excess-lift synergy.
// Exported for the corpus unit test.
export function buildPickfitCorpus(poolData: PoolData): AffinityCorpus | null {
  const cached = pickfitCorpusCache.get(poolData);
  if (cached !== undefined) return cached;

  const records = poolData.draftRecords;
  const result =
    records && records.length > 0
      ? buildExcessLiftCorpus(accumulatePickStats(records), {
          shrinkage: PICKFIT.shrinkage,
          minSupport: PICKFIT.minSupport,
        })
      : null;

  pickfitCorpusCache.set(poolData, result);
  return result;
}

// Build a `pickfit` pool: draw one card uniformly at random from the corpus, then
// grow the pool around it by blended pick-derived affinity to `PICKFIT.targetSize`
// copies. Cards are drawn and grown in UUID-key space (rename-proof); the
// finished pool is mapped back onto current names. Ignores `signatureCards`,
// `seedArchetypes`, `themeArchetypes`, and the passed `targetSize` (the variant
// owns its size via `PICKFIT.targetSize`). Falls back to the `default` algorithm
// when no usable draft records are bundled.
export function generatePickfit(
  rng: () => number,
  poolData: PoolData,
): VariantResult {
  return growPoolFromCorpus(
    rng,
    poolData,
    buildPickfitCorpus(poolData),
    PICKFIT.targetSize,
    PICKFIT,
    "pickfit",
  );
}

/** Strategy adapter for the `pickfit` algorithm. */
export const pickfitStrategy: PoolStrategy = {
  id: "pickfit",
  description:
    "Draw one card at random and grow a 150-card pool around it by pick-record " +
    "affinity — an availability-corrected play-rate prior and a behavioural " +
    "synergy estimate from what real drafters took over what they passed.",
  // Deliberately ignores `request.targetSize`: the variant pins its own size via
  // `PICKFIT.targetSize`, so the quest's global pool target does not override it.
  generate: ({ rng, poolData }) => generatePickfit(rng, poolData),
};
