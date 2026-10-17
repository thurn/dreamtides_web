// The Dreamtides 97 slice of the fold state.
//
// A D97 game (genesis `mode: "d97"`) folds its run into `FoldState.d97`; a
// journey game has no `d97` key at all, so journey states, checkpoints and
// their hashes are exactly the journey's. The slice is plain JSON-safe data.
//
// This module obeys the src/rules/ lint rails: no React, no live clock or rng.

import type {
  D97Collection,
  D97RewardBag,
} from "../../d97/collection/types";
import type { AvatarId, D97RunId, D97RunSeed } from "../../types/identifiers";

/** The D97 screen the run currently shows. */
export type D97Screen =
  | { readonly type: "avatarSelect" }
  | { readonly type: "overworld" };

/**
 * A started D97 run: its identity, entropy, chosen Avatar, purse, collection
 * and reward bag.
 */
export interface D97Run {
  readonly runId: D97RunId;
  /** Recorded once when the run starts; generators derive from it. */
  readonly runSeed: D97RunSeed;
  readonly avatarId: AvatarId;
  /** The starting event's timestamp, for diagnostics. */
  readonly startedAt: string;
  /** Spendable Essence. */
  readonly essence: number;
  /** Battles fought so far; each acquisition records it. */
  readonly battlesFought: number;
  /** Every owned copy, in the active deck or the reserve. */
  readonly collection: D97Collection;
  /** The Avatar's reward bag v0, dealt at run start. */
  readonly bag: D97RewardBag;
}

/** Everything a D97 game folds beyond the shared fold-state fields. */
export interface D97State {
  readonly screen: D97Screen;
  /** Null until `D97_START_RUN` applies. */
  readonly run: D97Run | null;
}

/** The slice a new D97 game starts with: Avatar select, no run. */
export function initialD97State(): D97State {
  return { screen: { type: "avatarSelect" }, run: null };
}
