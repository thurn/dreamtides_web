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
}

export type BattleIntent =
  | { readonly kind: "battleAction"; readonly side: Side; readonly action: Action }
  | { readonly kind: "answer"; readonly side: Side; readonly promptId: PromptId; readonly value: Answer }
  | { readonly kind: "cancel"; readonly side: Side; readonly promptId: PromptId };

/** A step that threw: the slice keeps `committed` and drops the in-flight step. */
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
  pending(slice: BattleSlice): PendingPrompt | null;
}

export interface FoldOptions {
  /** Assert that every re-run reproduces the events it already published. */
  readonly checkEventPrefix?: boolean;
}

function promptIdOf(committed: BattleState, answerCount: number): PromptId {
  return parsePromptId(`${String(committed.version)}:${String(answerCount)}`);
}

export function createFoldAdapter(engine: Engine, options: FoldOptions = {}): FoldAdapter {
  // Non-persisted re-run memo: the run of an in-flight step for a committed
  // state, keyed by the in-flight record. Committed states never change.
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

  function advance(start: BattleSlice): IntentOutcome {
    let slice = start;
    const published: EngineEvent[] = [];
    for (;;) {
      let inFlight = slice.inFlight;
      if (inFlight === null) {
        const next = nextAutomaticStep(slice.committed, engine.catalog, engine.memo);
        if (next === null) {
          return { kind: "applied", slice, published, error: null };
        }
        inFlight = { step: next, automatic: true, answers: [] };
        slice = { ...slice, inFlight, publishedEvents: 0 };
      }
      let result: StepResult;
      try {
        result = run(slice.committed, inFlight);
      } catch (error) {
        return {
          kind: "applied",
          slice: { committed: slice.committed, inFlight: null, publishedEvents: 0 },
          published,
          error: {
            kind: "engine_error",
            step: inFlight.step,
            answers: inFlight.answers,
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }
      if (options.checkEventPrefix === true && slice.publishedEvents > 0) {
        const replayed = JSON.stringify(result.events.slice(0, slice.publishedEvents));
        const previous = runs.get(slice.committed);
        const earlier = [...(previous?.values() ?? [])].find(
          (candidate) => candidate !== result && candidate.events.length >= slice.publishedEvents,
        );
        if (earlier !== undefined && JSON.stringify(earlier.events.slice(0, slice.publishedEvents)) !== replayed) {
          throw new Error("A re-run step produced a different event prefix");
        }
      }
      published.push(...result.events.slice(slice.publishedEvents));
      if (result.kind === "suspended") {
        return {
          kind: "applied",
          slice: {
            committed: slice.committed,
            inFlight: { ...inFlight, answers: result.answers },
            publishedEvents: result.events.length,
          },
          published,
          error: null,
        };
      }
      slice = { committed: result.state, inFlight: null, publishedEvents: 0 };
    }
  }

  function pending(slice: BattleSlice): PendingPrompt | null {
    if (slice.inFlight === null) return null;
    const result = run(slice.committed, slice.inFlight);
    if (result.kind !== "suspended") return null;
    return {
      prompt: { ...result.prompt, id: promptIdOf(slice.committed, result.answers.length) },
      display: result.display,
    };
  }

  return {
    start(init) {
      const committed = initialState(init, engine.catalog);
      return advance({
        committed,
        inFlight: { step: { kind: "beginBattle", dreamwell: init.dreamwell }, automatic: true, answers: [] },
        publishedEvents: 0,
      });
    },
    pending,
    reduce(slice, intent) {
      if (slice.committed.result !== null) return { kind: "bounced", reason: "battleOver" };
      switch (intent.kind) {
        case "battleAction": {
          if (slice.inFlight !== null) return { kind: "bounced", reason: "stepInFlight" };
          const decision = engine.decision(slice.committed);
          if (decision?.side !== intent.side) return { kind: "bounced", reason: "notYourDecision" };
          const legal = engine.legalActions(slice.committed, intent.side);
          if (!legal.some((action) => actionsEqual(action, intent.action))) {
            return { kind: "bounced", reason: "illegalAction" };
          }
          return advance({
            committed: slice.committed,
            inFlight: { step: stepForAction(slice.committed, intent.action), automatic: false, answers: [] },
            publishedEvents: 0,
          });
        }
        case "answer": {
          const current = pending(slice);
          if (current === null || slice.inFlight === null) return { kind: "bounced", reason: "noPendingPrompt" };
          if (current.prompt.id !== intent.promptId) return { kind: "bounced", reason: "stalePrompt" };
          if (current.prompt.side !== intent.side) return { kind: "bounced", reason: "notYourPrompt" };
          if (!isLegalAnswer(current.prompt, intent.value)) return { kind: "bounced", reason: "illegalAnswer" };
          const { id: _id, ...prompt } = current.prompt;
          return advance({
            ...slice,
            inFlight: {
              ...slice.inFlight,
              answers: [
                ...slice.inFlight.answers,
                { fingerprint: promptFingerprint(prompt), value: intent.value },
              ],
            },
          });
        }
        case "cancel": {
          const current = pending(slice);
          if (current === null) return { kind: "bounced", reason: "noPendingPrompt" };
          if (current.prompt.id !== intent.promptId) return { kind: "bounced", reason: "stalePrompt" };
          if (current.prompt.side !== intent.side) return { kind: "bounced", reason: "notYourPrompt" };
          if (!current.prompt.cancellable) return { kind: "bounced", reason: "notCancellable" };
          return {
            kind: "applied",
            slice: { committed: slice.committed, inFlight: null, publishedEvents: 0 },
            published: [],
            error: null,
          };
        }
      }
    },
  };
}
