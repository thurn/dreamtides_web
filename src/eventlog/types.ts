// Game-agnostic event-sourcing engine contracts.
//
// This module defines the shapes shared by every eventlog file (append,
// subscribe, fold, rng, hash, room) and by src/coop/. It must never import
// from src/rules/ or src/coop/ — the engine is parameterized over a generic
// fold state `S` and knows nothing about Dreamtides.
//
// See docs/superpowers/specs/2026-07-01-coop-event-sourcing-rewrite-design.md
// (§Architecture, §Data model) for the authoritative design this file
// transcribes.

/**
 * A single intent appended to a room's shared log.
 *
 * Events and snapshots are stored in RTDB as JSON strings (see
 * `EncodedLogNode`), never as RTDB trees, so a `GameEvent` here is always
 * the decoded, in-memory shape.
 */
export interface GameEvent {
  /** e.g. "BATTLE_COMMAND" | "BEGIN_BATTLE" | ... */
  type: string;
  /** UUIDs, choice indices, etc. — never card names. */
  payload: Record<string, unknown>;
  /** clientId, or "ai:<clientId>" for AI-originated events. */
  actor: string;
  /** Display data only, stamped by the appender. Not used by reducers. */
  clientTimestamp: string;
  /** Newest confirmed seq folded into the state the actor saw when it built this event. */
  basedOnSeq: number;
  /**
   * Client-stamped nonce used to match a confirmed event against the
   * appender's own pending-intent queue (optimistic echo reconciliation).
   * Ignored by reducers.
   */
  nonce?: string;
  /**
   * The appender's local fold hash after applying this event, set only
   * when the appender's optimistic prediction matched the committed seq
   * (see design spec §Error handling and safety rails, "Divergence
   * tripwire"). Skewed predictions omit this rather than write a wrong
   * hash. Observers compare their own post-apply hash against this value
   * and log `fold_divergence` on mismatch.
   */
  stateHashAfter?: string;
}

/**
 * Immutable metadata written once when a room is created.
 *
 * `createdAt` is stored as an epoch-millisecond number (not an ISO string)
 * because the only consumer is the room-eviction check ("genesis.createdAt
 * older than 24h" — see design spec §Architecture/room lifecycle): a plain
 * numeric subtraction against `Date.now()` is the natural comparison, and
 * an epoch number avoids parsing a string on every eviction sweep.
 */
export interface Genesis {
  seed: string;
  reducerVersion: string;
  /** Epoch milliseconds (see rationale above). */
  createdAt: number;
}

/**
 * A decoded log node: everything needed to fold a room's current state.
 */
export interface LogNode {
  genesis: Genesis;
  /** Events with seq <= baseSeq are compacted into baseSnapshot. */
  baseSeq: number;
  /** Decoded compacted snapshot, or null if no compaction has happened yet. */
  baseSnapshot: unknown;
  /** Seq of the newest event in the log. */
  head: number;
  /** Decoded events, keyed by seq, dense in (baseSeq, head]. */
  events: Map<number, GameEvent>;
}

/**
 * The RTDB-native shape of a log node: genesis, baseSnapshot, and each
 * event are JSON strings, not RTDB trees. Opaque strings round-trip
 * byte-exact (RTDB otherwise strips empty arrays/objects and `undefined`
 * from trees) and keep `stateHashAfter` comparisons stable.
 */
export interface EncodedLogNode {
  /** JSON string encoding a Genesis. */
  genesis: string;
  baseSeq: number;
  /** JSON string encoding the compacted fold state, or null. */
  baseSnapshot: string | null;
  head: number;
  /** JSON string per seq, dense integer keys in (baseSeq, head]. */
  events: { [seq: number]: string };
}

/** Whether a reducer applied an event's effects or bounced it as invalid/stale. */
export type EventOutcome = "applied" | "bounced";

/**
 * Everything a reducer needs beyond `(state, event)` to decide and apply
 * an event deterministically.
 */
export interface EventContext {
  /** The seq being assigned to this event. */
  seq: number;
  /** Deterministic per-event random stream, keyed by (seed, seq, drawIndex). */
  rng: (drawIndex: number) => number;
  /**
   * Events between this event's `basedOnSeq` and its `seq` that themselves
   * applied — a bounced event changed nothing and can never invalidate a
   * later decision, so bounced events are filtered out before this array
   * is built.
   *
   * The literal string "unknown" (never an empty array) when
   * `basedOnSeq < baseSeq`, i.e. the events in that window have already
   * been compacted away and can no longer be enumerated. Reducers must
   * treat "unknown" and `[]` differently: an empty array is a precise
   * claim that nothing intervened, while "unknown" means the window can't
   * be inspected at all.
   */
  intervening: Array<{ seq: number; actor: string; type: string }> | "unknown";
  timestamp: string;
}

/**
 * Parameterizes the game-agnostic engine (append/fold/hash/subscribe) over
 * a specific game's fold state `S`. The rules package (src/rules/) supplies
 * one concrete `EngineConfig<FoldState>`; the engine itself never sees `S`'s
 * shape beyond these five functions.
 */
export interface EngineConfig<S> {
  reducer: (state: S, event: GameEvent, ctx: EventContext) => { state: S; outcome: EventOutcome };
  genesisState: (genesis: Genesis) => S;
  /** For baseSnapshot. */
  encode: (s: S) => string;
  decode: (raw: string) => S;
  hash: (s: S) => string;
}
