import { isFrontRankSlotId, rankSlotIds } from "../types";
import type { FrontRankSlotId, BackRankSlotId } from "../types";
import type { AiCard, ForwardModel } from "./forward-model";
import type { PlannedAction } from "./planner";

/**
 * Defensive repositioning for the AI on the OPPONENT's turn.
 *
 * The offensive planner (`planner.ts`) only runs on the AI's own turn. During
 * the opponent's Dusk the AI is the defender: it positions front-rank blockers
 * opposite the opponent's challengers so they do not score unopposed
 * (`battle_rules.md` §Challengers, Defenders, and Scoring — a defended
 * challenger does not score). This module decides which back-rank bodies to push
 * up into which lanes; the hook dispatches the resulting moves.
 *
 * Only an un-exhausted back-rank body can be moved to the front (the engine
 * stamps entered-play turns, projected as `canChallengeThisTurn`), matching the
 * rule that an exhausted character cannot be moved to the front rank.
 */

export interface DefenseOptions {
  /** Victory-point threshold, used to weigh whether a chump block is worth it. */
  scoreToWin: number;
}

interface BackRankBody {
  slot: BackRankSlotId;
  card: AiCard;
  /** Effective spark this body brings to the lane it blocks in. */
  spark: number;
}

interface Challenger {
  slot: FrontRankSlotId;
  spark: number;
}

/**
 * Plans the AI's defensive repositions against the opponent's committed
 * challengers, returning one `MOVE_CARD` action per lane the AI chooses to
 * block (back-rank body → the front-rank slot directly opposite the challenger).
 *
 * Lanes are defended biggest-threat-first so the scarce back-rank bodies cover
 * the challengers that would score the most. A lane already holding an AI body
 * is left alone — that body already defends it.
 */
export function planDefense(model: ForwardModel, opts: DefenseOptions): PlannedAction[] {
  const challengers: Challenger[] = model.opponentBodies
    .filter((body) => body.rank === "front" && isFrontRankSlotId(body.slot))
    .map((body) => ({ slot: body.slot as FrontRankSlotId, spark: body.effectiveSpark }))
    .sort((a, b) => b.spark - a.spark);
  if (challengers.length === 0) {
    return [];
  }

  const available: BackRankBody[] = [];
  for (const slot of rankSlotIds(model.aiBackRank)) {
    const card = model.aiBackRank[slot];
    if (card !== null && card.canChallengeThisTurn) {
      available.push({ slot, card, spark: bodySpark(card) });
    }
  }
  if (available.length === 0) {
    return [];
  }

  const moves: PlannedAction[] = [];
  const usedBackRank = new Set<BackRankSlotId>();
  for (const challenger of challengers) {
    // A body already sitting opposite the challenger is already defending it.
    if ((model.aiFrontRank[challenger.slot] ?? null) !== null) {
      continue;
    }
    const blocker = chooseBlocker(available, usedBackRank, challenger.spark, model, opts);
    if (blocker === null) {
      continue;
    }
    usedBackRank.add(blocker.slot);
    moves.push(makeBlockAction(blocker.card, challenger.slot));
  }
  return moves;
}

function bodySpark(card: AiCard): number {
  return card.basePrintedSpark * card.figmentCount + card.sparkDelta;
}

/**
 * Picks the best available back-rank body to block a challenger of `challengerSpark`:
 *
 * 1. **Favorable** — the smallest body that still outsparks the challenger,
 *    killing it and surviving. Using the smallest keeps bigger bodies free for
 *    bigger threats.
 * 2. **Even** — a body of equal spark, trading (both dissolve) to deny the
 *    challenger's points.
 * 3. **Chump** — the smallest body as a pure sacrifice, but only when denying
 *    these points is worth a body: the AI is not safely ahead, or the hit would
 *    put the opponent at/over the win threshold.
 *
 * Returns `null` when no body is worth committing.
 */
function chooseBlocker(
  available: BackRankBody[],
  used: ReadonlySet<BackRankSlotId>,
  challengerSpark: number,
  model: ForwardModel,
  opts: DefenseOptions,
): BackRankBody | null {
  const candidates = available
    .filter((body) => !used.has(body.slot))
    .sort((a, b) => a.spark - b.spark);
  if (candidates.length === 0) {
    return null;
  }

  const favorable = candidates.find((body) => body.spark > challengerSpark);
  if (favorable !== undefined) {
    return favorable;
  }
  const even = candidates.find((body) => body.spark === challengerSpark);
  if (even !== undefined) {
    return even;
  }
  if (shouldChump(challengerSpark, model, opts)) {
    return candidates[0];
  }
  return null;
}

/**
 * Whether to spend a body chump-blocking a challenger the AI cannot beat. Worth
 * it when the AI is not ahead (it must contest every point) or the unblocked
 * hit would reach the win threshold (a near-lethal swing to prevent).
 */
function shouldChump(
  challengerSpark: number,
  model: ForwardModel,
  opts: DefenseOptions,
): boolean {
  const notAhead = model.aiScore <= model.playerScore;
  const nearLethal = model.playerScore + challengerSpark >= opts.scoreToWin;
  return notAhead || nearLethal;
}

function makeBlockAction(card: AiCard, toSlot: FrontRankSlotId): PlannedAction {
  return {
    stage: "reposition",
    kind: "MOVE_CARD",
    self: card,
    targets: null,
    toSlot,
    trace: {
      stage: "reposition",
      choice: "MOVE_CARD",
      battleCardId: card.battleCardId,
      cardName: card.name,
      sourceHandIndex: null,
      sourceSlotId: null,
      targetSlotId: toSlot,
      heuristicScoreBefore: null,
      heuristicScoreAfter: null,
    },
  };
}
