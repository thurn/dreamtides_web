import {
  type ChallengeInput,
  resolveChallenge,
} from "./challenge";
import type { BattleDebugEdit } from "../debug/commands";
import type { BattleJudgmentResolution } from "../types";

/**
 * Input to {@link resolveJudgment}, identical to {@link ChallengeInput}: the
 * board state, the active side, and an optional support map. Judgment is the
 * AI-facing name for the same Challenge resolution.
 */
export type JudgmentInput = ChallengeInput;

export interface JudgmentProposal {
  resolution: BattleJudgmentResolution;
  /** ADJUST_SCORE + MOVE_CARD_TO_ZONE(void) edits to commit the outcome. */
  edits: BattleDebugEdit[];
}

/**
 * Resolves the Challenge phase for one active side as a pure proposal, by
 * delegating to the unified, keyword-aware {@link resolveChallenge} (rules
 * §Challenge phase resolution). It reads `input.state` but never mutates it and
 * never performs the void moves itself — it only describes the outcome and the
 * edits that would commit it.
 *
 * This adapter exists so AI call sites keep their `JudgmentProposal` contract
 * (a {@link BattleJudgmentResolution} plus the committing edits) while the actual
 * resolution — spark comparison, the four combat keywords, figment dissolution —
 * lives in `challenge.ts`, the single source of truth. The adaptation is a
 * straight projection: `ChallengeResolution.lanes` and its `player`/`enemy`
 * score deltas are the `BattleJudgmentResolution`, and `ChallengeResolution.edits`
 * are the proposal edits. Because the resolver is keyword-aware, a surviving
 * Unstoppable defender now scores for the opposing side and is reflected in the
 * `enemyScoreDelta`/`playerScoreDelta` and in an ADJUST_SCORE edit for that side.
 */
export function resolveJudgment(input: JudgmentInput): JudgmentProposal {
  const challenge = resolveChallenge(input);
  const resolution: BattleJudgmentResolution = {
    lanes: challenge.lanes,
    playerScoreDelta: challenge.playerScoreDelta,
    enemyScoreDelta: challenge.enemyScoreDelta,
  };
  return { resolution, edits: challenge.edits };
}
