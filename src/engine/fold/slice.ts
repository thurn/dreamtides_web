/**
 * The battle slice of the fold (D31): plain data that suspends a step at a
 * prompt by recording its answers and replaying the step on each new
 * answer. Phase 4 wires it into the journey fold; tests drive it directly.
 */
import type { Engine } from "../engine";
import type { EngineEvent } from "../events";
import { isLegalAnswer } from "../prompts/answers";
import { promptFingerprint } from "../prompts/fingerprint";
import type { Answer, Prompt, PromptId } from "../prompts/types";
import { actionsEqual, type Action } from "../rules/actions";
import { parsePromptId } from "../../types/identifiers";
import { initialState } from "../state/create";
import type { Side } from "../state/ids";
import type { BattleInit, BattleState } from "../state/types";
import { nextAutomaticStep, stepForAction } from "../steps/driver";
import type { Step } from "../steps/kinds";
import { runStep } from "../steps/runner";
import { INTERACTIVE } from "../steps/sources";
import type { RecordedAnswer, StepResult } from "../steps/types";

export interface InFlight {
  readonly step: Step;
  /** Whether the step is automatic rather than a top-level action. */
  readonly automatic: boolean;
  readonly answers: readonly RecordedAnswer[];
}

export interface BattleSlice {
  /** The state at the last step boundary. */
  readonly committed: BattleState;
  readonly inFlight: InFlight | null;
  /** Events of the in-flight step already handed to presentation. */
  readonly publishedEvents: number;
  /**
   * The in-flight attempt counter. Opening any in-flight step and cancelling
   * one advance it, and prompt ids include it, so an answer meant for a
   * cancelled or failed attempt never matches a later attempt from the same
   * committed state. It is persisted with the slice, so ids survive reloads.
   */
  readonly attempt: number;
}

export type BattleIntent =
  | { readonly kind: "battleAction"; readonly side: Side; readonly action: Action }
  | { readonly kind: "answer"; readonly side: Side; readonly promptId: PromptId; readonly value: Answer }
  | { readonly kind: "cancel"; readonly side: Side; readonly promptId: PromptId };

/**
 * A step that threw, or an in-flight record that no longer replays to a
 * prompt (a divergent or illegal recorded answer, answers left unused, or a
 * failed event-prefix check): the slice keeps `committed` and drops the
 * in-flight step.
 */
export interface EngineErrorRecord {
  readonly kind: "engine_error";
  readonly step: Step;
  readonly answers: readonly RecordedAnswer[];
  readonly message: string;
}

export type BounceReason =
  | "battleOver"
  | "stepInFlight"
  | "notYourDecision"
  | "illegalAction"
  | "noPendingPrompt"
  | "stalePrompt"
  | "notYourPrompt"
  | "illegalAnswer"
  | "notCancellable";

export type IntentOutcome =
  | {
      readonly kind: "applied";
      readonly slice: BattleSlice;
      /** Events newly handed to presentation, in order. */
      readonly published: readonly EngineEvent[];
      readonly error: EngineErrorRecord | null;
    }
  | { readonly kind: "bounced"; readonly reason: BounceReason };

export interface PendingPrompt {
  /** The pending prompt, with its stable id. */
  readonly prompt: Prompt & { readonly id: PromptId };
  /** The intermediate state while the step is suspended. */
  readonly display: BattleState;
}

export interface FoldAdapter {
  /** Builds a battle and advances it to the first decision or prompt. */
  start(init: BattleInit): IntentOutcome;
  reduce(slice: BattleSlice, intent: BattleIntent): IntentOutcome;
  /**
   * The prompt the in-flight step is suspended on. Never throws: it is `null`
   * when nothing is in flight and also when the in-flight record fails to
   * replay to a prompt. The next intent on such a slice returns an
   * `engine_error` outcome that clears the in-flight step.
   */
  pending(slice: BattleSlice): PendingPrompt | null;
}

export interface FoldOptions {
  /**
   * Development check: after an answer, the re-run step must reproduce the
   * events its previous run (the same step with one answer fewer) published.
   * A mismatch is an `engine_error`.
   */
  readonly checkEventPrefix?: boolean;
}

function promptIdOf(slice: BattleSlice, answerCount: number): PromptId {
  return parsePromptId(
    `${String(slice.committed.version)}:${String(slice.attempt)}:${String(answerCount)}`,
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The slice with `inFlight` cleared after an engine error. */
function recovered(slice: BattleSlice): BattleSlice {
  return { committed: slice.committed, inFlight: null, publishedEvents: 0, attempt: slice.attempt };
}

/** The slice with a new in-flight step opened from `committed`. */
function opened(slice: BattleSlice, step: Step, automatic: boolean): BattleSlice {
  return {
    committed: slice.committed,
    inFlight: { step, automatic, answers: [] },
    publishedEvents: 0,
    attempt: slice.attempt + 1,
  };
}

type Evaluation =
  | { readonly kind: "ok"; readonly result: StepResult }
  | { readonly kind: "error"; readonly error: EngineErrorRecord };

type Replay =
  | { readonly kind: "pending"; readonly pending: PendingPrompt }
  | { readonly kind: "error"; readonly error: EngineErrorRecord };

export function createFoldAdapter(engine: Engine, options: FoldOptions = {}): FoldAdapter {
  // Non-persisted re-run memo: the run of an in-flight step for a committed
  // state, keyed by the in-flight record. Committed states never change, and
  // a run does not depend on the attempt.
  const runs = new WeakMap<BattleState, Map<string, StepResult>>();

  function run(committed: BattleState, inFlight: InFlight): StepResult {
    const key = JSON.stringify(inFlight);
    let byState = runs.get(committed);
    const cached = byState?.get(key);
    if (cached !== undefined) return cached;
    const result = runStep(committed, inFlight.step, INTERACTIVE, engine.catalog, {
      prefix: inFlight.answers,
      automatic: inFlight.automatic,
    });
    if (byState === undefined) {
      byState = new Map();
      runs.set(committed, byState);
    }
    byState.set(key, result);
    return result;
  }

  /**
   * Compares a re-run after an answer with the run of the same step with
   * that answer removed, which published `publishedEvents` events.
   */
  function checkEventPrefix(
    committed: BattleState,
    inFlight: InFlight,
    result: StepResult,
    publishedEvents: number,
  ): void {
    const previous = run(committed, { ...inFlight, answers: inFlight.answers.slice(0, -1) });
    const expected = JSON.stringify(previous.events);
    if (
      previous.kind !== "suspended" ||
      previous.events.length !== publishedEvents ||
      JSON.stringify(result.events.slice(0, previous.events.length)) !== expected
    ) {
      throw new Error("A re-run step produced a different event prefix");
    }
  }

  /**
   * Runs the in-flight step behind the fold's error boundary. `answered`
   * carries the published event count when the record just gained an answer.
   */
  function evaluate(committed: BattleState, inFlight: InFlight, answered: number | null): Evaluation {
    try {
      const result = run(committed, inFlight);
      if (result.answers.length < inFlight.answers.length) {
        throw new Error("The step finished with recorded answers left unused");
      }
      if (options.checkEventPrefix === true && answered !== null && inFlight.answers.length > 0) {
        checkEventPrefix(committed, inFlight, result, answered);
      }
      return { kind: "ok", result };
    } catch (error) {
      return {
        kind: "error",
        error: { kind: "engine_error", step: inFlight.step, answers: inFlight.answers, message: errorMessage(error) },
      };
    }
  }

  /** Replays a recorded in-flight step to the prompt it is suspended on. */
  function replay(slice: BattleSlice, inFlight: InFlight): Replay {
    const evaluation = evaluate(slice.committed, inFlight, null);
    if (evaluation.kind === "error") return evaluation;
    const { result } = evaluation;
    if (result.kind !== "suspended") {
      return {
        kind: "error",
        error: {
          kind: "engine_error",
          step: inFlight.step,
          answers: inFlight.answers,
          message: "The in-flight step does not suspend at a prompt",
        },
      };
    }
    return {
      kind: "pending",
      pending: {
        prompt: { ...result.prompt, id: promptIdOf(slice, result.answers.length) },
        display: result.display,
      },
    };
  }

  function failed(slice: BattleSlice, error: EngineErrorRecord): IntentOutcome {
    return { kind: "applied", slice: recovered(slice), published: [], error };
  }

  /**
   * Runs the in-flight step and the automatic steps after it until a
   * decision, a prompt, or the battle's end. `answered` is true when the
   * in-flight record just gained an answer.
   */
  function advance(start: BattleSlice, answered: boolean): IntentOutcome {
    let slice = start;
    let checked = answered;
    const published: EngineEvent[] = [];
    for (;;) {
      let inFlight = slice.inFlight;
      if (inFlight === null) {
        const next = nextAutomaticStep(slice.committed, engine.catalog, engine.memo);
        if (next === null) {
          return { kind: "applied", slice, published, error: null };
        }
        inFlight = { step: next, automatic: true, answers: [] };
        slice = { ...slice, inFlight, publishedEvents: 0, attempt: slice.attempt + 1 };
      }
      const evaluation = evaluate(slice.committed, inFlight, checked ? slice.publishedEvents : null);
      checked = false;
      if (evaluation.kind === "error") {
        return { kind: "applied", slice: recovered(slice), published, error: evaluation.error };
      }
      const { result } = evaluation;
      published.push(...result.events.slice(slice.publishedEvents));
      if (result.kind === "suspended") {
        return {
          kind: "applied",
          slice: {
            ...slice,
            inFlight: { ...inFlight, answers: result.answers },
            publishedEvents: result.events.length,
          },
          published,
          error: null,
        };
      }
      slice = { committed: result.state, inFlight: null, publishedEvents: 0, attempt: slice.attempt };
    }
  }

  function pending(slice: BattleSlice): PendingPrompt | null {
    if (slice.inFlight === null) return null;
    const current = replay(slice, slice.inFlight);
    return current.kind === "pending" ? current.pending : null;
  }

  return {
    start(init) {
      const committed = initialState(init, engine.catalog);
      return advance({
        committed,
        inFlight: { step: { kind: "beginBattle", dreamwell: init.dreamwell }, automatic: true, answers: [] },
        publishedEvents: 0,
        attempt: 0,
      }, false);
    },
    pending,
    reduce(slice, intent) {
      if (slice.committed.result !== null) return { kind: "bounced", reason: "battleOver" };
      switch (intent.kind) {
        case "battleAction": {
          if (slice.inFlight !== null) {
            const current = replay(slice, slice.inFlight);
            return current.kind === "error" ? failed(slice, current.error) : { kind: "bounced", reason: "stepInFlight" };
          }
          const decision = engine.decision(slice.committed);
          if (decision?.side !== intent.side) return { kind: "bounced", reason: "notYourDecision" };
          const legal = engine.legalActions(slice.committed, intent.side);
          if (!legal.some((action) => actionsEqual(action, intent.action))) {
            return { kind: "bounced", reason: "illegalAction" };
          }
          return advance(opened(slice, stepForAction(slice.committed, intent.action), false), false);
        }
        case "answer": {
          if (slice.inFlight === null) return { kind: "bounced", reason: "noPendingPrompt" };
          const current = replay(slice, slice.inFlight);
          if (current.kind === "error") return failed(slice, current.error);
          const { prompt } = current.pending;
          if (prompt.id !== intent.promptId) return { kind: "bounced", reason: "stalePrompt" };
          if (prompt.side !== intent.side) return { kind: "bounced", reason: "notYourPrompt" };
          if (!isLegalAnswer(prompt, intent.value)) return { kind: "bounced", reason: "illegalAnswer" };
          const { id: _id, ...raised } = prompt;
          return advance({
            ...slice,
            inFlight: {
              ...slice.inFlight,
              answers: [
                ...slice.inFlight.answers,
                { fingerprint: promptFingerprint(raised), value: intent.value },
              ],
            },
          }, true);
        }
        case "cancel": {
          if (slice.inFlight === null) return { kind: "bounced", reason: "noPendingPrompt" };
          const current = replay(slice, slice.inFlight);
          if (current.kind === "error") return failed(slice, current.error);
          const { prompt } = current.pending;
          if (prompt.id !== intent.promptId) return { kind: "bounced", reason: "stalePrompt" };
          if (prompt.side !== intent.side) return { kind: "bounced", reason: "notYourPrompt" };
          if (!prompt.cancellable) return { kind: "bounced", reason: "notCancellable" };
          return {
            kind: "applied",
            slice: { ...recovered(slice), attempt: slice.attempt + 1 },
            published: [],
            error: null,
          };
        }
      }
    },
  };
}
