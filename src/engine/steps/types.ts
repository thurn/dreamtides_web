import type { EngineCatalog } from "../catalog";
import type { EngineEvent } from "../events";
import type { Answer, AnswerFor, Prompt, PromptFingerprint, PromptSpec } from "../prompts/types";
import type { AbilityOrigin, BattleState, FloatingEffect } from "../state/types";
import type { EffectId, AbilitySource, InstanceId, OncePerTurnKey, Side, Zone } from "../state/ids";
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

/** A source whose triggered abilities match an event: an emblem, or a card in play or another zone. */
export interface TriggerListener {
  readonly source: AbilitySource;
  /** The side whose ability it is, which controls what it triggers. */
  readonly controller: Side;
  readonly origin: AbilityOrigin;
  /** The source's zone; an emblem counts as in play. */
  readonly zone: Zone;
  readonly emblem: boolean;
}

/**
 * The events a departing character's look-back abilities wait for: its
 * `dissolved` ("when … is dissolved") and its `abandoned` ("when you abandon
 * …"). Each sees the character as it was in play.
 */
export type LookbackEventKind = "dissolved" | "abandoned";

/**
 * What stops a triggered ability from triggering, read at one moment: its
 * source's triggered abilities are disabled (`disabled`), or the ability is
 * "Once per turn" and already triggered this turn (`used`).
 */
export interface TriggerBlocks {
  readonly disabled: boolean;
  readonly used: boolean;
}

/**
 * A card or emblem ability armed for a look-back event: its source as it
 * was as the character left play, and what blocked the ability then, which
 * decide whether it triggers in place of the state once the character has
 * gone (rules § Disabled triggers, § Once per turn).
 */
export interface ArmedAbility {
  readonly listener: TriggerListener;
  readonly blocks: TriggerBlocks;
  /**
   * How many once-per-turn uses the step had recorded as it was armed
   * (`TriggerUses.oncePerTurn`): a use of its key recorded since, as it
   * triggered for the departure's other look-back event or by another
   * trigger, also blocks it.
   */
  readonly usesFrom: number;
}

/**
 * The limited triggers that triggered during a step, which abilities armed
 * for a look-back event read so that one departure's events trigger each at
 * most once: every once-per-turn use in order (`oncePerTurn`), recorded even
 * when its battle-state record is not (`BattleState.oncePerTurn`), and the
 * one-shot floating and delayed triggers that triggered (`once`), each ended
 * as it triggered though a look-back record may still hold it.
 */
export interface TriggerUses {
  readonly oncePerTurn: OncePerTurnKey[];
  readonly once: Set<EffectId>;
}

/**
 * The abilities a character's `leftPlay` armed for one of its look-back
 * events, each as it was then, for that event to fire (triggers/matcher.ts):
 * card and emblem abilities by source and index, with their sources as they
 * were, so a card's ability triggers for the side that controlled it then,
 * and with what blocked them then; and floating and delayed triggers, in
 * creation order, so one whose duration ended as the character left play
 * still triggers. `origin` is where the character's own abilities came from
 * as it left play, abilities it gained included, which its own abilities
 * are read from as the event fires.
 */
export interface ArmedTriggers {
  readonly abandonedNamed?: import("../state/types").AbandonedNamedBinding;
  /** Live queued readers confirmed within this departure's work step, never persisted indices. */
  readonly namedReaders?: import("../state/types").AbandonedNamedBinding[];
  readonly abilities: ReadonlyMap<OncePerTurnKey, ArmedAbility>;
  readonly floating: readonly FloatingEffect[];
  readonly origin: AbilityOrigin | null;
  /** The departing subject’s copiable cost before it leaves play. */
  readonly subjectCost?: number;
  /** Public effective spark immediately before the subject leaves play. */
  readonly subjectSpark?: number;
}

/**
 * What rules code sees while a step runs. `state` is the step's private work
 * copy; rules code mutates it directly through the primitives.
 */
export interface StepContext {
  readonly state: BattleState;
  readonly catalog: EngineCatalog;
  /** Events already emitted by this private step, in causal order; replay reconstructs them. */
  readonly events: readonly EngineEvent[];
  /** Optional presentation observation, forwarded by nested step replay. */
  readonly observeEvent?: EventObserver;
  /**
   * Raises a prompt and returns its answer. A final card-cost caller may prove
   * every field-legal answer payable when the next operation is the commit
   * point; validation, cancellation, replay and guard memo checks still apply.
   */
  choose<P extends Prompt>(prompt: PromptSpec<P>, proof?: { readonly allAnswersPayable: true }): AnswerFor<P>;
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
  /**
   * Runs `run` while `settle` keeps knowledge current as cards move: it runs
   * before each event `run` emits is observed or matched, before each prompt
   * `run` raises, and once more after `run` returns, so no presented state
   * shows knowledge the moves so far have made stale
   * (`randomDeckRemovalSettler`, view/knowledge.ts).
   */
  settlingKnowledge(settle: () => void, run: () => void): void;
  /**
   * The trigger matcher's step-local record of armed look-back abilities, by
   * event kind and departing character. A dissolve or an abandon emits
   * `leftPlay`, `abandoned`, and `dissolved` within one call with no prompt
   * between them, so the record never needs to outlive the step and is
   * never battle state.
   */
  readonly armedTriggers: { readonly [K in LookbackEventKind]: Map<InstanceId, ArmedTriggers> };
  /** The trigger matcher's step-local record of limited triggers that triggered, for the same reason never battle state. */
  readonly triggerUses: TriggerUses;
  /** Effective spark captured before each source leaves play in this step; replay rebuilds it. */
  readonly departedSourceSpark: Map<InstanceId, number>;
  /** Source visits and acquired ability occurrences before this step's departures. */
  readonly departedSourceObjects: Map<InstanceId, { readonly enteredPlayAt: number; readonly gained: readonly EffectId[] }>;
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
