/**
 * One AI decision as plain data (`PolicyRequest`), built from a battle slice
 * on the main thread and answered by a policy in the worker or inline. The
 * request carries only the deciding side's view, its decision, both dealt
 * decklists, and a seed, so the answer never depends on hidden information
 * and the same request always gets the same answer (under an iteration
 * budget).
 */
import { AI } from "../../content/ai";
import type { Engine } from "../engine";
import type { BattleSlice, PendingPrompt } from "../fold/slice";
import type { PromptId } from "../prompts/types";
import { battleSeed, type BattleSeed, type Side } from "../state/ids";
import { dealtDeck } from "../state/create";
import type { BattleInit } from "../state/types";
import type { Decklists } from "../view/determinize";
import { promptView, type BattleView } from "../view/view";
import { GREEDY_POLICY } from "./greedy";
import { PolicyRandom, RANDOM_POLICY } from "./random";
import type { Policy, PolicyBudget, PolicyChoice, PolicyDecision, PolicyId, PolicyResult } from "./types";

export const POLICIES: Readonly<Record<PolicyId, Policy>> = { random: RANDOM_POLICY, greedy: GREEDY_POLICY };

/**
 * Names one decision of a battle: a pending prompt's id
 * (`<version>:<attempt>:<answers>`), or `<version>:<attempt>:decision` for a
 * top-level decision. A decision taken, answered, or cancelled never comes
 * back under the same key.
 */
export type DecisionKey = PromptId | `${number}:${number}:decision`;

/** Which D23 budget a decision gets. */
export type BudgetKind = keyof typeof AI.enginePolicy.budgets;

export interface PolicyRequest {
  readonly policy: PolicyId;
  readonly side: Side;
  readonly key: DecisionKey;
  readonly view: BattleView;
  readonly decision: PolicyDecision;
  readonly decklists: Decklists;
  /** The policy's stream seed: the battle seed, the side, and the decision key. */
  readonly seed: BattleSeed;
  readonly budget: PolicyBudget;
}

/** A side's pending decision: the request for its policy, or the forced choice that needs none. */
export interface AiDecision {
  readonly request: PolicyRequest;
  /** The only legal action, taken at once (D23: forced decisions are instant). */
  readonly forced: PolicyChoice | null;
}

export interface AiDecisionInput {
  readonly engine: Engine;
  readonly init: BattleInit;
  readonly slice: BattleSlice;
  /** The prompt the in-flight step is suspended on, if any. */
  readonly pending: PendingPrompt | null;
  readonly side: Side;
  readonly policy: PolicyId;
  /** Iteration-only budgets for deterministic hosts; live play uses the D23 budgets. */
  readonly budgets?: Readonly<Record<BudgetKind, PolicyBudget>>;
}

/** Both sides' decks as the battle dealt them: the decklists determinization reads. */
export function battleDecklists(init: BattleInit): Decklists {
  return { player: dealtDeck(init, "player"), enemy: dealtDeck(init, "enemy") };
}

/**
 * The decision `side` owes in `slice`, or `null` when the battle is over or
 * the pending decision or prompt is the other side's (or the in-flight
 * record no longer replays to a prompt).
 */
export function aiDecision(input: AiDecisionInput): AiDecision | null {
  const { engine, slice, pending, side } = input;
  const { committed } = slice;
  if (committed.result !== null) return null;
  const budgets = input.budgets ?? AI.enginePolicy.budgets;
  const base = { policy: input.policy, side, decklists: battleDecklists(input.init) };
  const seedOf = (key: DecisionKey): BattleSeed => battleSeed(`${input.init.seed}|ai|${side}|${key}`);
  if (slice.inFlight !== null) {
    if (pending === null || pending.prompt.side !== side) return null;
    const key: DecisionKey = pending.prompt.id;
    const { id: _id, ...prompt } = pending.prompt;
    return {
      request: {
        ...base,
        key,
        view: engine.view(pending.display, side),
        decision: { kind: "prompt", prompt: promptView(prompt, side, pending.display) },
        seed: seedOf(key),
        budget: budgets.response,
      },
      forced: null,
    };
  }
  const decision = engine.decision(committed);
  if (decision?.side !== side) return null;
  const legal = engine.legalActions(committed, side);
  const key: DecisionKey = `${committed.version}:${slice.attempt}:decision`;
  const planning = decision.kind === "main" && committed.turn.phase === "day" && committed.turn.active === side;
  const only = legal.length === 1 ? legal[0] : undefined;
  return {
    request: {
      ...base,
      key,
      view: engine.view(committed, side),
      decision: { kind: "topLevel", decision, legal },
      seed: seedOf(key),
      budget: planning ? budgets.turnPlanning : budgets.response,
    },
    forced: only === undefined ? null : { kind: "action", action: only },
  };
}

/** Runs the request's policy on `engine`. Pure apart from the clock. */
export function runPolicy(engine: Engine, request: PolicyRequest, now: () => number = () => 0): PolicyResult {
  return POLICIES[request.policy].decide(request.view, request.decision, {
    engine,
    side: request.side,
    random: new PolicyRandom(request.seed),
    budget: request.budget,
    decklists: request.decklists,
    now,
  });
}
