import type { EngineCatalog } from "../catalog";
import { eventDefinition, type EngineEvent } from "../events";
import { forcedAnswer, hasLegalAnswer, isLegalAnswer } from "../prompts/answers";
import { promptFingerprint } from "../prompts/fingerprint";
import { isWellFormedPrompt, MalformedPrompt } from "../prompts/structure";
import type { AnswerFor, Prompt, PromptSpec } from "../prompts/types";
import type { Side } from "../state/ids";
import { drawRandom } from "../state/rng";
import type { BattleState } from "../state/types";
import { EmptyPrompt, Feasible, IllegalAnswer, ReplayDivergence } from "./errors";
import type { AnswerSource, RecordedAnswer, StepContext } from "./types";

export interface ContextOptions {
  /** Answers recorded by earlier runs of this step, replayed in order. */
  readonly prefix?: readonly RecordedAnswer[];
  /** The side that may cancel this step before its commit point. */
  readonly canceller?: Side | null;
  /** A legality dry run: the commit point throws `Feasible`. */
  readonly dryRun?: boolean;
}

export class Context implements StepContext {
  readonly events: EngineEvent[] = [];
  readonly answers: RecordedAnswer[] = [];
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
    const prompt = { ...spec, cancellable } as Prompt;
    if (!isWellFormedPrompt(prompt)) {
      throw new MalformedPrompt(prompt);
    }
    if (!hasLegalAnswer(prompt)) {
      throw new EmptyPrompt(prompt);
    }
    const fingerprint = promptFingerprint(prompt);
    const index = this.answers.length;
    const recorded = this.options.prefix?.[index];
    if (recorded !== undefined) {
      if (recorded.fingerprint !== fingerprint) {
        throw new ReplayDivergence(index, recorded.fingerprint, fingerprint);
      }
      if (!isLegalAnswer(prompt, recorded.value)) {
        throw new IllegalAnswer(prompt);
      }
      this.answers.push(recorded);
      return recorded.value as AnswerFor<P>;
    }
    const forced = forcedAnswer(prompt);
    if (forced !== undefined) {
      if (!isLegalAnswer(prompt, forced)) {
        throw new IllegalAnswer(prompt);
      }
      this.answers.push({ fingerprint, value: forced, auto: true });
      return forced as AnswerFor<P>;
    }
    const value = this.source.answer(prompt, this.state);
    if (!isLegalAnswer(prompt, value)) {
      throw new IllegalAnswer(prompt);
    }
    this.answers.push({ fingerprint, value });
    return value as AnswerFor<P>;
  }

  commitPoint(): void {
    if (this.options.dryRun === true) {
      throw new Feasible();
    }
    this.committed = true;
  }

  emit(event: EngineEvent): void {
    eventDefinition(event.kind);
    this.events.push(event);
  }

  random(stream: string): number {
    return drawRandom(this.state, stream);
  }
}
