// The `pickearly` variant: `pickfit`'s pick-data pool grower, but trusting only
// the EARLY picks of each pack. The first few picks of a pack are confident,
// high-signal choices; the late picks are dregs taken from a thinned pack — the
// pick-data equivalent of decklist bloat. By counting only picks at pack
// position < `earlyPicks`, the corpus keeps the clean signal and throws the noisy
// tail away. Cards a drafter took late still enter the running pool as context;
// they just do not contribute observations. Otherwise identical to `pickfit`:
// availability-corrected pick-rate prior, shrunk excess-lift synergy, fed to the
// shared affinity grower. Keyed entirely on stable card ids.

import {
  type AffinityCorpus,
  type AffinityGrowerTuning,
  growPoolFromCorpus,
} from "./affinity-grower.ts";
import { accumulatePickStats, buildExcessLiftCorpus } from "./pick-stats.ts";
import type { PoolStrategy } from "./strategy.ts";
import type { PoolData, VariantResult } from "./types.ts";

interface PickEarlyTuning extends AffinityGrowerTuning {
  targetSize: number;
  shrinkage: number;
  minSupport: number;
  // Count only picks whose 0-based pack position is below this — the first
  // `earlyPicks` of each 10-pick pack.
  earlyPicks: number;
}
// Identical to `PICKFIT` in every shared field — the variant is exactly
// "pickfit, but counting only the first `earlyPicks` picks of each pack", so the
// early-pick window is the single deliberate difference.
export const PICKEARLY: PickEarlyTuning = {
  targetSize: 150,
  cap: 2,
  seedAffinityWeight: 0.4,
  priorWeight: 0.1,
  secondCopyFactor: 0.55,
  topPartnerCount: 8,
  shrinkage: 5,
  minSupport: 3,
  earlyPicks: 5,
};

const cache = new WeakMap<PoolData, AffinityCorpus | null>();

// Exported for the corpus unit test.
export function buildPickEarlyCorpus(poolData: PoolData): AffinityCorpus | null {
  const cached = cache.get(poolData);
  if (cached !== undefined) return cached;

  const records = poolData.draftRecords;
  const result =
    records && records.length > 0
      ? buildExcessLiftCorpus(
          accumulatePickStats(records, { maxPosition: PICKEARLY.earlyPicks }),
          { shrinkage: PICKEARLY.shrinkage, minSupport: PICKEARLY.minSupport },
        )
      : null;

  cache.set(poolData, result);
  return result;
}

export function generatePickEarly(
  rng: () => number,
  poolData: PoolData,
): VariantResult {
  return growPoolFromCorpus(
    rng,
    poolData,
    buildPickEarlyCorpus(poolData),
    PICKEARLY.targetSize,
    PICKEARLY,
    "pickearly",
  );
}

/** Strategy adapter for the `pickearly` algorithm. */
export const pickEarlyStrategy: PoolStrategy = {
  id: "pickearly",
  description:
    "Like pickfit, but builds its pick-rate prior and synergy affinity only from " +
    "the early, high-confidence picks of each pack, discarding the late-pick tail.",
  generate: ({ rng, poolData }) => generatePickEarly(rng, poolData),
};
