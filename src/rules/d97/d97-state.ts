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
import type { D97QuestState } from "../../d97/quests/types";
import type { CardId } from "../../types/card-identity";
import type {
  AvatarId,
  D97CharacterId,
  D97DreamId,
  D97FlagId,
  D97OwnedCopyId,
  D97RunId,
  D97RunSeed,
  DreamAnchorId,
  DreamsignId,
} from "../../types/identifiers";

/** The D97 screen the run currently shows. */
export type D97Screen =
  | { readonly type: "avatarSelect" }
  | { readonly type: "overworld" }
  /** The end of the M1 slice, reached through the exit door. */
  | { readonly type: "sliceEnd" };

/**
 * The last door the player stepped through or waypoint they used, whichever
 * was later (Appendix B §B17): a reload places the player there.
 */
export interface D97Place {
  readonly kind: "door" | "waypoint";
  readonly anchorId: DreamAnchorId;
}

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
  /**
   * The dream the run is in: the dream it started in, recorded by
   * `D97_START_RUN`. The overworld plays this dream; travel between dreams
   * (Phase 3) moves it.
   */
  readonly dreamId: D97DreamId;
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
  /**
   * The anchor the player returns beside after its battle, until they next
   * use a door or waypoint.
   */
  readonly returnAnchorId: DreamAnchorId | null;
  /** The held quest, finished quests, a pending reward and quest items. */
  readonly quests: D97QuestState;
  /** Story flags dialogue has set, in the order they were set. */
  readonly flags: readonly D97FlagId[];
  /** Activated waypoints, in activation order. */
  readonly activeWaypointIds: readonly DreamAnchorId[];
  /** Where a reload places the player; null before any door or waypoint use. */
  readonly lastPlace: D97Place | null;
  /** Every shop opened so far, by its shop anchor. */
  readonly shops: Readonly<Partial<Record<DreamAnchorId, D97Shop>>>;
}

/** One shop slot: its card and the quote fixed when it was rolled (Appendix A §A6). */
export interface D97ShopSlot {
  readonly cardId: CardId;
  readonly price: number;
  /** Bought: the slot stays empty until the next restock. */
  readonly purchased: boolean;
}

/** A dream's shop, rolled when it is first opened and on each restock. */
export interface D97Shop {
  readonly slots: readonly D97ShopSlot[];
  /** Whether this visit's one restock is spent; a visit ends when the player leaves the dream. */
  readonly restockedThisVisit: boolean;
  /** Stock rolls so far: the first open, then each restock. */
  readonly rolls: number;
}

/**
 * The act `run` is in: M1 runs play the first act (decision P7), and act
 * progression arrives with act assembly. Every act-dependent rule and view
 * reads it here.
 */
export function d97RunAct(_run: D97Run): number {
  return 1;
}

/** The challenger and guardian anchors `run` has beaten (its encounters). */
export function d97BeatenAnchorIds(run: D97Run): DreamAnchorId[] {
  return Object.values(run.encounters).flatMap((encounter) =>
    encounter?.beaten === true ? [encounter.anchorId] : [],
  );
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
