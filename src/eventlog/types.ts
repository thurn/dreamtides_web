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
   * Stable identity for a logical intent that may be observed and submitted by
   * multiple React mounts or connected clients. The append transaction keeps
   * at most one event for a key across the room's lifetime; reducers still
   * validate the winning event against durable state.
   */
  intentKey?: string;
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
  /**
   * Standalone front-door scene a newly created room starts on. Journey rooms
   * omit this and use the default main-menu scene; the journey router ignores
   * the front-door slice entirely.
   */
  frontDoorEntry?: "main" | "loading" | "tutorial";
  /**
   * Fold-relevant content parameters, pinned at room creation. Both players
   * must fold the same content (draft pool and draft mode), so
   * these are captured in the immutable genesis rather than read per-client
   * from each browser's URL — a client whose local config differs is gated
   * out until it adopts the room's pinned params (see RoomGate's config gate).
   */
  contentConfig?: ContentConfig;
}

/**
 * The subset of a client's runtime config that changes how the log folds:
 * which draft pool and mode produce cards and the fresh-pack size. Two clients
 * must agree on all of it to fold a room's log to
 * the same state. Kept as plain strings/numbers so this game-agnostic contracts
 * module stays free of any src/rules or src/runtime import.
 */
export interface ContentConfig {
  poolVariant: string;
  draftMode: string;
  fresh20PackSize: number | null;
  /** Atlas generation/reducer content pinned independently of URL settings. */
  atlasFoldHash?: string;
  /** Site assignments and deterministic site rules pinned for room folding. */
  sitesFoldHash?: string;
  /** Draft offers, caps, and pool tuning pinned independently of URL settings. */
  draftFoldHash?: string;
  /** Economy coefficients and genesis defaults pinned independently of URL settings. */
  economyFoldHash?: string;
  /** Shared reward-selection scoring and eligibility tuning. */
  rewardSelectionFoldHash?: string;
  /** Augury encounter rules, archetype weights, policies, and quantities. */
  auguryFoldHash?: string;
  /** Exploration effect definitions, defaults, copy, and encounter catalog. */
  explorationFoldHash?: string;
  /** Tutorial scenario fields which can change reducer outcomes. */
  tutorialFoldHash?: string;
  opponentsFoldHash?: string;
  defaultStartingEssence?: number;
  dreamsignCap?: number;
}

export interface PinnedContentConfig extends ContentConfig {
  atlasFoldHash: string;
  sitesFoldHash: string;
  draftFoldHash: string;
  economyFoldHash: string;
  rewardSelectionFoldHash: string;
  auguryFoldHash: string;
  explorationFoldHash: string;
  tutorialFoldHash: string;
  opponentsFoldHash: string;
  defaultStartingEssence: number;
  dreamsignCap: number;
}

/** A current room genesis whose fold-relevant content settings are pinned. */
export interface PinnedGenesis extends Genesis {
  contentConfig: PinnedContentConfig;
}

/**
 * A decoded log node: everything needed to fold a room's current state.
 */
export interface LogNode {
  genesis: Genesis;
  /** Events with seq <= baseSeq are compacted into baseSnapshot. */
  baseSeq: number;
  /**
   * The RAW encoded compacted snapshot string, or `null` if no compaction has
   * happened yet. Kept as the raw string (not pre-decoded) so every consumer
   * — the client's confirmed-fold base state and compaction's own fold base
   * (`append.ts`) — decodes it through the SAME path, `config.decode(raw)`.
   * `decodeLogNode` still validates it parses (a corrupt snapshot makes the
   * whole node unreadable, same as a corrupt genesis), it just no longer
   * hands the parsed value to callers.
   */
  baseSnapshot: string | null;
  /** Seq of the newest event in the log. */
  head: number;
  /** Decoded events, keyed by seq, dense in (baseSeq, head]. */
  events: Map<number, GameEvent>;
  /**
   * Decoded applied index: seq -> {actor, type} for every APPLIED event with
   * seq <= baseSeq. Written by compaction so a fold from the snapshot can still
   * enumerate intervening windows below the horizon; an empty map before any
   * compaction has run.
   */
  appliedIndex: Map<number, AppliedIndexEntry>;
}

/** Minimal identity of an applied event, as stored in the persisted applied index. */
export interface AppliedIndexEntry {
  actor: string;
  type: string;
}

/**
 * The canonical log node produced by writers and consumed by the pure append
 * updater. Firebase's native read shape is decoded into this form at the
 * boundary; genesis, snapshots, and events remain opaque JSON strings so
 * nested game state round-trips byte-exactly.
 */
export interface EncodedLogNode {
  /** JSON string encoding a Genesis. */
  genesis: string;
  baseSeq: number;
  /** JSON string encoding the compacted fold state, or null before compaction. */
  baseSnapshot: string | null;
  head: number;
  /** JSON string per seq, dense integer keys in (baseSeq, head]. */
  events: { [seq: number]: string };
  /**
   * JSON string encoding `Record<seq, {actor, type}>` for every APPLIED event
   * with seq <= baseSeq. Written by compaction; absent (RTDB strips it) on a
   * node that has not compacted yet.
   */
  appliedIndex?: string;
  /**
   * JSON string encoding `Record<seq, intentKey>` for keyed logical intents.
   * Entries survive event compaction so remounts and late-joining clients
   * cannot append the same logical transition again.
   */
  intentKeyIndex?: string;
  /**
   * Last compaction attempt that failed inside `applyAppend`. The append still
   * commits, but this structural marker makes the skipped compaction visible to
   * later readers without doing IO from the pure updater. Cleared on the next
   * successful compaction.
   */
  compactionError?: {
    head: number;
    baseSeq: number;
    attemptedBaseSeq: number;
    message: string;
  };
}

/** Whether a reducer applied an event's effects or bounced it as invalid/stale. */
export type EventOutcome = "applied" | "bounced";

/** Why a bounced event was not applied, for diagnostics and player-facing copy. */
export type BounceReason =
  | "partner_conflict"
  | "unknown_conflict"
  | "prompt_pending"
  | "observer_read_only"
  | "invalid_action"
  | "malformed_event"
  | "fold_error";

/** A reducer's deterministic result for one event. */
export interface ReducerResult<S> {
  state: S;
  outcome: EventOutcome;
  /** Required by the game reducer for bounces; optional for generic engine clients. */
  bounceReason?: BounceReason;
}

/**
 * Everything a reducer needs beyond `(state, event)` to decide and apply
 * an event deterministically.
 */
export interface EventContext {
  /** Immutable fold-relevant content configuration from room genesis. */
  contentConfig?: ContentConfig;
  /** The seq being assigned to this event. */
  seq: number;
  /**
   * Deterministic per-event random stream, keyed by (seed, seq, drawIndex).
   * CONVENTION: exactly ONE consumer per event draws from this stream (a
   * single `let drawIndex = 0; const random = () => ctx.rng(drawIndex++);`
   * counter threaded through everything that event's fold step does — see
   * `battleCommand`/`battleGesture` in battle-events.ts, which continue the
   * SAME counter across every command a `BATTLE_GESTURE` expands into). Two
   * independent consumers each starting their own counter at 0 would draw
   * the SAME `(seed, seq, 0)`, `(seed, seq, 1)`, ... values and so correlate
   * — e.g. two "random" choices within one event landing suspiciously
   * identical — silently breaking the independence a reducer's randomness is
   * assumed to have (audit finding P3-4).
   */
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
  reducer: (state: S, event: GameEvent, ctx: EventContext) => ReducerResult<S>;
  genesisState: (genesis: Genesis) => S;
  /** For baseSnapshot. */
  encode: (s: S) => string;
  decode: (raw: string) => S;
  hash: (s: S) => string;
}
