// Game-agnostic event-sourcing engine contracts.
//
// This module defines the shapes shared by every eventlog file (local-log,
// fold, rng, hash, wire) and by src/session/. It must never import from
// src/rules/ or src/session/ — the engine is parameterized over a generic
// fold state `S` and knows nothing about Dreamtides.

import type { ClientId, IntentKey } from "../types/identifiers";
import type { FoldHash } from "../types/content-hash";
import type { PoolVariant } from "../draft/pool/types";
import type { ReducerVersion } from "../types/reducer-version";
import type { JourneySeed } from "../types/journey-seed";

declare const eventEnvelopeBrand: unique symbol;
declare const eventActorBrand: unique symbol;

type EventEnvelopeIdentity<Name extends string> = string & {
  readonly [eventEnvelopeBrand]: Name;
};

/** Canonical digest of one folded game state. */
export type StateHash = EventEnvelopeIdentity<"StateHash">;

/** Open event-envelope discriminator constrained to canonical uppercase tags. */
export type EventType = Uppercase<string>;

/** Opaque author of an event envelope. Client ids are valid actors directly. */
export type EventActor =
  | ClientId
  | (string & { readonly [eventActorBrand]: "EventActor" });

export function parseEventActor(value: unknown): EventActor {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Event actor must be a non-empty identifier.");
  }
  return value as EventActor;
}

export function aiEventActor(clientId: ClientId): EventActor {
  return parseEventActor(`ai:${clientId}`);
}

export function tutorialAiEventActor(clientId: ClientId): EventActor {
  return parseEventActor(`tutorial-ai:${clientId}`);
}

export function parseEventType(value: unknown): EventType {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.toUpperCase()
  ) {
    throw new Error("Event type must be a non-empty uppercase discriminator.");
  }
  return value as EventType;
}

export function parseStateHash(value: unknown): StateHash {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("State hash must be a non-empty string.");
  }
  return value as StateHash;
}

/**
 * A single intent appended to a game's log.
 *
 * Events are persisted as JSON strings (`encodeEvent` in wire.ts), so a
 * `GameEvent` here is always the decoded, in-memory shape.
 */
export interface GameEvent {
  /** e.g. "BATTLE_COMMAND" | "BEGIN_BATTLE" | ... */
  type: EventType;
  /** UUIDs, choice indices, etc. — never card names. */
  payload: Record<string, unknown>;
  /** clientId, or "ai:<clientId>" for AI-originated events. */
  actor: EventActor;
  /** Display data only, stamped by the appender. Not used by reducers. */
  clientTimestamp: string;
  /** Newest committed seq folded into the state the actor saw when it built this event. */
  basedOnSeq: number;
  /**
   * Stable identity for a logical intent that may be submitted by several
   * React mounts or reloads. The log keeps at most one applied event for a
   * key across the game's lifetime; reducers still validate that event
   * against durable state.
   */
  intentKey?: IntentKey;
}

/**
 * Immutable metadata written once when a game is created, in the shape the
 * fold consumes: every field the initial fold state reads is present.
 */
export interface Genesis {
  seed: JourneySeed;
  reducerVersion: ReducerVersion;
  /** Epoch milliseconds. */
  createdAt: number;
  /**
   * Standalone front-door scene a newly created game starts on. Journey games
   * omit this and use the default main-menu scene; the journey router ignores
   * the front-door slice entirely.
   */
  frontDoorEntry?: "main" | "loading" | "tutorial";
  /**
   * Fold-relevant content parameters, pinned at game creation so a stored game
   * always folds the content it was created with. A build whose content
   * differs is gated out of the game (see the config gate in src/App.tsx).
   */
  contentConfig: ContentConfig;
}

/**
 * A genesis as decoded from storage. Games written before content pinning
 * carry a partial content configuration or none at all; such a game reaches
 * the config gate, and only a genesis narrowed to {@link PinnedGenesis} is
 * folded.
 */
export interface StoredGenesis extends Omit<Genesis, "contentConfig"> {
  contentConfig?: StoredContentConfig;
}

/**
 * The content catalog identities and fixed draft-pool strategy that change how
 * the log folds. A build must match all of it to fold a stored game's log to
 * the same state. Kept as plain strings/numbers so this game-agnostic contracts
 * module stays free of any src/rules or src/runtime import.
 */
export interface ContentConfig {
  poolVariant: PoolVariant;
  /** Atlas generation/reducer content pinned independently of URL settings. */
  atlasFoldHash?: FoldHash;
  /** Site assignments and deterministic site rules pinned for game folding. */
  sitesFoldHash?: FoldHash;
  /** Draft offers, caps, and pool tuning pinned independently of URL settings. */
  draftFoldHash?: FoldHash;
  /** Starter-deck and named gameplay identities derived from card roles. */
  cardRolesFoldHash?: FoldHash;
  /** Economy coefficients and genesis defaults pinned independently of URL settings. */
  economyFoldHash?: FoldHash;
  /** Gamble game rules and economic outcomes. */
  gambleFoldHash?: FoldHash;
  /** Transfiguration predicates, operations, pricing, and benefits. */
  transfigurationFoldHash?: FoldHash;
  /** Shared reward-selection scoring and eligibility tuning. */
  rewardSelectionFoldHash?: FoldHash;
  /** Augury encounter rules, archetype weights, policies, and quantities. */
  auguryFoldHash?: FoldHash;
  /** Exploration effect definitions, defaults, copy, and encounter catalog. */
  explorationFoldHash?: FoldHash;
  /** Tutorial scenario fields which can change reducer outcomes. */
  tutorialFoldHash?: FoldHash;
  opponentsFoldHash?: FoldHash;
  /** Essence a journey starts with before an Avatar is chosen. */
  defaultStartingEssence: number;
  /** Number of Dreamsigns a journey can hold. */
  dreamsignCap: number;
}

/** A stored content configuration, whose economy fields may predate pinning. */
export interface StoredContentConfig
  extends Omit<ContentConfig, "defaultStartingEssence" | "dreamsignCap"> {
  defaultStartingEssence?: number;
  dreamsignCap?: number;
}

export interface PinnedContentConfig extends ContentConfig {
  atlasFoldHash: FoldHash;
  sitesFoldHash: FoldHash;
  draftFoldHash: FoldHash;
  cardRolesFoldHash: FoldHash;
  economyFoldHash: FoldHash;
  gambleFoldHash: FoldHash;
  transfigurationFoldHash: FoldHash;
  rewardSelectionFoldHash: FoldHash;
  auguryFoldHash: FoldHash;
  explorationFoldHash: FoldHash;
  tutorialFoldHash: FoldHash;
  opponentsFoldHash: FoldHash;
}

/** A current game genesis whose fold-relevant content settings are pinned. */
export interface PinnedGenesis extends Genesis {
  contentConfig: PinnedContentConfig;
}

/** Whether a reducer applied an event's effects or bounced it as invalid/stale. */
export type EventOutcome = "applied" | "bounced";

/** Why a bounced event was not applied, for diagnostics and player-facing copy. */
export type BounceReason =
  | "partner_conflict"
  | "unknown_conflict"
  | "prompt_pending"
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
  /** Immutable fold-relevant content configuration from game genesis. */
  contentConfig: ContentConfig;
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
   * assumed to have.
   */
  rng: (drawIndex: number) => number;
  /**
   * Events between this event's `basedOnSeq` and its `seq` that themselves
   * applied — a bounced event changed nothing and can never invalidate a
   * later decision, so bounced events are filtered out before this array
   * is built.
   *
   * The literal string "unknown" (never an empty array) when the events in
   * that window predate the fold's checkpoint horizon and can no longer be
   * enumerated. Reducers must
   * treat "unknown" and `[]` differently: an empty array is a precise
   * claim that nothing intervened, while "unknown" means the window can't
   * be inspected at all.
   */
  intervening: Array<{ seq: number; actor: EventActor; type: EventType }> | "unknown";
  timestamp: string;
}

/**
 * Parameterizes the game-agnostic engine (local-log/fold/hash) over
 * a specific game's fold state `S`. The rules package (src/rules/) supplies
 * one concrete `EngineConfig<FoldState>`; the engine itself never sees `S`'s
 * shape beyond these five functions.
 */
export interface EngineConfig<S> {
  reducer: (state: S, event: GameEvent, ctx: EventContext) => ReducerResult<S>;
  genesisState: (genesis: Genesis) => S;
  /** For checkpoints and save files. */
  encode: (s: S) => string;
  decode: (raw: string) => S;
  hash: (s: S) => StateHash;
}
