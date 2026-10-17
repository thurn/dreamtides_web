import { assertJourneyLoopCheckpoint } from "../journey/journey-loop-state";
import { assertJourneyTransfigurationCheckpoint } from "../journey/journey-transfiguration";
import { assertJourneySubtypeCheckpoint } from "../journey/journey-subtype";
import { assertJourneyTypeRemapCheckpoint } from "../journey/journey-type-remap";
import { assertShopReplenishmentCheckpoint } from "../journey/journey-shop";
import { assertCommittedPurgePreventionCheckpoint } from "../journey/journey-committed-purge-state";
import { journeyModifierRegistry, type JourneyModifierRegistry } from "../journey/modifier-registry";
import { assertBeforeBattlePurgeCheckpoint } from "../journey/journey-before-battle-purge";
import { assertScoreGroupCheckpoint } from "../battle/score-group-state";
import { assertFirstEventHistoryCheckpoint } from "../battle/first-event-last-turn-state";
import { assertLastTurnScoringCheckpoint } from "../battle/last-turn-scoring-state";
// The replay harness: the canonical game EngineConfig plus a one-call log
// replayer used by the fixture regression net and by src/session/.
//
// `createGameEngineConfig` defines the game's reducer + genesis + codec + hash
// wiring. Each config captures one fixed journey registry for both event intake
// and checkpoint decoding. `GAME_ENGINE_CONFIG` is the production instance;
// the eventlog engine, session layer and replay fixtures share that instance.
//
// This module lives under src/rules/ and obeys its lint rails: no React,
// no live clock/rng. It is pure — replaying the same `{ genesis, events }`
// always yields the same final state, hash, and per-event outcomes.

import { assertJourneyDeckSparkCheckpoint } from "../battle/journey-deck-spark-state";
import { foldEvents, type FoldOutcome } from "../../eventlog/fold";
import { hashState } from "../../eventlog/hash";
import type {
  EngineConfig,
  GameEvent,
  Genesis,
  StateHash,
} from "../../eventlog/types";
import { genesisFoldState, type FoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import { assertJourneyOpeningCheckpoint } from "../journey/journey-battle-init";

/**
 * The canonical `EngineConfig<FoldState>` for the real Dreamtides game.
 *
 * - `reducer`   — the root fold and its prompt gate (`reduceGameEvent`).
 * - `genesisState` — the pre-journey fold state a fresh game shows.
 * - `encode` / `decode` — JSON round-trip of the pure-data `FoldState`, used for
 *   the compaction base snapshot. `FoldState` holds only JSON-safe data (no
 *   functions / `undefined` / class instances), so `JSON.stringify` /
 *   `JSON.parse` round-trips it byte-exactly.
 * - `hash` — the canonical, key-order-independent SHA-256 digest.
 *
 * Every config binds the same fixed registry to the reducer and all checkpoint
 * validators that consult journey modifiers. The default captures the immutable
 * production registry; scoped callers supply their own immutable registry.
 */
export function createGameEngineConfig(
  modifiers: JourneyModifierRegistry = journeyModifierRegistry,
): EngineConfig<FoldState> {
  return {
    reducer: modifiers === journeyModifierRegistry
      ? reduceGameEvent
      : (state, event, context) => reduceGameEvent(state, event, context, modifiers),
    genesisState: genesisFoldState,
    encode: (state) => JSON.stringify(state),
    decode: (raw) => {
      const state: unknown = JSON.parse(raw);
      assertJourneyTransfigurationCheckpoint(state);
      assertJourneyLoopCheckpoint(state);
      assertJourneySubtypeCheckpoint(state, modifiers);
      assertJourneyTypeRemapCheckpoint(state, modifiers);
      assertBeforeBattlePurgeCheckpoint(state);
      assertJourneyDeckSparkCheckpoint(state);
      assertJourneyOpeningCheckpoint(state, modifiers);
      assertScoreGroupCheckpoint(state);
      assertLastTurnScoringCheckpoint(state);
      assertFirstEventHistoryCheckpoint(state);
      assertShopReplenishmentCheckpoint(state);
      assertCommittedPurgePreventionCheckpoint(state, id => modifiers.lookup(id));
      return state as FoldState;
    },
    hash: hashState,
  };
}

/** The canonical production instance shared by game-log consumers. */
export const GAME_ENGINE_CONFIG = createGameEngineConfig();

/** A committed event with its assigned seq — the shape a game log stores. */
export interface SeqEvent {
  seq: number;
  event: GameEvent;
}

/** The input to {@link replayLog}: a game's genesis plus its full event log. */
export interface ReplayInput {
  genesis: Genesis;
  events: SeqEvent[];
}

/** The result of replaying a log: the folded state, its hash, and outcomes. */
export interface ReplayResult {
  finalState: FoldState;
  finalHash: StateHash;
  outcomes: FoldOutcome[];
}

/**
 * Replays a full event log from genesis: folds `events` (seq-ordered) onto
 * `genesisState(genesis)` via {@link GAME_ENGINE_CONFIG} and returns the final
 * state, its canonical hash, and the per-event outcomes.
 *
 * Contained-throw mode (`devMode: false`) so a poison event is reported as a
 * bounce with an attached error rather than aborting the replay — a replay
 * harness must survive any log it is handed.
 */
export function replayLog({ genesis, events }: ReplayInput): ReplayResult {
  const base = { seq: 0, state: GAME_ENGINE_CONFIG.genesisState(genesis) };
  const { state, outcomes } = foldEvents(
    GAME_ENGINE_CONFIG,
    genesis,
    base,
    events,
    {
      devMode: false,
    },
  );
  return {
    finalState: state,
    finalHash: GAME_ENGINE_CONFIG.hash(state),
    outcomes,
  };
}
