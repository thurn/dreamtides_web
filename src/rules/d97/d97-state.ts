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
import type { CardId } from "../../types/card-identity";
import type {
  AvatarId,
  D97CharacterId,
  D97OwnedCopyId,
  D97RunId,
  D97RunSeed,
  DreamAnchorId,
  DreamsignId,
} from "../../types/identifiers";

/** The D97 screen the run currently shows. */
export type D97Screen =
  | { readonly type: "avatarSelect" }
  | { readonly type: "overworld" };

/**
 * A challenger or guardian encounter, fixed when it is first previewed
 * (Appendix A §A9, Appendix B §B9, §B11): the opponent's constructed deck,
 * both antes and the extra are stored, never re-rolled.
 */
export interface D97Encounter {
  readonly anchorId: DreamAnchorId;
  readonly characterId: D97CharacterId;
  readonly role: "challenger" | "guardian";
  /** A generic character (deck source, never an ability) or an Avatar character. */
  readonly kind: "generic" | "avatar";
  readonly tier: number;
  /** The Avatar the deck was built from (an Avatar character's own). */
  readonly avatarId: AvatarId;
  /** Whether the opponent's Avatar ability is active. */
  readonly abilityActive: boolean;
  /** The constructed deck, in pick order. */
  readonly deck: readonly CardId[];
  /** The fixed source pool the deck was built from, for draft effects. */
  readonly draftPool: readonly CardId[];
  readonly dreamsignIds: readonly DreamsignId[];
  readonly signatureCardIds: readonly CardId[];
  readonly scoreToWin: number;
  readonly headStarts: { readonly player: number; readonly opponent: number };
  /** The player's anted copy, or null when the collection is at its floor. */
  readonly playerAnteCopyId: D97OwnedCopyId | null;
  /** The opponent's anted card, or null when its deck has none eligible. */
  readonly opponentAnteCardId: CardId | null;
  /** The advertised extra a win pays; guardians have none. */
  readonly extra: { readonly kind: "essence"; readonly amount: number } | null;
  /** Battles fought against this opponent. */
  readonly battles: number;
  /** Won: the opponent stays as an ordinary character. */
  readonly beaten: boolean;
}

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
  /** Every previewed encounter, by anchor. */
  readonly encounters: Readonly<Partial<Record<DreamAnchorId, D97Encounter>>>;
  /** The anchor the player returns beside after its battle, if any. */
  readonly returnAnchorId: DreamAnchorId | null;
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
