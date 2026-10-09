import {
  createCatalog,
  type EmblemDefinitions,
  type EngineCardDefinition,
  type EngineCatalog,
  type EngineDreamwellDefinition,
  type EngineFigmentDefinition,
} from "../catalog";
import { energy, energyX } from "../dsl/builders";
import type { ApplyResult, Engine } from "../engine";
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
import { eventLogRecords, legalityLogRecords, stepLogRecords, type EngineLogRecord } from "../log";
import { InlineSource } from "../steps/sources";
import type { RecordedAnswer } from "../steps/types";
import { invariantViolations } from "./invariants";
import { promptRedactionViolations } from "./redaction";
import { PolicyRandom, randomAction } from "./random-policy";
import { SYNTHETIC, SYNTHETIC_CARDS, SYNTHETIC_DREAMWELL, syntheticId } from "./synthetic-cards";
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
  /** Plays and activations decisions left out because their legality search spent its budget (`ApplyResult.bounded`). */
  readonly boundedLegality: number;
  /** Play-time prompts that withheld answers because the budget ran out (`feasibilityBounded` events). */
  readonly boundedPrompts: number;
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

const FUZZ_EMBLEMS: EmblemDefinitions = {
  avatars: [...(SYNTHETIC_EMBLEMS.avatars ?? []), ...(TRIGGER_EMBLEMS.avatars ?? []), ...(CONTINUOUS_EMBLEMS.avatars ?? [])],
  dreamsigns: [...(SYNTHETIC_EMBLEMS.dreamsigns ?? []), ...(TRIGGER_EMBLEMS.dreamsigns ?? []), ...(CONTINUOUS_EMBLEMS.dreamsigns ?? [])],
};

/**
 * The content a fuzz game draws from beside the synthetic fixtures: the
 * cards that fill half of each deck, the shared Dreamwell, and the emblems
 * and figments those cards need in the catalog. The fuzz scripts pass the
 * production catalog; engine tests pass `SYNTHETIC_FUZZ_POOL`.
 */
export interface FuzzPool {
  readonly cards: readonly EngineCardDefinition[];
  readonly dreamwell: readonly EngineDreamwellDefinition[];
  readonly emblems: EmblemDefinitions;
  readonly figments: readonly EngineFigmentDefinition[];
}

function pending(index: number, base: EngineCardDefinition, changes: Partial<EngineCardDefinition> = {}): EngineCardDefinition {
  return { ...base, ...changes, id: syntheticId(0xe40 + index), status: "pending" };
}

/**
 * A synthetic stand-in for catalog content, ids 0xe40+: pending (text-less,
 * D36) characters and events across costs, speeds, and subtypes, including X
 * costs and a variable spark, with the synthetic Dreamwell.
 */
export const SYNTHETIC_FUZZ_POOL: FuzzPool = {
  cards: [
    pending(0, SYNTHETIC.vanilla0, { subtype: "Spirit Animal" }),
    pending(1, SYNTHETIC.vanilla1, { subtype: "Mage" }),
    pending(2, SYNTHETIC.vanilla2),
    pending(3, SYNTHETIC.vanilla3, { subtype: "Mage" }),
    pending(4, SYNTHETIC.vanilla5, { subtype: "Spirit Animal" }),
    pending(5, SYNTHETIC.vanilla8),
    pending(6, SYNTHETIC.fastCharacter, { subtype: "Mage" }),
    pending(7, SYNTHETIC.interruptCharacter),
    pending(8, SYNTHETIC.vanilla2, { costs: [energyX()], spark: "x" }),
    pending(9, SYNTHETIC.event0),
    pending(10, SYNTHETIC.event1, { costs: [energy(2)] }),
    pending(11, SYNTHETIC.fastEvent),
    pending(12, SYNTHETIC.interruptEvent, { costs: [energy(3)] }),
    pending(13, SYNTHETIC.event1, { costs: [energyX()] }),
    pending(14, SYNTHETIC.event1, { costs: [energy(1), energyX()] }),
  ],
  dreamwell: SYNTHETIC_DREAMWELL,
  emblems: {},
  figments: [],
};

/** Every card the fuzzer draws from: the synthetic fixtures plus the pool's cards. */
export function fuzzCatalogCards(pool: FuzzPool): EngineCardDefinition[] {
  return [...FUZZ_SYNTHETIC, ...pool.cards];
}

/**
 * The fuzzer's catalog: the synthetic fixtures, emblems, and figments, any
 * `extra` cards, and the pool.
 */
export function fuzzEngineCatalog(pool: FuzzPool, extra: readonly EngineCardDefinition[] = []): EngineCatalog {
  return createCatalog(
    [...FUZZ_SYNTHETIC, ...extra, ...pool.cards],
    pool.dreamwell,
    {
      avatars: [...(FUZZ_EMBLEMS.avatars ?? []), ...(pool.emblems.avatars ?? [])],
      dreamsigns: [...(FUZZ_EMBLEMS.dreamsigns ?? []), ...(pool.emblems.dreamsigns ?? [])],
    },
    [...ZONE_FIGMENTS, ...pool.figments],
  );
}

/**
 * A random deck mixing synthetic cards (vanilla, prompting, and DSL) with the
 * pool's cards; pending pool cards play text-less. A tenth of the entries are
 * amplified.
 */
export function randomDeck(random: PolicyRandom, pool: FuzzPool): DeckEntry[] {
  const synthetic = FUZZ_SYNTHETIC;
  return Array.from({ length: DECK_SIZE }, () => ({
    cardId: (random.next() < 0.5 ? random.pick(synthetic) : random.pick(pool.cards)).id,
    amplified: random.next() < 0.1,
  }));
}

export function fuzzInit(seed: BattleSeed, pool: FuzzPool): BattleInit {
  const random = new PolicyRandom(battleSeed(`decks|${seed}`));
  const avatars = [...Object.values(AVATAR), ...Object.values(TRIGGER_AVATAR), ...Object.values(CONTINUOUS_AVATAR)].map((avatar) => avatar.id);
  const dreamsigns = [DREAMSIGN.points, ...Object.values(TRIGGER_DREAMSIGN), ...Object.values(CONTINUOUS_DREAMSIGN)].map((dreamsign) => dreamsign.id);
  const someDreamsigns = () => dreamsigns.filter(() => random.next() < 0.3);
  return {
    seed,
    scoreToWin: 25,
    startingSide: random.next() < 0.5 ? "player" : "enemy",
    decks: { player: randomDeck(random, pool), enemy: randomDeck(random, pool) },
    dreamwell: pool.dreamwell.map((card) => card.id),
    avatars: { player: random.pick(avatars), enemy: random.pick(avatars) },
    dreamsigns: { player: someDreamsigns(), enemy: someDreamsigns() },
  };
}

function eventsDigest(events: readonly EngineEvent[]): number {
  return hashString(JSON.stringify(events));
}

/** A top-level action the Random policy chose, and the side it chose it for. */
export interface ChosenAction {
  readonly side: Side;
  readonly action: Action;
}

/** Observers of a Random-policy game; every hook is optional. */
export interface RandomGameHooks {
  /** Receives every step, as the engine's step observer. */
  readonly observe?: StepObserver;
  /** Sees each prompt the policy answers, the working state it was asked in, and the answer. */
  readonly answered?: (prompt: Prompt, work: BattleState, answer: Answer) => void;
  /** Sees each action the policy chooses and the committed state it chose it in, before the engine applies it. */
  readonly choosing?: (chosen: ChosenAction, state: BattleState) => void;
  /** Receives the engine's result for the battle's creation (`chosen` null), then for each applied action. */
  readonly committed?: (result: ApplyResult, chosen: ChosenAction | null) => void;
  /** Ends play before the next decision when it returns true; `actions` counts the actions taken so far. */
  readonly stop?: (state: BattleState, actions: number) => boolean;
}

/**
 * Why a Random-policy game ended: the battle's result, the `stop` hook, a
 * state with neither a result nor a pending decision, or `ACTION_CAP`.
 */
export type RandomGameEnd = "result" | "stopped" | "noDecision" | "actionCap";

export interface RandomGame {
  readonly state: BattleState;
  /** The top-level actions taken. */
  readonly actions: number;
  readonly end: RandomGameEnd;
}

/** Answers every prompt for both sides with `policy`, reporting each answer to `answered`. */
function randomAnswers(policy: PolicyRandom, answered: RandomGameHooks["answered"]): InlineSource {
  const answer = (prompt: Prompt, work: BattleState): Answer => {
    const value = randomLegalAnswer(prompt, () => policy.next());
    answered?.(prompt, work, value);
    return value;
  };
  return new InlineSource({ player: answer, enemy: answer });
}

/**
 * Creates the battle `init` describes and plays it with the Random policy on
 * both sides, seeded by `policy|<seed>`, until it ends (`RandomGameEnd`).
 * The policy answers every prompt and chooses every top-level action.
 */
export function playRandomGame(engine: Engine, init: BattleInit, hooks: RandomGameHooks = {}): RandomGame {
  const policy = new PolicyRandom(battleSeed(`policy|${init.seed}`));
  const created = engine.createBattle(init, randomAnswers(policy, hooks.answered), hooks.observe);
  hooks.committed?.(created, null);
  return playRandomActions(engine, created.state, policy, hooks);
}

/** Plays on from a committed `state` with the Random policy `policy` on both sides, as `playRandomGame` does. */
export function playRandomActions(engine: Engine, state: BattleState, policy: PolicyRandom, hooks: RandomGameHooks = {}): RandomGame {
  const source = randomAnswers(policy, hooks.answered);
  let current = state;
  let actions = 0;
  while (current.result === null) {
    if (hooks.stop?.(current, actions) === true) return { state: current, actions, end: "stopped" };
    const pending = engine.decision(current);
    if (pending === null) return { state: current, actions, end: "noDecision" };
    if (actions >= ACTION_CAP) return { state: current, actions, end: "actionCap" };
    const chosen: ChosenAction = { side: pending.side, action: randomAction(engine.legalActions(current, pending.side), policy) };
    hooks.choosing?.(chosen, current);
    const applied = engine.apply(current, chosen.side, chosen.action, source, hooks.observe);
    actions += 1;
    hooks.committed?.(applied, chosen);
    current = applied.state;
  }
  return { state: current, actions, end: "result" };
}

/** Plays one seeded game with the Random policy on both sides, checking invariants after every step. */
export function playFuzzGame(engine: Engine, seed: BattleSeed, pool: FuzzPool): FuzzGame {
  const init = fuzzInit(seed, pool);
  let prompts = 0;
  let steps = 0;
  let boundedLegality = 0;
  let boundedPrompts = 0;
  let failure: string | null = null;
  const events: EngineEvent[] = [];
  let state: BattleState = initialState(init, engine.catalog);
  let startAnswers: readonly RecordedAnswer[] = [];
  const actions: RecordedAction[] = [];
  let failedAction: FuzzGame["failedAction"] = null;
  try {
    const game = playRandomGame(engine, init, {
      answered: (prompt, work) => {
        prompts += 1;
        if (failure === null) {
          const problems = promptRedactionViolations(prompt, work, engine.catalog);
          if (problems.length > 0) failure = `at a ${prompt.kind} prompt after step #${String(steps)}: ${problems.join("; ")}`;
        }
      },
      observe: (observed, step) => {
        steps += 1;
        if (failure === null) {
          const problems = invariantViolations(observed, engine.catalog);
          if (problems.length > 0) {
            failure = `after step ${step.kind} (#${String(steps)}): ${problems.join("; ")}`;
          }
        }
      },
      choosing: (chosen) => {
        failedAction = chosen;
      },
      committed: (applied, chosen) => {
        if (chosen === null) {
          startAnswers = applied.answers;
        } else {
          failedAction = null;
          actions.push({ ...chosen, answers: applied.answers });
        }
        events.push(...applied.events);
        boundedLegality += applied.bounded.length;
        boundedPrompts += applied.events.filter((event) => event.kind === "feasibilityBounded").length;
        state = applied.state;
      },
      stop: () => failure !== null,
    });
    if (game.end === "noDecision") failure = "no decision and no result";
    if (game.end === "actionCap") failure = `no result after ${String(ACTION_CAP)} actions`;
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
    boundedLegality,
    boundedPrompts,
    failure,
    failedAction,
  };
}

/**
 * The engine log of a recorded fuzz game (log.ts), for a failing game's log
 * file: its init and policies, then each action with its answers, replayed
 * inline to add the triggers, loops, random draws, battle end, and
 * feasibility bounds it produced. A step that throws ends the log with an
 * `engine.error` record.
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
    const created = engine.createBattle(game.init, replaySource(game.startAnswers), observe);
    records.push(...legalityLogRecords(created.bounded));
    let state = created.state;
    for (const { side, action, answers } of game.actions) {
      records.push({ event: "engine.action", version: state.version, side, action, answers });
      step = stepForAction(state, action);
      const applied = engine.apply(state, side, action, replaySource(answers), observe);
      records.push(...legalityLogRecords(applied.bounded));
      state = applied.state;
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
