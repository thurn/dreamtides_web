import { isFrontRankSlotId, rankSlotIds } from "../types";
import type { FrontRankSlotId, BackRankSlotId } from "../types";
import type { AiCard, ForwardModel } from "./forward-model";
import type { PlannedAction } from "./planner";

/**
 * Blocking repositioning for the AI on the OPPONENT's turn.
 *
 * The challenge planner (`planner.ts`) only runs on the AI's own turn. During
 * the opponent's Dusk the AI is the blocker: it positions front-rank blockers
 * opposite the opponent's challengers so they do not score unopposed
 * (`battle_rules.md` §Challengers, Blockers, and Scoring — a blocked
 * challenger does not score). This module decides which back-rank bodies to push
 * up into which lanes; the hook dispatches the resulting moves.
 *
 * Only an un-exhausted back-rank body can be moved to the front (the engine
 * stamps entered-play turns, projected as `canChallengeThisTurn`), matching the
 * rule that an exhausted character cannot be moved to the front rank.
 */

export interface BlockingOptions {
  /** Victory-point threshold, used to weigh whether a chump block is worth it. */
  scoreToWin: number;
}

export type BlockMoveReason =
  | "favorable"
  | "even-trade"
  | "score-deficit"
  | "prevent-lethal";

export type BlockDeclineReason =
  | "already-blocked"
  | "no-available-blocker"
  | "preserve-body-while-ahead";

export interface BlockingLaneDecision {
  challengerBattleCardId: string;
  lane: FrontRankSlotId;
  challengerSpark: number;
  outcome: "blocked" | "declined" | "already-blocked";
  reason: BlockMoveReason | BlockDeclineReason;
  blockerBattleCardId: string | null;
  blockerSpark: number | null;
}

/**
 * Plain-data explanation of one deterministic blocking pass. UUIDs and lane ids
 * make the selected and declined blocks reconstructable from production logs
 * without relying on display names.
 */
export interface BlockingDecision {
  aiScore: number;
  opponentScore: number;
  scoreToWin: number;
  incomingScoreBeforeBlocks: number;
  incomingScoreAfterBlocks: number;
  lethalBeforeBlocks: boolean;
  lethalPreventable: boolean;
  availableBlockerBattleCardIds: string[];
  lanes: BlockingLaneDecision[];
}

export interface BlockingPlan {
  actions: PlannedAction[];
  decision: BlockingDecision;
}

interface BackRankBody {
  slot: BackRankSlotId;
  card: AiCard;
  /** Effective spark this body brings to the lane it blocks in. */
  spark: number;
}

interface Challenger {
  battleCardId: string;
  slot: FrontRankSlotId;
  spark: number;
}

interface BlockerChoice {
  blocker: BackRankBody;
  reason: BlockMoveReason;
}

/**
 * Plans the AI's blocking repositions against the opponent's committed
 * challengers, returning one `MOVE_CARD` action per lane the AI chooses to
 * block (back-rank body → the front-rank slot directly opposite the challenger).
 *
 * Lanes are blocked biggest-threat-first so the scarce back-rank bodies cover
 * the challengers that would score the most. A lane already holding an AI body
 * is left alone — that body already blocks it.
 */
export function planBlocking(model: ForwardModel, opts: BlockingOptions): PlannedAction[] {
  return planBlockingWithDecision(model, opts).actions;
}

/**
 * Plans the same observable moves as {@link planBlocking} and returns the
 * structured decision record used by tutorial battle logging.
 */
export function planBlockingWithDecision(
  model: ForwardModel,
  opts: BlockingOptions,
): BlockingPlan {
  const challengers: Challenger[] = model.opponentBodies
    .filter((body) => body.rank === "front" && isFrontRankSlotId(body.slot))
    .map((body) => ({
      battleCardId: body.battleCardId,
      slot: body.slot as FrontRankSlotId,
      spark: body.effectiveSpark,
    }))
    .sort((a, b) => b.spark - a.spark || a.slot.localeCompare(b.slot));

  const available: BackRankBody[] = [];
  for (const slot of rankSlotIds(model.aiBackRank)) {
    const card = model.aiBackRank[slot];
    if (card !== null && card.canChallengeThisTurn) {
      available.push({ slot, card, spark: bodySpark(card) });
    }
  }

  const unblockedChallengers = challengers.filter(
    (challenger) => (model.aiFrontRank[challenger.slot] ?? null) === null,
  );
  const incomingScoreBeforeBlocks = unblockedChallengers.reduce(
    (total, challenger) => total + challenger.spark,
    0,
  );
  const lethalBeforeBlocks =
    model.playerScore + incomingScoreBeforeBlocks >= opts.scoreToWin;
  const maximumPreventableScore = unblockedChallengers
    .slice(0, available.length)
    .reduce((total, challenger) => total + challenger.spark, 0);
  const lethalPreventable =
    lethalBeforeBlocks &&
    model.playerScore + incomingScoreBeforeBlocks - maximumPreventableScore <
      opts.scoreToWin;

  const moves: PlannedAction[] = [];
  const lanes: BlockingLaneDecision[] = [];
  const usedBackRank = new Set<BackRankSlotId>();
  let incomingScoreAfterBlocks = incomingScoreBeforeBlocks;
  for (const challenger of challengers) {
    // A body already sitting opposite the challenger is already blocking it.
    const deployedBlocker = model.aiFrontRank[challenger.slot] ?? null;
    if (deployedBlocker !== null) {
      lanes.push({
        challengerBattleCardId: challenger.battleCardId,
        lane: challenger.slot,
        challengerSpark: challenger.spark,
        outcome: "already-blocked",
        reason: "already-blocked",
        blockerBattleCardId: deployedBlocker.battleCardId,
        blockerSpark: bodySpark(deployedBlocker),
      });
      continue;
    }
    const choice = chooseBlocker(
      available,
      usedBackRank,
      challenger.spark,
      incomingScoreAfterBlocks,
      lethalPreventable,
      model,
      opts,
    );
    if (choice === null) {
      const hasAvailableBlocker = available.some(
        (body) => !usedBackRank.has(body.slot),
      );
      lanes.push({
        challengerBattleCardId: challenger.battleCardId,
        lane: challenger.slot,
        challengerSpark: challenger.spark,
        outcome: "declined",
        reason: hasAvailableBlocker
          ? "preserve-body-while-ahead"
          : "no-available-blocker",
        blockerBattleCardId: null,
        blockerSpark: null,
      });
      continue;
    }
    const blocker = choice.blocker;
    usedBackRank.add(blocker.slot);
    moves.push(makeBlockAction(blocker.card, challenger.slot));
    incomingScoreAfterBlocks -= challenger.spark;
    lanes.push({
      challengerBattleCardId: challenger.battleCardId,
      lane: challenger.slot,
      challengerSpark: challenger.spark,
      outcome: "blocked",
      reason: choice.reason,
      blockerBattleCardId: blocker.card.battleCardId,
      blockerSpark: blocker.spark,
    });
  }
  return {
    actions: moves,
    decision: {
      aiScore: model.aiScore,
      opponentScore: model.playerScore,
      scoreToWin: opts.scoreToWin,
      incomingScoreBeforeBlocks,
      incomingScoreAfterBlocks,
      lethalBeforeBlocks,
      lethalPreventable,
      availableBlockerBattleCardIds: available.map(
        (body) => body.card.battleCardId,
      ),
      lanes,
    },
  };
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
  incomingScoreRemaining: number,
  lethalPreventable: boolean,
  model: ForwardModel,
  opts: BlockingOptions,
): BlockerChoice | null {
  const candidates = available
    .filter((body) => !used.has(body.slot))
    .sort((a, b) => a.spark - b.spark);
  if (candidates.length === 0) {
    return null;
  }

  const favorable = candidates.find((body) => body.spark > challengerSpark);
  if (favorable !== undefined) {
    return { blocker: favorable, reason: "favorable" };
  }
  const even = candidates.find((body) => body.spark === challengerSpark);
  if (even !== undefined) {
    return { blocker: even, reason: "even-trade" };
  }
  const chumpReason = chumpBlockReason(
    incomingScoreRemaining,
    lethalPreventable,
    model,
    opts,
  );
  if (chumpReason !== null) {
    return { blocker: candidates[0], reason: chumpReason };
  }
  return null;
}

/**
 * Whether to spend a body chump-blocking a challenger the AI cannot beat. Worth
 * it when the AI is not ahead (it must contest every point), or when the full
 * set of legal blocks can reduce the opponent's aggregate incoming score below
 * the win threshold. Aggregate score is essential: two non-lethal lanes can be
 * lethal together.
 */
function chumpBlockReason(
  incomingScoreRemaining: number,
  lethalPreventable: boolean,
  model: ForwardModel,
  opts: BlockingOptions,
): "score-deficit" | "prevent-lethal" | null {
  const incomingRemainsLethal =
    model.playerScore + incomingScoreRemaining >= opts.scoreToWin;
  if (lethalPreventable && incomingRemainsLethal) {
    return "prevent-lethal";
  }
  const notAhead = model.aiScore <= model.playerScore;
  return notAhead ? "score-deficit" : null;
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
