import type { EngineCatalog } from "../catalog";
import { eventDefinition, type EngineEvent } from "../events";
import { forcedAnswer, hasLegalAnswer, isLegalAnswer } from "../prompts/answers";
import { matchesPromptFingerprint, promptFingerprint } from "../prompts/fingerprint";
import { isWellFormedPrompt, MalformedPrompt, promptCards } from "../prompts/structure";
import type { AnswerFor, Prompt, PromptFingerprint, PromptSpec } from "../prompts/types";
import type { EffectId, InstanceId, Side } from "../state/ids";
import { drawRandom } from "../state/rng";
import { cloneState } from "../state/clone";
import type { BattleState } from "../state/types";
import { matchEvent } from "../triggers/matcher";
import { continuouslyRevealedTops } from "../continuous/permissions";
import { SIDES } from "../state/ids";
import { identifies, rememberKnownCards, revealToBoth, showPrivately } from "../view/knowledge";
import { promptView, purposeView } from "../view/view";
import { EmptyPrompt, Feasible, IllegalAnswer, ReplayDivergence, UnrecordedPrompt } from "./errors";
import type { AnswerSource, ArmedTriggers, Disclosure, EventObserver, RecordedAnswer, StepContext, TriggerUses } from "./types";

export interface ContextOptions {
  /** Presentation observation; failures never change step execution. */
  readonly observeEvent?: EventObserver;
  /** Answers recorded by earlier runs of this step, replayed in order. */
  readonly prefix?: readonly RecordedAnswer[];
  /** The side that may cancel this step before its commit point. */
  readonly canceller?: Side | null;
  /** A legality dry run: the commit point throws `Feasible`. */
  readonly dryRun?: boolean;
  /** A loop replay: every prompt must be answered by `prefix`, else `UnrecordedPrompt` is thrown. */
  readonly replay?: boolean;
  /** The actor whose optional-loop history this step may extend. */
  readonly loopActor?: Side | null;
  /** Narrows each prompt raised before the commit point to the answers with a feasible continuation. */
  readonly guard?: PromptGuard;
  /** A play, activation, or opening setup reveals its changed top only on completion. */
  readonly deferDeckTopReveals?: boolean;
}

/**
 * Narrows the play-time prompts of a step with a commit point
 * (steps/feasibility.ts). `prefix` holds the answers given so far, each with
 * the fingerprint of the prompt as rules code raised it, before narrowing.
 */
export interface PromptGuard {
  narrow(prompt: Prompt, prefix: readonly RecordedAnswer[], allAnswersPayable?: true): Narrowed;
}

/** A narrowed prompt, and the answers it withholds only because the step's feasibility budget ran out. */
export interface Narrowed {
  readonly prompt: Prompt;
  /** Answers examined whose search ran out before settling them. */
  readonly unproven: number;
  /** Answers were left unexamined. */
  readonly truncated: boolean;
}

export class Context implements StepContext {
  readonly events: EngineEvent[] = [];
  readonly answers: RecordedAnswer[] = [];
  /** The side that gave each answer in `answers`. */
  readonly choosers: Side[] = [];
  /** Whether the loop actor saw each answered prompt whole when it opened. */
  readonly promptsVisibleToActor: boolean[] = [];
  /** `answers` with the fingerprint of each prompt as rules code raised it, before any narrowing. */
  readonly rawAnswers: RecordedAnswer[] = [];
  /** The cards shown to one side alone so far (`disclose`). */
  readonly disclosed: Disclosure[] = [];
  readonly armedTriggers = { dissolved: new Map<InstanceId, ArmedTriggers>(), abandoned: new Map<InstanceId, ArmedTriggers>() };
  readonly triggerUses: TriggerUses = { oncePerTurn: [], once: new Set() };
  readonly departedSourceSpark = new Map<InstanceId, number>();
  readonly departedSourceObjects = new Map<InstanceId, { readonly enteredPlayAt: number; readonly gained: readonly EffectId[] }>();
  committed = false;
  /** The knowledge settlers of the `settlingKnowledge` calls running now, outermost first. */
  private readonly settlers: (() => void)[] = [];
  private emitting = 0;
  /** Departures announce look-back while their old play object still exists. */
  private readonly leavingPlay = new Map<InstanceId, number>();
  private refreshingDeckTops = false;
  private deckTopRevealsDeferred: boolean;

  constructor(
    readonly state: BattleState,
    readonly catalog: EngineCatalog,
    private readonly source: AnswerSource,
    private readonly options: ContextOptions = {},
  ) { this.deckTopRevealsDeferred = options.deferDeckTopReveals === true; }

  get observeEvent(): EventObserver | undefined {
    return this.options.observeEvent;
  }

  choose<P extends Prompt>(spec: PromptSpec<P>, proof?: { readonly allAnswersPayable: true }): AnswerFor<P> {
    this.settleKnowledge();
    this.refreshDeckTopReveals();
    rememberKnownCards(this.state);
    const cancellable =
      !this.committed && this.options.canceller != null && spec.side === this.options.canceller;
    const raw = { ...spec, cancellable } as Prompt;
    if (!isWellFormedPrompt(raw)) {
      throw new MalformedPrompt(raw);
    }
    if (!hasLegalAnswer(raw)) {
      throw new EmptyPrompt(raw);
    }
    if (raw.privateTo !== undefined) {
      // The chooser sees the cards as the prompt opens, whoever answers it.
      this.disclose(raw.privateTo, promptCards(raw));
    }
    if (proof !== undefined && raw.kind !== "chooseCards") throw new Error("Only final card-cost choices carry a payability proof");
    const prompt = this.narrow(raw, proof?.allAnswersPayable);
    const actor = this.options.loopActor;
    // Capture visibility before the answer or ensuing effects can reveal a
    // hidden source or candidate. Both the rules prompt and its narrowed
    // answer surface must be visible, so feasibility cannot erase evidence
    // that the actor lacked part of the prompt.
    const fullyVisible = actor != null && [raw, prompt].every((surface) =>
      JSON.stringify(promptView(surface, actor, this.state)) === JSON.stringify(surface),
    );
    const rawFingerprint = promptFingerprint(raw);
    const fingerprint = prompt === raw ? rawFingerprint : promptFingerprint(prompt);
    const index = this.answers.length;
    const recorded = this.options.prefix?.[index];
    if (recorded !== undefined) {
      if (!matchesPromptFingerprint(prompt, recorded.fingerprint, fingerprint)) {
        throw new ReplayDivergence(index, recorded.fingerprint, fingerprint);
      }
      if (!isLegalAnswer(prompt, recorded.value)) {
        throw new IllegalAnswer(prompt);
      }
      this.record({ ...recorded, fingerprint }, rawFingerprint, prompt.side, fullyVisible);
      if (recorded.auto === true) this.autoAnswered(prompt);
      return this.acceptedAnswer<P>(raw, recorded.value as AnswerFor<P>);
    }
    if (this.options.replay === true) {
      throw new UnrecordedPrompt(prompt);
    }
    const forced = forcedAnswer(prompt, this.state.config);
    if (forced !== undefined) {
      if (!isLegalAnswer(prompt, forced)) {
        throw new IllegalAnswer(prompt);
      }
      this.record({ fingerprint, value: forced, auto: true }, rawFingerprint, prompt.side, fullyVisible);
      this.autoAnswered(prompt);
      return this.acceptedAnswer<P>(raw, forced as AnswerFor<P>);
    }
    const value = this.source.answer(prompt, this.state);
    if (!isLegalAnswer(prompt, value)) {
      throw new IllegalAnswer(prompt);
    }
    this.record({ fingerprint, value }, rawFingerprint, prompt.side, fullyVisible);
    return this.acceptedAnswer<P>(raw, value as AnswerFor<P>);
  }

  /** A private arrangement's answer may reorder positions before its next event. */
  private acceptedAnswer<P extends Prompt>(prompt: Prompt, answer: AnswerFor<P>): AnswerFor<P> {
    if (prompt.kind === "arrange" && prompt.privateTo !== undefined) {
      showPrivately(this.state, prompt.privateTo, promptCards(prompt));
    }
    return answer;
  }

  /**
   * Before the commit point of a guarded step, the prompt narrowed to the
   * answers with a searched continuation or a universal final-cost proof;
   * a prompt left with none is empty. Searches spend the step's shared
   * remaining budget, while universal proofs spend no runs and permit no
   * following guarded precommit prompt. Budget-withheld answers are
   * reported with a `feasibilityBounded` event. The guard memoizes the raw
   * fingerprint, proof mode and decision for replay.
   */
  private narrow(raw: Prompt, allAnswersPayable?: true): Prompt {
    const guard = this.options.guard;
    if (guard === undefined || this.committed) return raw;
    const { prompt, unproven, truncated } = guard.narrow(raw, this.rawAnswers, allAnswersPayable);
    if (unproven > 0 || truncated) {
      // Only the answering side sees the event, so it names the source as that side may see it.
      const purpose = purposeView(raw.purpose, raw.side, this.state);
      this.emit({ kind: "feasibilityBounded", side: raw.side, purpose, unproven, truncated });
    }
    if (!hasLegalAnswer(prompt)) {
      throw new EmptyPrompt(prompt);
    }
    return prompt;
  }

  /**
   * Tells the answering side that a forced prompt answered itself. A replay
   * of the recorded forced answer emits it too, so every run of the step
   * produces the same events.
   */
  private autoAnswered(prompt: Prompt): void {
    const purpose = purposeView(prompt.purpose, prompt.side, this.state);
    this.emit({ kind: "promptAutoAnswered", side: prompt.side, prompt: prompt.kind, purpose });
  }

  private record(answer: RecordedAnswer, rawFingerprint: PromptFingerprint, side: Side, fullyVisible: boolean): void {
    this.answers.push(answer);
    this.rawAnswers.push({ ...answer, fingerprint: rawFingerprint });
    this.choosers.push(side);
    this.promptsVisibleToActor.push(fullyVisible);
  }

  disclose(side: Side, cards: readonly InstanceId[]): void {
    const publicTops = continuouslyRevealedTops(this.state, this.catalog)
      .filter(({ card }) => SIDES.every((viewer) => identifies(this.state, card, viewer)))
      .map(({ card }) => card);
    showPrivately(this.state, side, cards);
    // A private prompt cannot conceal the already public current top.
    revealToBoth(this.state, publicTops);
    this.refreshDeckTopReveals();
    this.disclosed.push({ side, cards: [...cards] });
  }

  adopt(state: BattleState, events: readonly EngineEvent[]): void {
    Object.assign(this.state, state);
    this.events.push(...events);
  }

  commitPoint(): void {
    if (this.options.dryRun === true) {
      throw new Feasible();
    }
    this.committed = true;
  }

  settlingKnowledge(settle: () => void, run: () => void): void {
    this.settlers.push(settle);
    try {
      run();
    } finally {
      this.settlers.pop();
    }
    settle();
  }

  private settleKnowledge(): void {
    for (const settle of this.settlers) settle();
  }

  /** Records an event and matches it against triggered abilities, which queue (D14), once knowledge is settled (`settlingKnowledge`). */
  emit(event: EngineEvent): void {
    eventDefinition(event.kind);
    if (event.kind === "leftPlay") {
      const instance = this.state.instances[event.instance];
      if (instance !== undefined) this.leavingPlay.set(instance.id, instance.enteredZoneAt);
    }
    this.settleKnowledge();
    rememberKnownCards(this.state);
    this.emitting += 1;
    try {
      this.events.push(event);
      if (this.observeEvent !== undefined) {
        try {
          this.observeEvent(event, () => cloneState(this.state));
        } catch {
          // Observation is disposable; rules still match and resolve the event.
        }
      }
      matchEvent(this, event);
    } finally {
      this.emitting -= 1;
    }
    // Movement bookkeeping precedes its substantive announcement. All causal
    // trigger siblings capture visibility before any new top is disclosed.
    if (!(["leftPlay", "leftVoid", "enteredVoid", "triggerQueued"] as readonly EngineEvent["kind"][]).includes(event.kind)) {
      this.refreshDeckTopReveals();
    }
  }

  /** Settle active static revelations at a stable prompt/event/setup boundary. */
  refreshDeckTopReveals(): void {
    if (this.deckTopRevealsDeferred || this.refreshingDeckTops || this.emitting > 0) return;
    for (const [id, timestamp] of this.leavingPlay) {
      const instance = this.state.instances[id];
      if (instance?.zone === "play" && instance.enteredZoneAt === timestamp) return;
      this.leavingPlay.delete(id);
    }
    this.refreshingDeckTops = true;
    try {
      for (const { side, card } of continuouslyRevealedTops(this.state, this.catalog)) {
        if (SIDES.every((viewer) => identifies(this.state, card, viewer))) continue;
        revealToBoth(this.state, [card]);
        this.emit({ kind: "revealed", side, zone: "deck", instances: [card] });
      }
    } finally { this.refreshingDeckTops = false; }
  }

  /** Only a successfully completed operation lifts deferred top revelation. */
  completeDeckTopReveals(): void {
    this.deckTopRevealsDeferred = false;
    this.refreshDeckTopReveals();
  }

  random(stream: string): number {
    return drawRandom(this.state, stream);
  }
}
