import type { EngineCatalog } from "../catalog";
import { eventDefinition, type EngineEvent } from "../events";
import { forcedAnswer, hasLegalAnswer, isLegalAnswer } from "../prompts/answers";
import { promptFingerprint } from "../prompts/fingerprint";
import { isWellFormedPrompt, MalformedPrompt, promptCards } from "../prompts/structure";
import type { AnswerFor, Prompt, PromptFingerprint, PromptSpec } from "../prompts/types";
import type { Side } from "../state/ids";
import { drawRandom } from "../state/rng";
import type { BattleState } from "../state/types";
import { matchEvent } from "../triggers/matcher";
import { showPrivately } from "../view/knowledge";
import { purposeView } from "../view/view";
import { EmptyPrompt, Feasible, IllegalAnswer, ReplayDivergence, UnrecordedPrompt } from "./errors";
import type { AnswerSource, RecordedAnswer, StepContext } from "./types";

export interface ContextOptions {
  /** Answers recorded by earlier runs of this step, replayed in order. */
  readonly prefix?: readonly RecordedAnswer[];
  /** The side that may cancel this step before its commit point. */
  readonly canceller?: Side | null;
  /** A legality dry run: the commit point throws `Feasible`. */
  readonly dryRun?: boolean;
  /** A loop replay: every prompt must be answered by `prefix`, else `UnrecordedPrompt` is thrown. */
  readonly replay?: boolean;
  /** Narrows each prompt raised before the commit point to the answers with a feasible continuation. */
  readonly guard?: PromptGuard;
}

/**
 * Narrows the play-time prompts of a step with a commit point
 * (steps/feasibility.ts). `prefix` holds the answers given so far, each with
 * the fingerprint of the prompt as rules code raised it, before narrowing.
 */
export interface PromptGuard {
  narrow(prompt: Prompt, prefix: readonly RecordedAnswer[]): Narrowed;
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
  /** `answers` with the fingerprint of each prompt as rules code raised it, before any narrowing. */
  readonly rawAnswers: RecordedAnswer[] = [];
  committed = false;

  constructor(
    readonly state: BattleState,
    readonly catalog: EngineCatalog,
    private readonly source: AnswerSource,
    private readonly options: ContextOptions = {},
  ) {}

  choose<P extends Prompt>(spec: PromptSpec<P>): AnswerFor<P> {
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
      showPrivately(this.state, raw.privateTo, promptCards(raw));
    }
    const prompt = this.narrow(raw);
    const rawFingerprint = promptFingerprint(raw);
    const fingerprint = prompt === raw ? rawFingerprint : promptFingerprint(prompt);
    const index = this.answers.length;
    const recorded = this.options.prefix?.[index];
    if (recorded !== undefined) {
      if (recorded.fingerprint !== fingerprint) {
        throw new ReplayDivergence(index, recorded.fingerprint, fingerprint);
      }
      if (!isLegalAnswer(prompt, recorded.value)) {
        throw new IllegalAnswer(prompt);
      }
      this.record(recorded, rawFingerprint, prompt.side);
      return recorded.value as AnswerFor<P>;
    }
    if (this.options.replay === true) {
      throw new UnrecordedPrompt(prompt);
    }
    const forced = forcedAnswer(prompt, this.state.config);
    if (forced !== undefined) {
      if (!isLegalAnswer(prompt, forced)) {
        throw new IllegalAnswer(prompt);
      }
      this.record({ fingerprint, value: forced, auto: true }, rawFingerprint, prompt.side);
      return forced as AnswerFor<P>;
    }
    const value = this.source.answer(prompt, this.state);
    if (!isLegalAnswer(prompt, value)) {
      throw new IllegalAnswer(prompt);
    }
    this.record({ fingerprint, value }, rawFingerprint, prompt.side);
    return value as AnswerFor<P>;
  }

  /**
   * Before the commit point of a guarded step, the prompt narrowed to the
   * answers with a feasible continuation; a prompt left with none is empty.
   * Answers withheld only because the step's feasibility budget ran out are
   * reported with a `feasibilityBounded` event.
   */
  private narrow(raw: Prompt): Prompt {
    const guard = this.options.guard;
    if (guard === undefined || this.committed) return raw;
    const { prompt, unproven, truncated } = guard.narrow(raw, this.rawAnswers);
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

  private record(answer: RecordedAnswer, rawFingerprint: PromptFingerprint, side: Side): void {
    this.answers.push(answer);
    this.rawAnswers.push({ ...answer, fingerprint: rawFingerprint });
    this.choosers.push(side);
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

  /** Records an event and matches it against triggered abilities, which queue (D14). */
  emit(event: EngineEvent): void {
    eventDefinition(event.kind);
    this.events.push(event);
    matchEvent(this, event);
  }

  random(stream: string): number {
    return drawRandom(this.state, stream);
  }
}
