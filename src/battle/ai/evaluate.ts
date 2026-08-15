import { buildSupportContribution } from "./cards/support-contribution";
import { starterCardModels } from "./cards/index";
import { rankSlotIds } from "../types";
import type { AiOpponentSlotId } from "./forward-model";
import type { AiCard, ForwardModel } from "./forward-model";
import type { AiEvaluationWeights } from "../../types/opponents-data";

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

export function evaluate(
  model: ForwardModel,
  scoreToWin: number,
  weights: AiEvaluationWeights,
): number {
  // Terminal check first, short-circuiting every other term: a terminal state
  // is decisive regardless of the board.
  if (model.aiScore >= scoreToWin) {
    return Number.POSITIVE_INFINITY;
  }
  if (model.playerScore >= scoreToWin) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = 0;

  // Score differential — the dominant term.
  score += weights.scoreDifference * (model.aiScore - model.playerScore);

  // Board spark. AI effective spark adds the support contribution to each
  // front-rank body's base spark; opponent bodies use their abstract
  // `effectiveSpark` directly, split front/back by `rank`.
  const support = buildSupportContribution(model);

  let aiFrontSpark = 0;
  let expectedPoints = 0;
  // Opponent front spark, per front-rank slot, used to floor the simple
  // expected-points estimate (a body opposite a blocker scores its excess).
  const opponentFrontSparkBySlot = new Map<AiOpponentSlotId, number>();
  for (const body of model.opponentBodies) {
    if (body.rank === "front") {
      opponentFrontSparkBySlot.set(
        body.slot,
        (opponentFrontSparkBySlot.get(body.slot) ?? 0) + body.effectiveSpark,
      );
    }
  }

  for (const slot of rankSlotIds(model.aiFrontRank)) {
    const card = model.aiFrontRank[slot];
    if (card === null) {
      continue;
    }
    const spark = baseSpark(card) + (support.get(card.battleCardId) ?? 0);
    aiFrontSpark += spark;

    // Simple expected next-Challenge points: a front-rank challenger that can act
    // this turn scores its effective spark minus the directly-opposing front
    // body's spark, floored at 0. The opponent-model-weighted refinement (other
    // archetypal responses, removal risk) lives in the planner.
    if (card.canChallengeThisTurn) {
      const opposing = opponentFrontSparkBySlot.get(slot) ?? 0;
      expectedPoints += Math.max(0, spark - opposing);
    }
  }

  let aiBackSpark = 0;
  for (const slot of rankSlotIds(model.aiBackRank)) {
    const card = model.aiBackRank[slot];
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

  score += weights.frontRankSpark * (aiFrontSpark - opponentFrontSpark);
  score += weights.backRankSpark * (aiBackSpark - opponentBackSpark);

  // Simple expected next-Challenge points estimate.
  score += weights.expectedPoints * expectedPoints;

  // Card advantage: hand size plus per-card value hints across board + hand.
  score += weights.handCard * model.aiHand.length;

  let hintTotal = 0;
  for (const card of model.aiHand) {
    hintTotal += valueHintSum(model, card);
  }
  for (const slot of rankSlotIds(model.aiFrontRank)) {
    const card = model.aiFrontRank[slot];
    if (card !== null) {
      hintTotal += valueHintSum(model, card);
    }
  }
  for (const slot of rankSlotIds(model.aiBackRank)) {
    const card = model.aiBackRank[slot];
    if (card !== null) {
      hintTotal += valueHintSum(model, card);
    }
  }
  score += weights.valueHint * hintTotal;

  // Tempo / energy waste: small penalty for unspent AI energy.
  score -= weights.energyWaste * model.aiEnergy;

  return score;
}
