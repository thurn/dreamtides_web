/**
 * The Greedy policy: a one-ply search. For a top-level decision it samples
 * determinizations of its view (D22), applies each legal action to each,
 * resolves the stack with both sides passing, and scores the result with a
 * simple evaluation: score difference, board spark, cards in hand, and
 * energy. The action with the best mean score wins. Prompts are answered
 * with the prompt heuristic (`greedyAnswer`), live and in simulation.
 */
import { AI } from "../../content/ai";
import type { Engine } from "../engine";
import type { Prompt } from "../prompts/types";
import type { Action } from "../rules/actions";
import { opponent, type Side } from "../state/ids";
import type { BattleState } from "../state/types";
import { InlineSource } from "../steps/sources";
import type { BattleView, SideView } from "../view/view";
import { greedyAnswer, optionalChainSpent, stateCardInfo, viewCardInfo } from "./prompts";
import type { Policy, PolicyCandidate, PolicyChoice, PolicyContext, PolicyDecision, PolicyResult } from "./types";

const GREEDY = AI.enginePolicy.greedy;

function boardSpark(view: BattleView, side: SideView): number {
  let total = 0;
  for (const id of [...side.frontRank, ...side.backRank]) {
    if (id !== null) total += view.instances[id]?.characteristics.spark ?? 0;
  }
  return total;
}

/** Greedy's evaluation of a position from `side`'s view of it: higher is better for `side`. */
export function evaluatePosition(view: BattleView, side: Side): number {
  const weights = GREEDY.evaluation;
  const { result } = view;
  if (result !== null) {
    return result.kind === "draw" ? 0 : result.winner === side ? weights.victory : -weights.victory;
  }
  const mine = view.sides[side];
  const theirs = view.sides[opponent(side)];
  return (
    weights.scoreDifference * (mine.score - theirs.score) +
    weights.boardSpark * (boardSpark(view, mine) - boardSpark(view, theirs)) +
    weights.handCard * (mine.hand.count - theirs.hand.count) +
    weights.energy * (mine.currentEnergy - theirs.currentEnergy)
  );
}

/** Both sides answer simulated prompts with the prompt heuristic, over the step's own work state. */
function simulationSource(engine: Engine): InlineSource {
  const answer = (prompt: Prompt, work: BattleState) =>
    greedyAnswer(prompt, stateCardInfo(work, engine.catalog, prompt.side), work.automaticChoices);
  return new InlineSource({ player: answer, enemy: answer });
}

/**
 * The score of `action` in the determinized `state`: the action applied,
 * then the stack resolved with both sides passing. `null` when the action
 * is not legal in this sample or the simulation fails.
 */
function simulate(engine: Engine, state: BattleState, side: Side, action: Action): number | null {
  const source = simulationSource(engine);
  try {
    let current = engine.apply(state, side, action, source).state;
    for (let passes = 0; passes < GREEDY.stackPassLimit && current.result === null; passes++) {
      const next = engine.decision(current);
      if (next?.kind !== "respond") break;
      current = engine.apply(current, next.side, { kind: "pass" }, source).state;
    }
    return evaluatePosition(engine.view(current, side), side);
  } catch {
    return null;
  }
}

/** Pass first, so a budget that ends early has still weighed doing nothing. */
function candidateOrder(legal: readonly Action[]): Action[] {
  return [...legal.filter((action) => action.kind === "pass"), ...legal.filter((action) => action.kind !== "pass")];
}

function decideTopLevel(view: BattleView, legal: readonly Action[], ctx: PolicyContext, started: number): PolicyResult {
  const candidates = candidateOrder(legal);
  const totals = candidates.map(() => ({ score: 0, visits: 0 }));
  const deadline = ctx.budget.wallClockMs === undefined ? Infinity : started + ctx.budget.wallClockMs;
  let iterations = 0;
  let determinizations = 0;
  if (candidates.length > 1) {
    sampling: for (let sample = 0; sample < GREEDY.determinizations; sample++) {
      if (iterations >= ctx.budget.iterations || ctx.now() >= deadline) break;
      const state = ctx.engine.determinize(view, ctx.decklists, () => ctx.random.next());
      determinizations += 1;
      for (const [index, action] of candidates.entries()) {
        if (iterations >= ctx.budget.iterations || ctx.now() >= deadline) break sampling;
        iterations += 1;
        const score = simulate(ctx.engine, state, ctx.side, action);
        const total = totals[index];
        if (score !== null && total !== undefined) {
          total.score += score;
          total.visits += 1;
        }
      }
    }
  }
  const scored: PolicyCandidate[] = candidates.flatMap((action, index) => {
    const total = totals[index];
    return total === undefined || total.visits === 0
      ? []
      : [{ choice: { kind: "action" as const, action }, score: total.score / total.visits, visits: total.visits }];
  });
  // Stable: the earlier candidate wins a tie.
  const ranked = [...scored].sort((a, b) => b.score - a.score);
  const fallback = candidates[0] ?? ({ kind: "pass" } as const);
  const chosen: PolicyChoice = ranked[0]?.choice ?? { kind: "action", action: fallback };
  return {
    choice: chosen,
    trace: {
      policy: "greedy",
      budget: ctx.budget,
      used: { iterations, ms: ctx.now() - started },
      determinizations,
      candidates: ranked.slice(0, GREEDY.traceTopK),
      chosen,
    },
  };
}

export const GREEDY_POLICY: Policy = {
  id: "greedy",
  decide(view: BattleView, decision: PolicyDecision, ctx: PolicyContext): PolicyResult {
    const started = ctx.now();
    if (decision.kind === "topLevel") return decideTopLevel(view, decision.legal, ctx, started);
    const chosen: PolicyChoice = {
      kind: "answer",
      value: greedyAnswer(decision.prompt, viewCardInfo(view, ctx.side), view.automaticChoices),
    };
    return {
      choice: chosen,
      trace: {
        policy: "greedy",
        budget: ctx.budget,
        used: { iterations: 0, ms: ctx.now() - started },
        determinizations: 0,
        candidates: [],
        chosen,
        ...(optionalChainSpent(view.automaticChoices) ? { declined: "optionalChain" as const } : {}),
      },
    };
  },
};
