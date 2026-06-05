import { buildSupportContribution } from "./cards/support-contribution";
import { starterCardModels } from "./cards/index";
import { DEPLOY_SLOT_IDS, RESERVE_SLOT_IDS } from "../types";
import type { AiCard, ForwardModel } from "./forward-model";

/**
 * Static board evaluation. Maps a {@link ForwardModel} to a single scalar from
 * the AI's point of view (higher is better). It is a weighted sum of the
 * interpretable terms enumerated in `battle_ai.md` §"The Evaluation Function".
 *
 * The function is pure and O(board size): it never mutates `model` and runs a
 * bounded number of fixed-size loops, so the planner can call it freely inside
 * the search.
 *
 * The "Expected next-Challenge points" and "Risk exposure" terms in the design
 * depend on the opponent-response model (Task 4.1) and are weighted by the
 * planner (Task 4.2). Here, expected points is a simple, opponent-model-free
 * estimate (see {@link EXPECTED_POINTS_WEIGHT}), and the full risk term is
 * omitted; its opponent-weighted refinement lives in the planner.
 */

// --- Tuning knobs ---------------------------------------------------------
// Weights are named constants so Task 4.3's self-play harness can adjust them
// without touching the term logic.
//
// Validated by `scripts/battle-ai-experiment.mjs` (Task 4.3): over 100 seeded
// self-play games per matchup the planner with these weights wins 100% vs
// random-legal and 64% vs greedy one-ply, with every per-decision time well
// under the 100ms budget. The weights below cleared that bar on the first run,
// so no tuning pass was applied; they remain the values that harness confirms
// competent. Re-run the harness after changing any of them.

/** Score reaching this value wins the game (matches `BattleInit.scoreToWin`). */
const SCORE_TO_WIN = 25;

/** Score differential dominates; one point is worth a large board swing. */
const SCORE_DIFF_WEIGHT = 10;

/** Front-rank (deployed) board spark. Weighted above back-rank. */
const FRONT_SPARK_WEIGHT = 1;

/** Back-rank (reserve) board spark. Lower than front so deployed bodies lead. */
const BACK_SPARK_WEIGHT = 0.5;

/** Each card in the AI's hand. */
const HAND_CARD_WEIGHT = 1.5;

/** Multiplier on the summed per-card `valueHint` of engine cards in play/hand. */
const VALUE_HINT_WEIGHT = 1;

/** Penalty per point of energy left unspent (tempo waste). Small. */
const ENERGY_WASTE_WEIGHT = 0.25;

/** Simple estimate of spark that will score unblocked next Challenge. */
const EXPECTED_POINTS_WEIGHT = 1;

/** Bonus for a live Runebound Champion (#513), a recurring ▸Dawn point source. */
const INEVITABILITY_WEIGHT = 2;

/** Card number of Runebound Champion (▸Dawn: gain 1⍟). */
const SIGILSWORN_CHAMPION = 513;

// --- Helpers --------------------------------------------------------------

/** Base spark of an {@link AiCard}: printed spark times figment stack, plus delta. */
function baseSpark(card: AiCard): number {
  return card.basePrintedSpark * card.figmentCount + card.sparkDelta;
}

/**
 * Sums each on-board/in-hand card's `valueHint` (when its model defines one),
 * looked up by `cardNumber` in {@link starterCardModels}. Engine cards (Last
 * Witness, Glimpse, Sign of Arrival, Circlewatch) register their card-advantage
 * value here.
 */
function valueHintSum(model: ForwardModel, card: AiCard): number {
  const cardModel = starterCardModels.get(card.cardNumber);
  const hint = cardModel?.valueHint?.(model, card);
  return hint ?? 0;
}

// --- Evaluation -----------------------------------------------------------

export function evaluate(model: ForwardModel): number {
  // Terminal check first, short-circuiting every other term: a terminal state
  // is decisive regardless of the board.
  if (model.aiScore >= SCORE_TO_WIN) {
    return Number.POSITIVE_INFINITY;
  }
  if (model.playerScore >= SCORE_TO_WIN) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = 0;

  // Score differential — the dominant term.
  score += SCORE_DIFF_WEIGHT * (model.aiScore - model.playerScore);

  // Board spark. AI effective spark adds the support contribution to each
  // deployed body's base spark; opponent bodies use their abstract
  // `effectiveSpark` directly, split front/back by `rank`.
  const support = buildSupportContribution(model);

  let aiFrontSpark = 0;
  let expectedPoints = 0;
  // Opponent front spark, per deployed slot, used to floor the simple
  // expected-points estimate (a body opposite a defender scores its excess).
  const opponentFrontSparkBySlot = new Map<string, number>();
  for (const body of model.opponentBodies) {
    if (body.rank === "front") {
      opponentFrontSparkBySlot.set(
        body.slot,
        (opponentFrontSparkBySlot.get(body.slot) ?? 0) + body.effectiveSpark,
      );
    }
  }

  for (const slot of DEPLOY_SLOT_IDS) {
    const card = model.aiDeployed[slot];
    if (card === null) {
      continue;
    }
    const spark = baseSpark(card) + (support.get(card.battleCardId) ?? 0);
    aiFrontSpark += spark;

    // Simple expected next-Challenge points: a deployed challenger that can act
    // this turn scores its effective spark minus the directly-opposing front
    // body's spark, floored at 0. The opponent-model-weighted refinement (other
    // archetypal responses, removal risk) lives in the planner.
    if (card.canChallengeThisTurn) {
      const opposing = opponentFrontSparkBySlot.get(slot) ?? 0;
      expectedPoints += Math.max(0, spark - opposing);
    }
  }

  let aiBackSpark = 0;
  for (const slot of RESERVE_SLOT_IDS) {
    const card = model.aiReserve[slot];
    if (card !== null) {
      aiBackSpark += baseSpark(card) + (support.get(card.battleCardId) ?? 0);
    }
  }

  let opponentFrontSpark = 0;
  let opponentBackSpark = 0;
  for (const body of model.opponentBodies) {
    if (body.rank === "front") {
      opponentFrontSpark += body.effectiveSpark;
    } else {
      opponentBackSpark += body.effectiveSpark;
    }
  }

  score += FRONT_SPARK_WEIGHT * (aiFrontSpark - opponentFrontSpark);
  score += BACK_SPARK_WEIGHT * (aiBackSpark - opponentBackSpark);

  // Simple expected next-Challenge points estimate.
  score += EXPECTED_POINTS_WEIGHT * expectedPoints;

  // Card advantage: hand size plus per-card value hints across board + hand.
  score += HAND_CARD_WEIGHT * model.aiHand.length;

  let hintTotal = 0;
  let hasLiveSigilsworn = false;
  for (const card of model.aiHand) {
    hintTotal += valueHintSum(model, card);
  }
  for (const slot of DEPLOY_SLOT_IDS) {
    const card = model.aiDeployed[slot];
    if (card !== null) {
      hintTotal += valueHintSum(model, card);
      if (card.cardNumber === SIGILSWORN_CHAMPION) {
        hasLiveSigilsworn = true;
      }
    }
  }
  for (const slot of RESERVE_SLOT_IDS) {
    const card = model.aiReserve[slot];
    if (card !== null) {
      hintTotal += valueHintSum(model, card);
      if (card.cardNumber === SIGILSWORN_CHAMPION) {
        hasLiveSigilsworn = true;
      }
    }
  }
  score += VALUE_HINT_WEIGHT * hintTotal;

  // Inevitability: a live Runebound Champion is a recurring ▸Dawn point source.
  if (hasLiveSigilsworn) {
    score += INEVITABILITY_WEIGHT;
  }

  // Tempo / energy waste: small penalty for unspent AI energy.
  score -= ENERGY_WASTE_WEIGHT * model.aiEnergy;

  return score;
}
