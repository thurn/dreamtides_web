import type { BattleResult } from "../state/types";
import type { StepContext } from "../steps/types";

export function endBattle(ctx: StepContext, result: BattleResult): void {
  if (ctx.state.result !== null) {
    return;
  }
  ctx.state.result = result;
  ctx.state.priority = null;
  ctx.emit({ kind: "battleEnded", result });
}

/**
 * The state-based victory check, run after every step (P5): a side at or
 * above the threshold wins, and both at once is a draw.
 */
export function checkVictory(ctx: StepContext): void {
  const { state } = ctx;
  if (state.result !== null) {
    return;
  }
  const target = state.config.scoreToWin;
  const player = state.sides.player.score >= target;
  const enemy = state.sides.enemy.score >= target;
  if (player && enemy) {
    endBattle(ctx, { kind: "draw", reason: "score" });
  } else if (player) {
    endBattle(ctx, { kind: "victory", winner: "player", reason: "score" });
  } else if (enemy) {
    endBattle(ctx, { kind: "victory", winner: "enemy", reason: "score" });
  }
}
