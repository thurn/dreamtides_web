// The `pickpos` variant: a pool grower keyed on PICK ORDER rather than pick rate.
// Two ways the pick position drives it:
//   * Prior = pick-priority. A card's quality is how EARLY it is taken on average
//     when chosen — a pick-1 bomb scores high, a card that only ever wheels scores
//     low — instead of `pickfit`'s availability-corrected pick rate.
//   * Synergy = position-weighted excess lift. Every observation is weighted by a
//     decreasing function of its pack position, so confident early picks dominate
//     the synergy estimate and the noisy late-pick tail barely registers (a soft
//     version of `pickearly`'s hard cutoff).
// Both signals come purely from the draft pick records (ids, packs, picks) and
// never touch the final decklists. Fed to the shared affinity grower.

import {
  type AffinityCorpus,
  type AffinityGrowerTuning,
  growPoolFromCorpus,
} from "./affinity-grower.ts";
import {
  PICKS_PER_PACK,
  type PickStats,
  accumulatePickStats,
  buildExcessLiftCorpus,
} from "./pick-stats.ts";
import type { PoolStrategy } from "./strategy.ts";
import type { PoolData, VariantResult } from "./types.ts";

interface PickPosTuning extends AffinityGrowerTuning {
  targetSize: number;
  shrinkage: number;
  minSupport: number;
}
export const PICKPOS: PickPosTuning = {
  targetSize: 150,
  cap: 2,
  seedAffinityWeight: 0.4,
  priorWeight: 0.1,
  secondCopyFactor: 0.55,
  topPartnerCount: 8,
  // Observations are position-weighted (and thus smaller), so trust a pair on
  // less raw support than the equal-weight variants.
  shrinkage: 3,
  minSupport: 1,
};

// Linear position weight: the first pick of a pack counts 1, the last ~0.1.
function positionWeight(position: number): number {
  return (PICKS_PER_PACK - position) / PICKS_PER_PACK;
}

// Pick-priority prior: 1 when a card is always taken at the first pick, ~0 when it
// is only ever taken at the last. Built from the unweighted average pick position.
function pickPriorityPrior(stats: PickStats): Map<string, number> {
  const prior = new Map<string, number>();
  const maxPos = PICKS_PER_PACK - 1;
  for (const [c, sum] of stats.takenPosSum) {
    const count = stats.takenCount.get(c) ?? 0;
    if (count === 0) continue;
    prior.set(c, 1 - sum / count / maxPos);
  }
  return prior;
}

const cache = new WeakMap<PoolData, AffinityCorpus | null>();

// Exported for the corpus unit test.
export function buildPickPosCorpus(poolData: PoolData): AffinityCorpus | null {
  const cached = cache.get(poolData);
  if (cached !== undefined) return cached;

  const records = poolData.draftRecords;
  let result: AffinityCorpus | null = null;
  if (records && records.length > 0) {
    const stats = accumulatePickStats(records, { weight: positionWeight });
    result = buildExcessLiftCorpus(stats, {
      shrinkage: PICKPOS.shrinkage,
      minSupport: PICKPOS.minSupport,
      priorOverride: pickPriorityPrior(stats),
    });
  }

  cache.set(poolData, result);
  return result;
}

export function generatePickPos(
  rng: () => number,
  poolData: PoolData,
): VariantResult {
  return growPoolFromCorpus(
    rng,
    poolData,
    buildPickPosCorpus(poolData),
    PICKPOS.targetSize,
    PICKPOS,
    "pickpos",
  );
}

/** Strategy adapter for the `pickpos` algorithm. */
export const pickPosStrategy: PoolStrategy = {
  id: "pickpos",
  description:
    "Grow a pool from pick ORDER: card quality is how early a card is taken, and " +
    "synergy is position-weighted so early picks dominate over late-pack dregs.",
  generate: ({ rng, poolData }) => generatePickPos(rng, poolData),
};
