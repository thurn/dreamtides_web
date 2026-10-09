import { conditionHolds } from "../effects/interpreter";
import type { EngineEvent } from "../events";
import type { AbilitySource, Side } from "../state/ids";
import { SIDES } from "../state/ids";
import type { BattleResult, BattleState, WinReason } from "../state/types";
import type { EngineCatalog } from "../catalog";
import type { StepContext } from "../steps/types";
import { abilityOrigin, abilitySources, originAbilities } from "./activation";

export function endBattle(ctx: StepContext, result: BattleResult): void {
  if (ctx.state.result !== null) {
    return;
  }
  ctx.state.result = result;
  ctx.state.priority = null;
  ctx.emit({ kind: "battleEnded", result });
}

/**
 * The sources `side` controls whose "you win the game" condition holds now
 * (C15): its emblems and its characters in play, in `abilitySources` order.
 * Cards in any other zone have no such ability in effect.
 */
export function winConditionSources(state: BattleState, catalog: EngineCatalog, side: Side): AbilitySource[] {
  return abilitySources(state, side).filter((source) => {
    const origin = abilityOrigin(state, source);
    return (
      origin !== null &&
      originAbilities(catalog, origin).some(
        (ability) =>
          ability.kind === "winCondition" &&
          conditionHolds(state, catalog, ability.condition, { controller: side, source, optionalPaid: [] }),
      )
    );
  });
}

/**
 * The state-based victory check, run after every completed step (P5) with
 * the step's events. A side wins when its score is at or above the
 * threshold, when it controls a card in play or an emblem whose "you win
 * the game" condition holds, or when a `winTheGame` effect it controlled
 * resolved during the step (C15). Both sides winning in the same check is a
 * draw. Each side whose in-play win condition holds gets a
 * `winConditionMet` event naming the sources, before `battleEnded`.
 */
export function checkVictory(ctx: StepContext, events: readonly EngineEvent[]): void {
  const { state } = ctx;
  if (state.result !== null) {
    return;
  }
  const resolved = new Set(events.flatMap((event) => (event.kind === "winConditionMet" ? [event.side] : [])));
  const target = state.config.scoreToWin;
  const wins: { readonly side: Side; readonly reason: WinReason }[] = [];
  for (const side of SIDES) {
    const sources = winConditionSources(state, ctx.catalog, side);
    if (sources.length > 0) {
      ctx.emit({ kind: "winConditionMet", side, sources });
    }
    if (state.sides[side].score >= target) {
      wins.push({ side, reason: "score" });
    } else if (sources.length > 0 || resolved.has(side)) {
      wins.push({ side, reason: "winCondition" });
    }
  }
  const [first, second] = wins;
  if (first === undefined) {
    return;
  }
  if (second !== undefined) {
    const reason = first.reason === "score" && second.reason === "score" ? "score" : "winCondition";
    endBattle(ctx, { kind: "draw", reason });
  } else {
    endBattle(ctx, { kind: "victory", winner: first.side, reason: first.reason });
  }
}
