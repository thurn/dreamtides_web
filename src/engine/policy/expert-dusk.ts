/**
 * The Expert's Dusk assignment (phase-7-ai § 7.3): the defending side
 * chooses its blockers by searching its legal layouts exactly rather than
 * pairing characters by spark. Layouts are reached through the engine's own
 * legal reposition actions, so swaps, figment merges and the exhausted
 * rule hold as they do in play. Each layout is scored by playing the rest
 * of the turn's challenge with both sides passing and handing the result
 * to the injected position evaluation, so Support, anthems and every other
 * continuous effect, and the challenge's dissolutions and points, count as
 * the engine computes them. Layouts are explored nearest first, so the
 * chosen layout is the best one with the fewest repositions; the search is
 * exhaustive whenever its budget covers every layout it can reach.
 *
 * Only repositions that can change the challenge are searched: into a lane
 * opposite a challenger, into a back-rank slot supporting such a lane, or
 * out of the way to the first open back-rank slot. A move elsewhere neither
 * blocks nor supports a blocker.
 */
import { AI } from "../../content/ai";
import type { Engine } from "../engine";
import type { Prompt } from "../prompts/types";
import type { Action } from "../rules/actions";
import { opponent, type Side, type Slot } from "../state/ids";
import type { BattleState } from "../state/types";
import { InlineSource } from "../steps/sources";
import type { ExpertContext } from "./expert-contracts";
import { greedyAnswer, stateCardInfo, stateDiscoverCosts, stateSubtypeCounts } from "./prompts";

/** The Dusk decision: the first reposition toward the best layout, or `pass` to keep the current one. */
export interface DuskPlan {
  readonly action: Action;
  /** Every reposition toward the best layout, in order; empty to keep the current layout. */
  readonly moves: readonly Action[];
  /** The evaluation of the best layout after the turn's challenge. */
  readonly value: number;
  /** Distinct layouts scored. */
  readonly layouts: number;
  /** Whether every reachable layout was scored within the budget. */
  readonly exhaustive: boolean;
}

/** Both sides answer simulated prompts with the prompt heuristic, over the step's own work state. */
function simulationSource(engine: Engine): InlineSource {
  const answer = (prompt: Prompt, work: BattleState) =>
    greedyAnswer(prompt, stateCardInfo(work, engine.catalog, prompt.side), stateDiscoverCosts(work, engine.catalog), work.automaticChoices, stateSubtypeCounts(work, engine.catalog));
  return new InlineSource({ player: answer, enemy: answer });
}

function layoutOf(state: BattleState, side: Side): string {
  const { frontRank, backRank } = state.sides[side];
  return JSON.stringify([frontRank, backRank]);
}

/** The lanes opposite a designated challenger still in the attacker's front rank. */
function challengedLanes(state: BattleState, attacker: Side): number[] {
  const challengers = state.challenge?.challengers ?? [];
  return state.sides[attacker].frontRank.flatMap((id, lane) => (id !== null && challengers.includes(id) ? [lane] : []));
}

/** Whether a reposition can change the challenge: into a challenged lane or its support, or to the first open back-rank slot. */
function relevant(state: BattleState, side: Side, lanes: readonly number[], to: Slot): boolean {
  if (to.rank === "front") return lanes.includes(to.index);
  if (lanes.some((lane) => to.index === lane || to.index === lane + 1)) return true;
  return to.index === state.sides[side].backRank.indexOf(null);
}

function sameTurn(state: BattleState, start: BattleState): boolean {
  return state.turn.turnNumber === start.turn.turnNumber && state.turn.active === start.turn.active;
}

/**
 * The value of a layout for `side`: Dusk ended, then every decision passed
 * until the turn's challenge is over. `null` when the challenge does not
 * finish within the pass limit or the simulation fails.
 */
function scoreLayout(engine: Engine, ctx: ExpertContext, layout: BattleState, source: InlineSource): number | null {
  try {
    let current = engine.apply(layout, ctx.side, { kind: "pass" }, source).state;
    for (let passes = 0; current.result === null && sameTurn(current, layout) && current.turn.phase !== "ending"; passes++) {
      const decision = engine.decision(current);
      if (decision === null || passes >= AI.enginePolicy.greedy.stackPassLimit) return null;
      current = engine.apply(current, decision.side, { kind: "pass" }, source).state;
    }
    return ctx.evaluate(engine.view(current, ctx.side)).total;
  } catch {
    return null;
  }
}

/**
 * The Expert's plan for `ctx.side`'s Dusk decision in `state`, a
 * determinization of its view, scoring at most `budget` layouts. Call it
 * again after each reposition: the next decision is planned from the
 * position the reposition actually produced.
 */
export function planDusk(state: BattleState, ctx: ExpertContext, budget: number): DuskPlan {
  const { engine, side } = ctx;
  const decision = engine.decision(state);
  if (state.turn.phase !== "dusk" || decision?.kind !== "main" || decision.side !== side) throw new Error(`not ${side}'s Dusk decision`);
  const lanes = challengedLanes(state, opponent(side));
  const source = simulationSource(engine);
  const seen = new Set([layoutOf(state, side)]);
  const queue: { readonly state: BattleState; readonly moves: readonly Action[] }[] = [{ state, moves: [] }];
  let best: { readonly moves: readonly Action[]; readonly value: number } | null = null;
  let layouts = 0;
  let exhaustive = true;
  for (let next = 0; next < queue.length; next++) {
    if (layouts >= Math.max(1, budget)) {
      exhaustive = false;
      break;
    }
    const entry = queue[next];
    if (entry === undefined) break;
    layouts += 1;
    const value = scoreLayout(engine, ctx, entry.state, source);
    if (value !== null && (best === null || value > best.value)) best = { moves: entry.moves, value };
    for (const action of engine.legalActions(entry.state, side)) {
      if (action.kind !== "reposition" || !relevant(entry.state, side, lanes, action.to)) continue;
      let moved: BattleState;
      try {
        moved = engine.apply(entry.state, side, action, source).state;
      } catch {
        continue;
      }
      if (engine.decision(moved)?.side !== side || moved.turn.phase !== "dusk") continue;
      const layout = layoutOf(moved, side);
      if (seen.has(layout)) continue;
      seen.add(layout);
      queue.push({ state: moved, moves: [...entry.moves, action] });
    }
  }
  const moves = best?.moves ?? [];
  return { action: moves[0] ?? { kind: "pass" }, moves, value: best?.value ?? Number.NEGATIVE_INFINITY, layouts, exhaustive };
}
