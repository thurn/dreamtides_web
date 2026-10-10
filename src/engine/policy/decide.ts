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
import { sidePending, type BattleSlice, type DecisionKey, type PendingPrompt } from "../fold/slice";
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

/**
 * A side's pending decision: the request for its policy, or the forced
 * choice that needs none. A prompt's decision carries the prompt id its
 * answer names.
 */
export type AiDecision =
  | {
      readonly kind: "topLevel";
      readonly request: PolicyRequest;
      /** The only legal action, taken at once (D23: forced decisions are instant). */
      readonly forced: PolicyChoice | null;
    }
  | { readonly kind: "prompt"; readonly promptId: PromptId; readonly request: PolicyRequest; readonly forced: null };

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
  const owed = sidePending(engine, slice, pending, side);
  switch (owed.kind) {
    case "prompt": {
      const { key, display } = owed;
      const { id: _id, ...prompt } = owed.prompt;
      return {
        kind: "prompt",
        promptId: owed.prompt.id,
        request: {
          ...base,
          key,
          view: engine.view(display, side),
          decision: { kind: "prompt", prompt: promptView(prompt, side, display) },
          seed: seedOf(key),
          budget: budgets.response,
        },
        forced: null,
      };
    }
    case "topLevel": {
      const { decision, legal, key } = owed;
      const planning = decision.kind === "main" && committed.turn.phase === "day" && committed.turn.active === side;
      const only = legal.length === 1 ? legal[0] : undefined;
      return {
        kind: "topLevel",
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
    case "none":
    case "waiting":
    case "unreplayable":
      return null;
  }
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
