import type { BattleDebugEdit } from "../debug/commands";
import {
  isFigmentInstance,
  selectEffectiveSparkForInstance,
  selectFigmentChallengeLossCount,
  selectFigmentCount,
} from "../state/figments";
import type {
  BattleCardInstance,
  BattleJudgmentResolution,
  BattleLaneJudgment,
  BattleMutableState,
  BattleSide,
  FrontRankSlotId,
} from "../types";
import { FRONT_RANK_SLOT_IDS } from "../types";

export interface JudgmentInput {
  state: BattleMutableState;
  activeSide: BattleSide;
  /**
   * Optional +✦ to add to a battleCardId's base spark (Support/static effects).
   * Empty for an unmodeled board.
   */
  supportContribution?: ReadonlyMap<string, number>;
}

export interface JudgmentProposal {
  resolution: BattleJudgmentResolution;
  /** ADJUST_SCORE + MOVE_CARD_TO_ZONE(void) edits to commit the outcome. */
  edits: BattleDebugEdit[];
}

/**
 * Resolves the Challenge phase for one active side as a pure proposal
 * (rules §Challenge phase resolution). It reads `input.state` but never mutates
 * it and never performs the void moves itself — it only describes the outcome
 * and the edits that would commit it. Lanes `F0`→`F3` are resolved in order.
 */
export function resolveJudgment(input: JudgmentInput): JudgmentProposal {
  const { state, activeSide } = input;
  const supportContribution = input.supportContribution;
  const opposingSide: BattleSide = activeSide === "player" ? "enemy" : "player";

  const lanes: BattleLaneJudgment[] = [];
  const dissolvedBattleCardIds: { battleCardId: string; side: BattleSide }[] = [];
  let totalScored = 0;

  for (const slotId of FRONT_RANK_SLOT_IDS) {
    const lane = resolveLane({
      state,
      slotId,
      activeSide,
      opposingSide,
      supportContribution,
      dissolvedBattleCardIds,
    });
    lanes.push(lane.judgment);
    totalScored += lane.scored;
  }

  // The active side scores all points; the active side's lane-score delta maps
  // onto the player/enemy delta fields used by `BattleJudgmentResolution`.
  const resolution: BattleJudgmentResolution = {
    lanes,
    playerScoreDelta: activeSide === "player" ? totalScored : 0,
    enemyScoreDelta: activeSide === "enemy" ? totalScored : 0,
  };

  const edits: BattleDebugEdit[] = [];
  if (totalScored > 0) {
    edits.push({ kind: "ADJUST_SCORE", side: activeSide, amount: totalScored });
  }
  for (const dissolved of dissolvedBattleCardIds) {
    edits.push({
      kind: "MOVE_CARD_TO_ZONE",
      battleCardId: dissolved.battleCardId,
      destination: { side: dissolved.side, zone: "void" },
    });
  }

  return { resolution, edits };
}

interface LaneResolution {
  judgment: BattleLaneJudgment;
  scored: number;
}

function resolveLane(params: {
  state: BattleMutableState;
  slotId: FrontRankSlotId;
  activeSide: BattleSide;
  opposingSide: BattleSide;
  supportContribution: ReadonlyMap<string, number> | undefined;
  dissolvedBattleCardIds: { battleCardId: string; side: BattleSide }[];
}): LaneResolution {
  const {
    state,
    slotId,
    activeSide,
    opposingSide,
    supportContribution,
    dissolvedBattleCardIds,
  } = params;

  const challengerId = state.sides[activeSide].frontRank[slotId];
  const defenderId = state.sides[opposingSide].frontRank[slotId];
  const challenger =
    challengerId === null ? null : state.cardInstances[challengerId] ?? null;
  const defender =
    defenderId === null ? null : state.cardInstances[defenderId] ?? null;

  const challengerSpark =
    challenger === null
      ? 0
      : effectiveSpark(challenger, challengerId, supportContribution);
  const defenderSpark =
    defender === null
      ? 0
      : effectiveSpark(defender, defenderId, supportContribution);

  // `playerSpark`/`enemySpark` always describe the actual side in that lane.
  const playerSpark = activeSide === "player" ? challengerSpark : defenderSpark;
  const enemySpark = activeSide === "player" ? defenderSpark : challengerSpark;

  const emptyJudgment = (winner: BattleSide | null): BattleLaneJudgment => ({
    slotId,
    playerSpark,
    enemySpark,
    winner,
    scoreDelta: 0,
  });

  // Only the opposing defender present: nothing happens in this lane.
  if (challenger === null && defender !== null) {
    return { judgment: emptyJudgment(null), scored: 0 };
  }

  // No challenger and no defender: empty lane.
  if (challenger === null || challengerId === null) {
    return { judgment: emptyJudgment(null), scored: 0 };
  }

  // Unpaired challenger: scores its effective spark for the active side.
  if (defender === null) {
    return {
      judgment: {
        slotId,
        playerSpark,
        enemySpark,
        winner: null,
        scoreDelta: challengerSpark,
      },
      scored: challengerSpark,
    };
  }

  // Both present: resolve the spark comparison (rules §Challenge phase
  // resolution). A defended challenger does not score.
  const challengerDissolves = doesDissolve(
    challenger,
    challengerSpark,
    defenderSpark,
  );
  const defenderDissolves = doesDissolve(defender, defenderSpark, challengerSpark);

  if (challengerDissolves && challengerId !== null) {
    dissolvedBattleCardIds.push({ battleCardId: challengerId, side: activeSide });
  }
  if (defenderDissolves && defenderId !== null) {
    dissolvedBattleCardIds.push({ battleCardId: defenderId, side: opposingSide });
  }

  // `winner` is the side whose character survives a resolved pairing, or null
  // when both dissolve (a tie) — there is no defeated opponent to name.
  let winner: BattleSide | null = null;
  if (defenderDissolves && !challengerDissolves) {
    winner = activeSide;
  } else if (challengerDissolves && !defenderDissolves) {
    winner = opposingSide;
  }

  return { judgment: emptyJudgment(winner), scored: 0 };
}

/**
 * Effective spark for an instance = its base effective spark plus any
 * support/static contribution targeted at its battleCardId.
 */
function effectiveSpark(
  instance: BattleCardInstance,
  battleCardId: string | null,
  supportContribution: ReadonlyMap<string, number> | undefined,
): number {
  const base = selectEffectiveSparkForInstance(instance);
  const bonus =
    battleCardId === null ? 0 : supportContribution?.get(battleCardId) ?? 0;
  return base + bonus;
}

/**
 * Whether `instance` dissolves against `opposingSpark`. A non-figment dissolves
 * when its spark is at most the opposing spark (lower or tied). For a figment
 * stack, use the top-down loss count (rules §Figments): for this prototype the
 * whole instance dissolves when that count covers its figment count, otherwise
 * it stays in place (stacks are not split).
 */
function doesDissolve(
  instance: BattleCardInstance,
  instanceSpark: number,
  opposingSpark: number,
): boolean {
  if (isFigmentInstance(instance)) {
    const lossCount = selectFigmentChallengeLossCount(instance, opposingSpark);
    return lossCount >= selectFigmentCount(instance);
  }
  return instanceSpark <= opposingSpark;
}
