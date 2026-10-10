/**
 * The policy interface (engine-design § Policy interface): a policy decides
 * one decision of one side from that side's view. It never reads the battle
 * state, so it never sees hidden information; Greedy searches determinized
 * states sampled from the view and both decklists (D22).
 */
import type { Engine } from "../engine";
import type { Answer, Prompt } from "../prompts/types";
import type { Action, Decision } from "../rules/actions";
import type { Side } from "../state/ids";
import type { Decklists } from "../view/determinize";
import type { BattleView } from "../view/view";
import type { PolicyRandom } from "./random";

/** The policies the AI host can run. */
export type PolicyId = "random" | "greedy";

export const POLICY_IDS: readonly PolicyId[] = ["random", "greedy"];

/** The decision a policy answers: a top-level decision with its legal actions, or a prompt. */
export type PolicyDecision =
  | { readonly kind: "topLevel"; readonly decision: Decision; readonly legal: readonly Action[] }
  | { readonly kind: "prompt"; readonly prompt: Prompt };

/** A policy's answer: an action for a top-level decision, an answer for a prompt. */
export type PolicyChoice =
  | { readonly kind: "action"; readonly action: Action }
  | { readonly kind: "answer"; readonly value: Answer };

/**
 * A thinking budget (D23). Search is anytime: it stops at whichever limit
 * comes first. Live play sets a wall-clock cap; tests and tournaments count
 * iterations only, so their decisions are deterministic.
 */
export interface PolicyBudget {
  readonly iterations: number;
  readonly wallClockMs?: number;
}

/** One candidate a policy weighed, for the decision's log line. */
export interface PolicyCandidate {
  readonly choice: PolicyChoice;
  readonly score: number;
  /** Simulations that scored it (MCTS visits in Phase 7 policies). */
  readonly visits: number;
}

/** What a policy reports about one decision: one compact log line (workflow § Logging → AI). */
export interface PolicyTrace {
  readonly policy: PolicyId;
  readonly budget: PolicyBudget;
  /** Iterations spent and elapsed wall-clock milliseconds. */
  readonly used: { readonly iterations: number; readonly ms: number };
  readonly determinizations: number;
  /** The best candidates, highest score first. */
  readonly candidates: readonly PolicyCandidate[];
  readonly chosen: PolicyChoice;
  /** Why a prompt was declined without weighing it: the optional-chain bound. */
  readonly declined?: "optionalChain";
}

export interface PolicyContext {
  /** Simulates and determinizes; never handed the battle's state. */
  readonly engine: Engine;
  readonly side: Side;
  /** The policy-private stream; never the battle's RNG. */
  readonly random: PolicyRandom;
  readonly budget: PolicyBudget;
  readonly decklists: Decklists;
  /** A millisecond clock for the wall-clock cap. */
  readonly now: () => number;
}

export interface Policy {
  readonly id: PolicyId;
  decide(view: BattleView, decision: PolicyDecision, ctx: PolicyContext): PolicyResult;
}

export interface PolicyResult {
  readonly choice: PolicyChoice;
  readonly trace: PolicyTrace;
}
