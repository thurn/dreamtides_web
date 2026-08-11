// The replay harness: the canonical game EngineConfig plus a one-call log
// replayer used by the fixture regression net and by src/coop/ (Stage D).
//
// `GAME_ENGINE_CONFIG` is THE single definition of the real game's
// `EngineConfig<FoldState>`: the root reducer, the genesis-state builder, a
// byte-stable JSON encode/decode for the compaction snapshot, and the canonical
// state hash. Every consumer that needs to fold the game's event log — the
// eventlog engine, the coop React layer, the replay fixtures — imports this one
// object so there is exactly one wiring of reducer + genesis + codec + hash.
//
// This module lives under src/rules/ and obeys its lint rails: no Firebase, no
// React, no live clock/rng. It is pure — replaying the same `{ genesis, events }`
// always yields the same final state, hash, and per-event outcomes.

import { foldEvents, type FoldOutcome } from "../../eventlog/fold";
import { hashState } from "../../eventlog/hash";
import type { EngineConfig, GameEvent, Genesis } from "../../eventlog/types";
import { genesisFoldState, type FoldState } from "../fold-state";
import { normalizePersistedNightmareState } from "../nightmare-migration";
import { normalizePersistedShopPurchaseState } from "../shop-purchase-migration";
import { reduceGameEvent } from "../reducer";

/**
 * The canonical `EngineConfig<FoldState>` for the real Dreamtides coop game.
 *
 * - `reducer`   — the root fold + CAS policy (`reduceGameEvent`).
 * - `genesisState` — the pre-journey fold state a fresh room shows.
 * - `encode` / `decode` — JSON round-trip of the pure-data `FoldState`, used for
 *   the compaction base snapshot. `FoldState` holds only JSON-safe data (no
 *   functions / `undefined` / class instances), so `JSON.stringify` /
 *   `JSON.parse` round-trips it byte-exactly.
 * - `hash` — the canonical, key-order-independent SHA-256 digest.
 *
 * This is the ONE wiring every folder of the game log consumes (Stage D's
 * `src/coop/` included). Do not construct a second ad-hoc config; import this.
 */
export const GAME_ENGINE_CONFIG: EngineConfig<FoldState> = {
  reducer: reduceGameEvent,
  genesisState: genesisFoldState,
  encode: (state) => JSON.stringify(state),
  decode: (raw) =>
    normalizePersistedShopPurchaseState(
      normalizePersistedNightmareState(JSON.parse(raw)),
    ) as FoldState,
  hash: hashState,
};

/** A committed event with its assigned seq — the shape a room log stores. */
export interface SeqEvent {
  seq: number;
  event: GameEvent;
}

/** The input to {@link replayLog}: a room's genesis plus its full event log. */
export interface ReplayInput {
  genesis: Genesis;
  events: SeqEvent[];
}

/** The result of replaying a log: the folded state, its hash, and outcomes. */
export interface ReplayResult {
  finalState: FoldState;
  finalHash: string;
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
