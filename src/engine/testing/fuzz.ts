import { contentCardDefinitions, contentDreamwellDefinitions } from "../content-catalog";
import type { Engine } from "../engine";
import type { EngineEvent } from "../events";
import { createFoldAdapter, type BattleSlice } from "../fold/slice";
import { randomLegalAnswer } from "../prompts/answers";
import { promptFingerprint } from "../prompts/fingerprint";
import type { Action } from "../rules/actions";
import { hashString, stateHash, type StateHash } from "../state/hash";
import type { BattleSeed, Side } from "../state/ids";
import { battleSeed } from "../state/ids";
import type { BattleInit, BattleResult, BattleState, DeckEntry } from "../state/types";
import type { StepObserver } from "../steps/driver";
import { InlineSource } from "../steps/sources";
import type { RecordedAnswer } from "../steps/types";
import { invariantViolations } from "./invariants";
import { PolicyRandom, randomAction } from "./random-policy";
import { SYNTHETIC_CARDS, testCatalog } from "./synthetic-cards";
import { PROMPTING_CARDS } from "./synthetic-effects";
import { DSL_CARDS } from "./dsl-cards";

/** A recorded top-level action and the prompt answers given while it ran. */
export interface RecordedAction {
  readonly side: Side;
  readonly action: Action;
  readonly answers: readonly RecordedAnswer[];
}

export interface FuzzGame {
  readonly init: BattleInit;
  /** Answers given while the battle was created. */
  readonly startAnswers: readonly RecordedAnswer[];
  readonly actions: readonly RecordedAction[];
  readonly result: BattleResult | null;
  readonly finalHash: StateHash;
  /** A hash of the complete event sequence. */
  readonly eventsHash: number;
  readonly steps: number;
  readonly prompts: number;
  /** The first invariant violation, with the step that caused it. */
  readonly failure: string | null;
}

export const DECK_SIZE = 30;
/** Top-level actions after which a game counts as non-terminating. */
export const ACTION_CAP = 20000;

/** Every card the fuzzer draws from: synthetic vanilla, prompting, and DSL cards plus the full pool. */
export function fuzzCatalogCards() {
  return [...SYNTHETIC_CARDS, ...PROMPTING_CARDS, ...DSL_CARDS, ...contentCardDefinitions()];
}

/** The fuzzer's catalog: synthetic vanilla, prompting, and DSL cards plus the full card pool. */
export function fuzzEngineCatalog() {
  return testCatalog([...PROMPTING_CARDS, ...DSL_CARDS]);
}

/**
 * A random deck mixing synthetic cards (vanilla, prompting, and DSL) with
 * full-pool catalog cards, which play text-less while pending. A tenth of the
 * entries are amplified.
 */
export function randomDeck(random: PolicyRandom): DeckEntry[] {
  const synthetic = [...SYNTHETIC_CARDS, ...PROMPTING_CARDS, ...DSL_CARDS];
  const pool = contentCardDefinitions();
  return Array.from({ length: DECK_SIZE }, () => ({
    cardId: (random.next() < 0.5 ? random.pick(synthetic) : random.pick(pool)).id,
    amplified: random.next() < 0.1,
  }));
}

export function fuzzInit(seed: BattleSeed): BattleInit {
  const random = new PolicyRandom(battleSeed(`decks|${seed}`));
  return {
    seed,
    scoreToWin: 25,
    startingSide: random.next() < 0.5 ? "player" : "enemy",
    decks: { player: randomDeck(random), enemy: randomDeck(random) },
    dreamwell: contentDreamwellDefinitions().map((card) => card.id),
  };
}

function eventsDigest(events: readonly EngineEvent[]): number {
  return hashString(JSON.stringify(events));
}

/** Plays one seeded game with the Random policy on both sides, checking invariants after every step. */
export function playFuzzGame(engine: Engine, seed: BattleSeed): FuzzGame {
  const init = fuzzInit(seed);
  const policy = new PolicyRandom(battleSeed(`policy|${seed}`));
  let prompts = 0;
  const answerer = (): InlineSource =>
    new InlineSource({
      player: (prompt) => {
        prompts += 1;
        return randomLegalAnswer(prompt, () => policy.next());
      },
      enemy: (prompt) => {
        prompts += 1;
        return randomLegalAnswer(prompt, () => policy.next());
      },
    });
  let steps = 0;
  let failure: string | null = null;
  const events: EngineEvent[] = [];
  const observe: StepObserver = (state, step) => {
    steps += 1;
    if (failure === null) {
      const problems = invariantViolations(state, engine.catalog);
      if (problems.length > 0) {
        failure = `after step ${step.kind} (#${String(steps)}): ${problems.join("; ")}`;
      }
    }
  };
  const start = engine.createBattle(init, answerer(), observe);
  events.push(...start.events);
  let state: BattleState = start.state;
  const actions: RecordedAction[] = [];
  while (state.result === null && failure === null) {
    const pending = engine.decision(state);
    if (pending === null) {
      failure = "no decision and no result";
      break;
    }
    if (actions.length >= ACTION_CAP) {
      failure = `no result after ${String(ACTION_CAP)} actions`;
      break;
    }
    const action = randomAction(engine.legalActions(state, pending.side), policy);
    const applied = engine.apply(state, pending.side, action, answerer(), observe);
    actions.push({ side: pending.side, action, answers: applied.answers });
    events.push(...applied.events);
    state = applied.state;
  }
  return {
    init,
    startAnswers: start.answers,
    actions,
    result: state.result,
    finalHash: stateHash(state),
    eventsHash: eventsDigest(events),
    steps,
    prompts,
    failure,
  };
}

/** Replays a recorded game inline and returns its final state hash. */
export function replayFinalHash(engine: Engine, game: FuzzGame): StateHash {
  const replayed = (answers: readonly RecordedAnswer[]) => {
    const values = answers.filter((answer) => answer.auto !== true).map((answer) => answer.value);
    let index = 0;
    return new InlineSource({
      player: () => values[index++] ?? [],
      enemy: () => values[index++] ?? [],
    });
  };
  let state = engine.createBattle(game.init, replayed(game.startAnswers)).state;
  for (const { side, action, answers } of game.actions) {
    state = engine.apply(state, side, action, replayed(answers)).state;
  }
  return stateHash(state);
}

export interface InteractiveReplay {
  readonly failure: string | null;
  /** Fold re-runs of a suspended step, and their total time in milliseconds. */
  readonly reruns: number;
  readonly rerunMs: number;
}

/**
 * Replays a recorded game through the fold, suspending at every prompt and
 * answering it from the recording, then checks that the final state, the
 * event sequence, and every prompt fingerprint match the inline game.
 */
export function replayInteractively(
  engine: Engine,
  game: FuzzGame,
  now: () => number,
): InteractiveReplay {
  const fold = createFoldAdapter(engine, { checkEventPrefix: true });
  const events: EngineEvent[] = [];
  let reruns = 0;
  let rerunMs = 0;
  let failure: string | null = null;

  const answerAll = (slice: BattleSlice, answers: readonly RecordedAnswer[]): BattleSlice => {
    const given = answers.filter((answer) => answer.auto !== true);
    let current = slice;
    for (const recorded of given) {
      const pending = fold.pending(current);
      if (pending === null) {
        failure ??= "the fold has no pending prompt for a recorded answer";
        return current;
      }
      const { id, ...prompt } = pending.prompt;
      if (promptFingerprint(prompt) !== recorded.fingerprint) {
        failure ??= "a prompt fingerprint differs from the inline game";
        return current;
      }
      const started = now();
      const outcome = fold.reduce(current, { kind: "answer", side: pending.prompt.side, promptId: id, value: recorded.value });
      rerunMs += now() - started;
      reruns += 1;
      if (outcome.kind !== "applied" || outcome.error !== null) {
        failure ??= `answer failed: ${outcome.kind === "bounced" ? outcome.reason : (outcome.error?.message ?? "")}`;
        return current;
      }
      events.push(...outcome.published);
      current = outcome.slice;
    }
    if (fold.pending(current) !== null) {
      failure ??= "the fold is still waiting for an answer the inline game did not need";
    }
    return current;
  };

  const started = fold.start(game.init);
  if (started.kind !== "applied") return { failure: "start bounced", reruns, rerunMs };
  events.push(...started.published);
  let slice = answerAll(started.slice, game.startAnswers);
  for (const { side, action, answers } of game.actions) {
    if (failure !== null) break;
    const outcome = fold.reduce(slice, { kind: "battleAction", side, action });
    if (outcome.kind !== "applied" || outcome.error !== null) {
      failure = `action failed: ${outcome.kind === "bounced" ? outcome.reason : (outcome.error?.message ?? "")}`;
      break;
    }
    events.push(...outcome.published);
    slice = answerAll(outcome.slice, answers);
  }
  if (failure === null && stateHash(slice.committed) !== game.finalHash) {
    failure = "the fold's final state differs from the inline game";
  }
  if (failure === null && eventsDigest(events) !== game.eventsHash) {
    failure = "the fold published a different event sequence";
  }
  return { failure, reruns, rerunMs };
}
