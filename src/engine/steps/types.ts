import type { EngineCatalog } from "../catalog";
import type { EngineEvent } from "../events";
import type { Answer, AnswerFor, Prompt, PromptFingerprint, PromptSpec } from "../prompts/types";
import type { BattleState } from "../state/types";
import type { Side } from "../state/ids";
import type { Step } from "./kinds";

/** Supplies answers to prompts that have no recorded answer. May throw `Suspend`. */
export interface AnswerSource {
  answer(prompt: Prompt, work: BattleState): Answer;
}

/** One answer given during a step, with the fingerprint of the prompt it answered. */
export interface RecordedAnswer {
  readonly fingerprint: PromptFingerprint;
  readonly value: Answer;
  /** Answered automatically because it was the only legal answer. */
  readonly auto?: true;
}

/**
 * What rules code sees while a step runs. `state` is the step's private work
 * copy; rules code mutates it directly through the primitives.
 */
export interface StepContext {
  readonly state: BattleState;
  readonly catalog: EngineCatalog;
  /** Raises a prompt and returns its answer, synchronously. */
  choose<P extends Prompt>(prompt: PromptSpec<P>): AnswerFor<P>;
  /** Marks the point after which this step can no longer be cancelled. */
  commitPoint(): void;
  /** Records an event; triggered abilities it matches join the trigger queue. */
  emit(event: EngineEvent): void;
  /** A uniform draw in `[0, 1)` from the named stream. */
  random(stream: string): number;
  /**
   * Adopts the outcome of steps run inside this one, as a loop iteration
   * runs its recorded steps: `state`, derived from the work state by those
   * steps, replaces it, and their events, already matched against triggered
   * abilities, are appended.
   */
  adopt(state: BattleState, events: readonly EngineEvent[]): void;
}

/** Registry entry for one step kind. */
export interface StepDefinition<S extends Step> {
  readonly kind: S["kind"];
  /**
   * The side that may cancel this step before its commit point, or `null`
   * when the step cannot be cancelled. Only a side's own play or activation
   * can be.
   */
  canceller(state: BattleState, step: S): Side | null;
  run(ctx: StepContext, step: S): void;
}

export type StepResult =
  | {
      readonly kind: "done";
      readonly state: BattleState;
      readonly events: readonly EngineEvent[];
      readonly answers: readonly RecordedAnswer[];
    }
  | {
      readonly kind: "suspended";
      readonly prompt: Prompt;
      /** The intermediate state when the step suspended. */
      readonly display: BattleState;
      readonly events: readonly EngineEvent[];
      readonly answers: readonly RecordedAnswer[];
    };
