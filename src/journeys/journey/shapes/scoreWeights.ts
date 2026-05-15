// Per-shape score weights.
//
// Ported verbatim from the CLI's `src/journey/shapes/scoreWeights.ts`.
//
// These weights are consumed by `scoreShapes` in the generation pipeline (port
// arrives in Task 16). The final selection weight is
// `contextualScore * scoreWeight + tieJitter`, so these values are the
// *relative* prevalence anchors for the first journey of a fresh `--stage
// early` seed. Weights are *not* normalized to sum to 100; the actual
// observed share for shape i is roughly `weight(i) / sum(weights)` over the
// total `~136`.
//
// `random_trades` still incurs ~22% repair drift even after the fill's
// viability filter, and its cascade lands on the next-highest-scored shape
// (`random_rewards`). This table does NOT compensate for that —
// `random_rewards` observes slightly above its linear nominal and
// `random_trades` slightly below. Re-measure when the distribution analyzer
// is ported.
//
// Mid/late-stage distributions are emergent: the `desiredTags` mechanism in
// the generation pipeline reshapes scores per stage; this table is the
// early-stage baseline.

import type { JourneyShapeId } from "./types";

const JOURNEY_SHAPE_SCORE_WEIGHTS: Readonly<Record<JourneyShapeId, number>> =
  Object.freeze({
    random_rewards: 20,
    random_trades: 15,
    one_operation_many_targets: 8,
    one_target_many_operations: 8,
    same_cost_different_rewards: 8,
    same_reward_different_costs: 8,
    take_any_number: 7,
    heterogeneous_pair: 7,
    shop_row: 7.0,
    alter_dreamscapes: 6,
    single_wager: 6,
    single_random_outcome: 6,
    now_vs_later: 5,
    choose_your_loss: 5,
    commit_now_future_payoff: 5,
    random_pool_draws: 4,
    push_your_luck: 4,
    single_offer: 3,
    flat_escalating_trade: 2,
    escalating_reward_chain: 1,
    reward_after_trigger: 1,
  });

export function getShapeScoreWeight(id: string): number {
  const weight = (JOURNEY_SHAPE_SCORE_WEIGHTS as Record<string, number>)[id];

  if (weight === undefined) {
    throw new Error(`Missing score weight for Journey shape '${id}'`);
  }

  return weight;
}

export function shapeScoreWeightIds(): readonly JourneyShapeId[] {
  return Object.keys(JOURNEY_SHAPE_SCORE_WEIGHTS) as JourneyShapeId[];
}
