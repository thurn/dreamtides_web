import type { EngineCatalog } from "../catalog";
import type { EngineEvent } from "../events";
import type { Answer, AnswerFor, Prompt } from "../prompts/types";
import type { BattleState } from "../state/types";
import type { Step } from "./kinds";

/** Supplies prompt answers to a running step. */
export interface AnswerSource {
  answer(prompt: Prompt, work: BattleState): Answer;
}

/**
 * What rules code sees while a step runs. `state` is the step's private work
 * copy; rules code mutates it directly through the primitives.
 */
export interface StepContext {
  readonly state: BattleState;
  readonly catalog: EngineCatalog;
  /** Raises a prompt and returns its answer, synchronously. */
  choose<P extends Prompt>(prompt: P): AnswerFor<P>;
  /** Marks the point after which this step can no longer be cancelled. */
  commitPoint(): void;
  emit(event: EngineEvent): void;
  /** A uniform draw in `[0, 1)` from the named stream. */
  random(stream: string): number;
}

/** Registry entry for one step kind. */
export interface StepDefinition<S extends Step> {
  readonly kind: S["kind"];
  run(ctx: StepContext, step: S): void;
}

export interface StepResult {
  readonly state: BattleState;
  readonly events: readonly EngineEvent[];
}
