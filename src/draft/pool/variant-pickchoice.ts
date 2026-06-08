// The `pickchoice` variant: a choice model of drafting. Every pick is modelled as
// a discrete choice — the drafter took ONE card OVER the others in the pack, given
// what they had already picked. A conditional-logit model is fit by maximum
// likelihood over all such choices:
//
//   P(take c | pack S, pool P) ∝ exp( quality[c] + Σ_{d∈P} synergy[d→c] )
//
// `quality[c]` is how intrinsically pickable a card is; `synergy[d→c]` is how much
// already holding d pulls c. Both are learned jointly from the taken-over-passed
// signal — the model has to explain the actual choices, so it naturally discounts
// a card that is "always available but rarely taken" and rewards a pair that is
// taken together more than either card's solo pickability predicts. This is the
// most principled use of the pick records; it reads only ids, packs, and picks,
// never the final decklists.
//
// The fitted `quality` becomes the grower's prior (min-max normalised) and the
// positive `synergy` weights become its affinity. Pairs are restricted to those
// with enough co-offer support, both to regularise and to bound the parameter
// count. The fit runs once per pool data set (cached), so its cost is amortised
// across every pool generated from it.

import {
  type AffinityCorpus,
  type AffinityGrowerTuning,
  growPoolFromCorpus,
} from "./affinity-grower.ts";
import { accumulatePickStats } from "./pick-stats.ts";
import type { PoolStrategy } from "./strategy.ts";
import type { PickRecord, PoolData, VariantResult } from "./types.ts";

interface PickChoiceTuning extends AffinityGrowerTuning {
  targetSize: number;
  // Minimum co-offer support for a (d→c) synergy parameter to be fit at all.
  minSupport: number;
  // Gradient-ascent settings for the maximum-likelihood fit.
  epochs: number;
  learningRate: number;
  // L2 weight decay applied to every parameter each epoch (keeps the fit stable
  // and shrinks unsupported signal toward zero).
  l2: number;
}
export const PICKCHOICE: PickChoiceTuning = {
  targetSize: 150,
  cap: 2,
  seedAffinityWeight: 0.4,
  priorWeight: 0.1,
  secondCopyFactor: 0.55,
  topPartnerCount: 8,
  minSupport: 3,
  epochs: 40,
  learningRate: 0.05,
  l2: 0.01,
};

interface ChoiceSample {
  pack: string[];
  chosenIndex: number;
  pool: string[];
}

// Collect one choice sample per (taken card) pick: the deduped pack, the index of
// the taken card within it, and the cards already picked. Multi-card picks become
// one sample each; empty picks and cards somehow absent from their pack are
// skipped.
function collectSamples(records: readonly PickRecord[]): ChoiceSample[] {
  const samples: ChoiceSample[] = [];
  for (const rec of records) {
    const poolSoFar: string[] = [];
    const len = Math.min(rec.packs.length, rec.picks.length);
    for (let i = 0; i < len; i += 1) {
      const pack = [...new Set(rec.packs[i])];
      for (const chosen of rec.picks[i]) {
        const chosenIndex = pack.indexOf(chosen);
        if (chosenIndex !== -1) {
          samples.push({ pack, chosenIndex, pool: [...poolSoFar] });
        }
      }
      for (const c of rec.picks[i]) poolSoFar.push(c);
    }
  }
  return samples;
}

// Fit the conditional-logit model by gradient ascent on the log-likelihood.
// `quality` is keyed by card id; `synergyByCard[c]` maps a pool-mate d to the
// learned synergy[d→c] (only tracked, supported pairs are parameters).
function fitChoiceModel(
  records: readonly PickRecord[],
  trackedByCard: Map<string, Map<string, number>>,
  qualityCards: Iterable<string>,
): { quality: Map<string, number>; synergyByCard: Map<string, Map<string, number>> } {
  const quality = new Map<string, number>();
  for (const c of qualityCards) quality.set(c, 0);
  const synergyByCard = trackedByCard;

  const samples = collectSamples(records);
  const { learningRate: lr, l2, epochs } = PICKCHOICE;

  const utilityOf = (c: string, pool: string[]): number => {
    let u = quality.get(c) ?? 0;
    const row = synergyByCard.get(c);
    if (row !== undefined) {
      for (const d of pool) {
        const v = row.get(d);
        if (v !== undefined) u += v;
      }
    }
    return u;
  };

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    for (const { pack, chosenIndex, pool } of samples) {
      // Softmax over the pack.
      const utils = pack.map((c) => utilityOf(c, pool));
      let max = -Infinity;
      for (const u of utils) if (u > max) max = u;
      let sum = 0;
      const probs = utils.map((u) => {
        const e = Math.exp(u - max);
        sum += e;
        return e;
      });
      for (let k = 0; k < probs.length; k += 1) probs[k] /= sum;

      // Gradient of the log-likelihood: (1{chosen} - p_k) for each candidate.
      for (let k = 0; k < pack.length; k += 1) {
        const g = (k === chosenIndex ? 1 : 0) - probs[k];
        if (g === 0) continue;
        const c = pack[k];
        quality.set(c, (quality.get(c) ?? 0) + lr * g);
        const row = synergyByCard.get(c);
        if (row !== undefined) {
          for (const d of pool) {
            const v = row.get(d);
            if (v !== undefined) row.set(d, v + lr * g);
          }
        }
      }
    }

    // L2 weight decay.
    const decay = 1 - l2;
    for (const [c, v] of quality) quality.set(c, v * decay);
    for (const row of synergyByCard.values()) {
      for (const [d, v] of row) row.set(d, v * decay);
    }
  }

  return { quality, synergyByCard };
}

const cache = new WeakMap<PoolData, AffinityCorpus | null>();

// Exported for the corpus unit test.
export function buildPickChoiceCorpus(poolData: PoolData): AffinityCorpus | null {
  const cached = cache.get(poolData);
  if (cached !== undefined) return cached;

  const records = poolData.draftRecords;
  let result: AffinityCorpus | null = null;
  if (records && records.length > 0) {
    const stats = accumulatePickStats(records);
    if (stats.taken.size > 0) {
      // Tracked synergy parameters: pairs co-offered at least minSupport times,
      // stored as synergyByCard[c][d] = synergy[d→c], initialised to 0.
      const trackedByCard = new Map<string, Map<string, number>>();
      for (const [d, row] of stats.offeredWith) {
        for (const [c, ow] of row) {
          if (ow < PICKCHOICE.minSupport) continue;
          let byD = trackedByCard.get(c);
          if (byD === undefined) {
            byD = new Map<string, number>();
            trackedByCard.set(c, byD);
          }
          byD.set(d, 0);
        }
      }

      const { quality, synergyByCard } = fitChoiceModel(
        records,
        trackedByCard,
        stats.offered.keys(),
      );

      // Prior = min-max normalised quality over the drawable (taken) cards.
      const cards = [...stats.taken.keys()];
      let lo = Infinity;
      let hi = -Infinity;
      for (const c of cards) {
        const q = quality.get(c) ?? 0;
        if (q < lo) lo = q;
        if (q > hi) hi = q;
      }
      const span = hi - lo || 1;
      const prior = new Map<string, number>();
      for (const c of cards) prior.set(c, ((quality.get(c) ?? 0) - lo) / span);

      // Affinity[d][c] = positive learned synergy[d→c].
      const affinity = new Map<string, Map<string, number>>();
      for (const [c, row] of synergyByCard) {
        for (const [d, v] of row) {
          if (v <= 0) continue;
          let byD = affinity.get(d);
          if (byD === undefined) {
            byD = new Map<string, number>();
            affinity.set(d, byD);
          }
          byD.set(c, v);
        }
      }

      result = { cards, affinity, prior };
    }
  }

  cache.set(poolData, result);
  return result;
}

export function generatePickChoice(
  rng: () => number,
  poolData: PoolData,
): VariantResult {
  return growPoolFromCorpus(
    rng,
    poolData,
    buildPickChoiceCorpus(poolData),
    PICKCHOICE.targetSize,
    PICKCHOICE,
    "pickchoice",
  );
}

/** Strategy adapter for the `pickchoice` algorithm. */
export const pickChoiceStrategy: PoolStrategy = {
  id: "pickchoice",
  description:
    "Fit a conditional-logit choice model (card quality + pairwise synergy) to " +
    "every taken-over-passed draft pick, then grow a pool from the learned weights.",
  generate: ({ rng, poolData }) => generatePickChoice(rng, poolData),
};
