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
  growAffinityPool,
  toNamedProvenance,
} from "./affinity-grower.ts";
import type { PoolStrategy } from "./strategy.ts";
import type { PoolData, VariantResult } from "./types.ts";
import { generate } from "./variant-color-pool.ts";

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

// Increment m[outer][inner] by one, creating the inner map on first write.
function bumpPair(
  m: Map<string, Map<string, number>>,
  outer: string,
  inner: string,
): void {
  let row = m.get(outer);
  if (row === undefined) {
    row = new Map<string, number>();
    m.set(outer, row);
  }
  row.set(inner, (row.get(inner) ?? 0) + 1);
}

// Build the `pickfit` corpus from the bundled draft pick records. Walks each
// seat's picks in order, accumulating the cards taken so far so the conditional
// "take c given d already picked" can be counted, then derives the prior and the
// shrunk synergy affinity. Everything is keyed by the rename-proof card key.
// Exported for the corpus unit test.
export function buildPickfitCorpus(poolData: PoolData): AffinityCorpus | null {
  const cached = pickfitCorpusCache.get(poolData);
  if (cached !== undefined) return cached;

  const records = poolData.draftRecords;
  let result: AffinityCorpus | null = null;
  if (records && records.length > 0) {
    // Unconditional offer/take counts per card key.
    const offered = new Map<string, number>();
    const taken = new Map<string, number>();
    // Conditional counts: how often c was offered / taken while d was already in
    // the drafter's pool, keyed offeredWith[d][c].
    const offeredWith = new Map<string, Map<string, number>>();
    const takenWith = new Map<string, Map<string, number>>();

    for (const rec of records) {
      const poolSoFar = new Set<string>();
      const len = Math.min(rec.packs.length, rec.picks.length);
      for (let i = 0; i < len; i += 1) {
        // Dedupe the pack to card ids; a duplicate id collapses to one offer so
        // it does not double-count.
        const packKeys = [...new Set(rec.packs[i])];
        const chosen = new Set(rec.picks[i]);
        for (const c of packKeys) {
          offered.set(c, (offered.get(c) ?? 0) + 1);
          const isTaken = chosen.has(c);
          if (isTaken) taken.set(c, (taken.get(c) ?? 0) + 1);
          for (const d of poolSoFar) {
            if (d === c) continue;
            bumpPair(offeredWith, d, c);
            if (isTaken) bumpPair(takenWith, d, c);
          }
        }
        for (const c of chosen) poolSoFar.add(c);
      }
    }

    if (offered.size > 0) {
      // Availability-corrected play-rate prior.
      const prior = new Map<string, number>();
      for (const [c, o] of offered) prior.set(c, (taken.get(c) ?? 0) / o);

      // Shrunk EXCESS pick rate (condRate above baseline) as the synergy
      // affinity, floored at zero so only positive synergy is recorded; power is
      // left to the prior term.
      const { shrinkage, minSupport } = PICKFIT;
      const affinity = new Map<string, Map<string, number>>();
      for (const [d, row] of offeredWith) {
        const tRow = takenWith.get(d);
        const normRow = new Map<string, number>();
        for (const [c, ow] of row) {
          if (ow < minSupport) continue;
          const condRate = (tRow?.get(c) ?? 0) / ow;
          const baseline = prior.get(c) ?? 0;
          const w = ow / (ow + shrinkage);
          const excess = w * (condRate - baseline);
          if (excess > 0) normRow.set(c, excess);
        }
        if (normRow.size > 0) affinity.set(d, normRow);
      }

      // The drawable universe and grower candidate set: every card that was
      // taken into a real deck at least once, mirroring `seed`'s "cards that
      // appear in real decks". Cards offered but never taken stay out of pools.
      const cards = [...taken.keys()];
      result = { cards, affinity, prior };
    }
  }

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
  const corpus = buildPickfitCorpus(poolData);
  if (!corpus || corpus.cards.length === 0) return generate(rng, poolData);

  // Step 1 — draw the seed uniformly at random from every corpus card key.
  const seedKey = corpus.cards[Math.floor(rng() * corpus.cards.length)];

  // Step 2 — grow the pool from it by blended affinity, entirely in key space.
  const { counts, provenance } = growAffinityPool(
    corpus,
    seedKey,
    PICKFIT.targetSize,
    PICKFIT,
  );

  // Step 3 — map the UUID-keyed pool back onto current display names.
  const nameOf = (key: string): string => poolData.cardNameById?.get(key) ?? key;
  const namedCounts = new Map<string, number>();
  for (const [key, copies] of counts) namedCounts.set(nameOf(key), copies);

  return {
    C: new Set(),
    selected: ["pickfit", `card:${nameOf(seedKey)}`],
    counts: namedCounts,
    seedProvenance: toNamedProvenance(provenance, nameOf),
  };
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
