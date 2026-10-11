import type { EngineCatalog } from "../catalog";
import type { EngineEvent } from "../events";
import type { Answer, AnswerFor, Prompt, PromptFingerprint, PromptSpec } from "../prompts/types";
import type { BattleState } from "../state/types";
import type { InstanceId, Side } from "../state/ids";
import type { Step } from "./kinds";

/**
 * Receives an emitted event, for presentation. `snapshot` copies the state at
 * the event, detached from the step's work state; it is valid only during the
 * call, so an observer copies only the events it keeps.
 */
export type EventObserver = (event: EngineEvent, snapshot: () => BattleState) => void;

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

/** Cards a step showed to one side alone (`StepContext.disclose`). */
export interface Disclosure {
  readonly side: Side;
  readonly cards: readonly InstanceId[];
}

/**
 * What rules code sees while a step runs. `state` is the step's private work
 * copy; rules code mutates it directly through the primitives.
 */
export interface StepContext {
  readonly state: BattleState;
  readonly catalog: EngineCatalog;
  /** Optional presentation observation, forwarded by nested step replay. */
  readonly observeEvent?: EventObserver;
  /** Raises a prompt and returns its answer, synchronously. */
  choose<P extends Prompt>(prompt: PromptSpec<P>): AnswerFor<P>;
  /** Marks the point after which this step can no longer be cancelled. */
  commitPoint(): void;
  /**
   * Shows `cards` to `side` alone (`showPrivately`, view/knowledge.ts) and
   * records the disclosure: once a prompt of the step is published, the
   * fold keeps it even if the step later fails (engine-design § Decisions
   * and prompts). A `privateTo` prompt discloses its cards as it opens.
   */
  disclose(side: Side, cards: readonly InstanceId[]): void;
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
  /**
   * The step makes its play-time choices before `ctx.commitPoint()`: legality
   * searches their answer paths, and a real run offers only answers with a
   * feasible continuation (steps/feasibility.ts).
   */
  readonly hasCommitPoint?: true;
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
      /** What the step showed one side alone before it suspended, in order. */
      readonly disclosed: readonly Disclosure[];
    };
