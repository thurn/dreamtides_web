import type { EngineCardDefinition } from "../catalog";
import { contentCardDefinitions, contentDreamwellDefinitions } from "../content-catalog";
import type { Engine } from "../engine";
import type { EngineEvent } from "../events";
import { createFoldAdapter, type BattleSlice } from "../fold/slice";
import { randomLegalAnswer } from "../prompts/answers";
import { promptFingerprint } from "../prompts/fingerprint";
import type { Answer, Prompt } from "../prompts/types";
import type { Action } from "../rules/actions";
import { hashString, stateHash, type StateHash } from "../state/hash";
import type { BattleSeed, Side } from "../state/ids";
import { battleSeed } from "../state/ids";
import type { BattleInit, BattleResult, BattleState, DeckEntry } from "../state/types";
import { stepForAction, type StepObserver } from "../steps/driver";
import type { Step } from "../steps/kinds";
import { initialState } from "../state/create";
import { eventLogRecords, stepLogRecords, type EngineLogRecord } from "../log";
import { InlineSource } from "../steps/sources";
import type { RecordedAnswer } from "../steps/types";
import { invariantViolations } from "./invariants";
import { promptRedactionViolations } from "./redaction";
import { PolicyRandom, randomAction } from "./random-policy";
import { SYNTHETIC_CARDS, testCatalog } from "./synthetic-cards";
import { PROMPTING_CARDS } from "./synthetic-effects";
import { DSL_CARDS } from "./dsl-cards";
import { AVATAR, DREAMSIGN, STACK_CARDS, SYNTHETIC_EMBLEMS } from "./stack-cards";
import { TRIGGER_AVATAR, TRIGGER_CARDS, TRIGGER_DREAMSIGN, TRIGGER_EMBLEMS } from "./trigger-cards";
import { CONTINUOUS_AVATAR, CONTINUOUS_CARDS, CONTINUOUS_DREAMSIGN, CONTINUOUS_EMBLEMS } from "./continuous-cards";
import { ZONE_CARDS, ZONE_FIGMENTS } from "./zone-cards";
import { LOOP_CARDS } from "./loop-cards";

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
  /** The first invariant violation or engine error, with the step that caused it. */
  readonly failure: string | null;
  /** The action whose run threw, which `actions` therefore lacks. */
  readonly failedAction: { readonly side: Side; readonly action: Action } | null;
}

/** The policy playing each side of a fuzz game, as its log records it. */
export const FUZZ_POLICIES: Readonly<Record<Side, string>> = { player: "random", enemy: "random" };

function errorText(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

export const DECK_SIZE = 30;
/** Top-level actions after which a game counts as non-terminating. */
export const ACTION_CAP = 20000;

/**
 * Synthetic cards the fuzzer mixes in: vanilla, prompting, DSL, stack
 * (Interrupts, prevent, activated abilities), trigger and duration,
 * continuous-effect, zone and special-mechanic, and optional-loop fixtures.
 */
const FUZZ_SYNTHETIC = [...SYNTHETIC_CARDS, ...PROMPTING_CARDS, ...DSL_CARDS, ...STACK_CARDS, ...TRIGGER_CARDS, ...CONTINUOUS_CARDS, ...ZONE_CARDS, ...LOOP_CARDS];

/** Every card the fuzzer draws from: the synthetic fixtures plus the full pool. */
export function fuzzCatalogCards() {
  return [...FUZZ_SYNTHETIC, ...contentCardDefinitions()];
}

/** The fuzzer's catalog: the synthetic fixtures and emblems, any `extra` cards, and the full catalog. */
export function fuzzEngineCatalog(extra: readonly EngineCardDefinition[] = []) {
  return testCatalog([...PROMPTING_CARDS, ...DSL_CARDS, ...STACK_CARDS, ...TRIGGER_CARDS, ...CONTINUOUS_CARDS, ...ZONE_CARDS, ...LOOP_CARDS, ...extra], {
    avatars: [...(SYNTHETIC_EMBLEMS.avatars ?? []), ...(TRIGGER_EMBLEMS.avatars ?? []), ...(CONTINUOUS_EMBLEMS.avatars ?? [])],
    dreamsigns: [...(SYNTHETIC_EMBLEMS.dreamsigns ?? []), ...(TRIGGER_EMBLEMS.dreamsigns ?? []), ...(CONTINUOUS_EMBLEMS.dreamsigns ?? [])],
  }, ZONE_FIGMENTS);
}

/**
 * A random deck mixing synthetic cards (vanilla, prompting, and DSL) with
 * full-pool catalog cards, which play text-less while pending. A tenth of the
 * entries are amplified.
 */
export function randomDeck(random: PolicyRandom): DeckEntry[] {
  const synthetic = FUZZ_SYNTHETIC;
  const pool = contentCardDefinitions();
  return Array.from({ length: DECK_SIZE }, () => ({
    cardId: (random.next() < 0.5 ? random.pick(synthetic) : random.pick(pool)).id,
    amplified: random.next() < 0.1,
  }));
}

export function fuzzInit(seed: BattleSeed): BattleInit {
  const random = new PolicyRandom(battleSeed(`decks|${seed}`));
  const avatars = [...Object.values(AVATAR), ...Object.values(TRIGGER_AVATAR), ...Object.values(CONTINUOUS_AVATAR)].map((avatar) => avatar.id);
  const dreamsigns = [DREAMSIGN.points, ...Object.values(TRIGGER_DREAMSIGN), ...Object.values(CONTINUOUS_DREAMSIGN)].map((dreamsign) => dreamsign.id);
  const someDreamsigns = () => dreamsigns.filter(() => random.next() < 0.3);
  return {
    seed,
    scoreToWin: 25,
    startingSide: random.next() < 0.5 ? "player" : "enemy",
    decks: { player: randomDeck(random), enemy: randomDeck(random) },
    dreamwell: contentDreamwellDefinitions().map((card) => card.id),
    avatars: { player: random.pick(avatars), enemy: random.pick(avatars) },
    dreamsigns: { player: someDreamsigns(), enemy: someDreamsigns() },
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
  let steps = 0;
  let failure: string | null = null;
  const answer = (prompt: Prompt, work: BattleState): Answer => {
    prompts += 1;
    if (failure === null) {
      const problems = promptRedactionViolations(prompt, work, engine.catalog);
      if (problems.length > 0) failure = `at a ${prompt.kind} prompt after step #${String(steps)}: ${problems.join("; ")}`;
    }
    return randomLegalAnswer(prompt, () => policy.next());
  };
  const answerer = (): InlineSource => new InlineSource({ player: answer, enemy: answer });
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
  let state: BattleState = initialState(init, engine.catalog);
  let startAnswers: readonly RecordedAnswer[] = [];
  const actions: RecordedAction[] = [];
  let failedAction: FuzzGame["failedAction"] = null;
  try {
    const start = engine.createBattle(init, answerer(), observe);
    events.push(...start.events);
    startAnswers = start.answers;
    state = start.state;
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
      failedAction = { side: pending.side, action };
      const applied = engine.apply(state, pending.side, action, answerer(), observe);
      failedAction = null;
      actions.push({ side: pending.side, action, answers: applied.answers });
      events.push(...applied.events);
      state = applied.state;
    }
  } catch (error) {
    failure ??= errorText(error);
  }
  return {
    init,
    startAnswers,
    actions,
    result: state.result,
    finalHash: stateHash(state),
    eventsHash: eventsDigest(events),
    steps,
    prompts,
    failure,
    failedAction,
  };
}

/**
 * The engine log of a recorded fuzz game (log.ts), for a failing game's log
 * file: its init and policies, then each action with its answers, replayed
 * inline to add the triggers, loops, random draws, and battle end it
 * produced. A step that throws ends the log with an `engine.error` record.
 */
export function fuzzGameLog(engine: Engine, game: FuzzGame): EngineLogRecord[] {
  const records: EngineLogRecord[] = [{ event: "engine.battleStarted", version: 0, init: game.init, policies: FUZZ_POLICIES }];
  let previous = initialState(game.init, engine.catalog);
  const observe: StepObserver = (state, _step, events) => {
    records.push(...eventLogRecords(events, previous.version), ...stepLogRecords(previous, state));
    previous = state;
  };
  let step: Step = { kind: "beginBattle", dreamwell: game.init.dreamwell };
  try {
    let state = engine.createBattle(game.init, replaySource(game.startAnswers), observe).state;
    for (const { side, action, answers } of game.actions) {
      records.push({ event: "engine.action", version: state.version, side, action, answers });
      step = stepForAction(state, action);
      state = engine.apply(state, side, action, replaySource(answers), observe).state;
    }
  } catch (error) {
    records.push({ event: "engine.error", version: previous.version, step, message: errorText(error) });
  }
  return records;
}

/** Answers prompts with the recorded non-automatic answers, in order. */
function replaySource(answers: readonly RecordedAnswer[]): InlineSource {
  const values = answers.filter((answer) => answer.auto !== true).map((answer) => answer.value);
  let index = 0;
  return new InlineSource({
    player: () => values[index++] ?? [],
    enemy: () => values[index++] ?? [],
  });
}

/** Replays a recorded game inline and returns its final state hash. */
export function replayFinalHash(engine: Engine, game: FuzzGame): StateHash {
  let state = engine.createBattle(game.init, replaySource(game.startAnswers)).state;
  for (const { side, action, answers } of game.actions) {
    state = engine.apply(state, side, action, replaySource(answers)).state;
  }
  return stateHash(state);
}

export interface InteractiveReplay {
  readonly failure: string | null;
  /** Fold re-runs of a suspended step, and their total time in milliseconds. */
  readonly reruns: number;
  readonly rerunMs: number;
  /** The slowest single re-run, in milliseconds. */
  readonly rerunMaxMs: number;
}

/**
 * Replays a recorded game through the fold, suspending at every prompt and
 * answering it from the recording, then checks that the final state, the
 * event sequence, and every prompt fingerprint match the inline game, that
 * each suspended display redacts the state and prompt for both sides, and
 * that the fold logged every action once, in order.
 */
export function replayInteractively(
  engine: Engine,
  game: FuzzGame,
  now: () => number,
  log?: (record: EngineLogRecord) => void,
): InteractiveReplay {
  const logged: EngineLogRecord[] = [];
  const fold = createFoldAdapter(engine, {
    checkEventPrefix: true,
    log: (record) => {
      logged.push(record);
      log?.(record);
    },
  });
  const events: EngineEvent[] = [];
  let reruns = 0;
  let rerunMs = 0;
  let rerunMaxMs = 0;
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
      const leaks = promptRedactionViolations(pending.prompt, pending.display, engine.catalog);
      if (leaks.length > 0) {
        failure ??= `a suspended display leaks: ${leaks.join("; ")}`;
        return current;
      }
      const started = now();
      const outcome = fold.reduce(current, { kind: "answer", side: pending.prompt.side, promptId: id, value: recorded.value });
      const elapsed = now() - started;
      rerunMs += elapsed;
      rerunMaxMs = Math.max(rerunMaxMs, elapsed);
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
  if (started.kind !== "applied") return { failure: "start bounced", reruns, rerunMs, rerunMaxMs };
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
  const loggedActions = logged.flatMap((record) => (record.event === "engine.action" ? [{ side: record.side, action: record.action }] : []));
  if (failure === null && JSON.stringify(loggedActions) !== JSON.stringify(game.actions.map(({ side, action }) => ({ side, action })))) {
    failure = "the fold's log differs from the actions taken";
  }
  return { failure, reruns, rerunMs, rerunMaxMs };
}
