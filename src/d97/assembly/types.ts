// The assembled act (Appendix B §B4, §B5, §B7) as the run stores it, the
// catalog assembly draws from, and the act shape it draws to. The act is
// plain JSON-safe data written into run state when the run starts and never
// re-derived on load (decision P5); every reference in it is a UUID.

import type { D97TilesetCategory } from "../../content/d97/dreams/tilesets";
import type { D97CatalogDream, D97DreamDefinition, D97DreamPersona, D97DreamQuest } from "../../content/d97/dreams/schema";
import type {
  AvatarId,
  D97ActId,
  D97CharacterId,
  D97DialogueId,
  D97DreamId,
  D97QuestId,
  D97QuestStepId,
  D97RoomId,
  DreamAnchorId,
} from "../../types/identifiers";
import type { DreamAnchorKind } from "../map/definition";

/** One end of a door: a door anchor in one of the act's dreams. */
export interface D97DoorEnd {
  readonly dreamId: D97DreamId;
  readonly anchorId: DreamAnchorId;
}

/**
 * Two doors joined both ways. A `tree` door belongs to the act's spanning
 * tree: `from` is on the side of the entry dream, and `to` is the town door of
 * the dream it leads into (decision P33). A `loop` door joins two dreams the
 * tree already connects.
 */
export interface D97DoorLink {
  readonly kind: "tree" | "loop";
  readonly from: D97DoorEnd;
  readonly to: D97DoorEnd;
}

/**
 * What a guardian anchor of the act holds (§B4 steps 4–5): the incarnation,
 * an Avatar guardian on the chokepoint every route passes (`chokepoint`), an
 * optional Avatar guardian, or nothing (its corridor stays open). An
 * `authored` seat is held by the guardian its dream module seats there;
 * otherwise the character is picked by the incarnation and guardian rules.
 */
export interface D97GuardianSeat {
  readonly dreamId: D97DreamId;
  readonly anchorId: DreamAnchorId;
  readonly seat: "incarnation" | "chokepoint" | "optional" | "empty";
  readonly authored: boolean;
}

/**
 * Who stands at a challenger anchor of the act (§B7): the challenger its
 * dream module seats there, or a generic challenger assembly placed, with a
 * persona of the dream and a deck source Avatar.
 */
export type D97ChallengerOccupant =
  | { readonly kind: "resident" }
  | {
      readonly kind: "generic";
      readonly characterId: D97CharacterId;
      readonly dialogueId: D97DialogueId | null;
      readonly deckSourceAvatarId: AvatarId;
    };

export interface D97ChallengerSeat {
  readonly dreamId: D97DreamId;
  readonly anchorId: DreamAnchorId;
  readonly occupant: D97ChallengerOccupant;
}

/** One role of a quest bound to an anchor of one of the act's dreams (§B15). */
export interface D97QuestRoleBinding {
  readonly role: "giver" | "turnIn" | "step";
  /** The step the role targets; null for the giver and the turn-in. */
  readonly stepId: D97QuestStepId | null;
  readonly dreamId: D97DreamId;
  readonly anchorId: DreamAnchorId;
}

export interface D97QuestBinding {
  readonly questId: D97QuestId;
  readonly roles: readonly D97QuestRoleBinding[];
}

/**
 * Why an act is its start dream alone: the catalog cannot supply the act's
 * shape (`shortCatalog`), the run started in a dream outside the catalog
 * (`startOutsideCatalog`, a development or synthetic dream), or the run was
 * saved before act assembly (`preAssemblySave`, given its act on load).
 */
export type D97ActFallback = "shortCatalog" | "startOutsideCatalog" | "preAssemblySave";

/** One assembled act of a run. */
export interface D97Act {
  readonly actId: D97ActId;
  /** The act's number, 1 for Act 1. */
  readonly number: number;
  /** The seed salt of the attempt that assembled it; 0 for a one-dream act. */
  readonly salt: number;
  /** Why the act is its start dream alone, or null for an assembled act. */
  readonly fallback: D97ActFallback | null;
  /** The dream the act is entered through: the start dream, in Act 1. */
  readonly entryDreamId: D97DreamId;
  /** The dream whose guardian anchor seats the incarnation. */
  readonly incarnationDreamId: D97DreamId;
  /** The act's dreams, the entry dream first, in draw order. */
  readonly dreamIds: readonly D97DreamId[];
  readonly doors: readonly D97DoorLink[];
  /** The door the incarnation blocks, which leads out of the act. */
  readonly exitDoor: D97DoorEnd;
  /** Every guardian anchor of the act's dreams, in dream order. */
  readonly guardians: readonly D97GuardianSeat[];
  /** Every challenger anchor of the act's dreams that holds a challenger, in dream order. */
  readonly challengers: readonly D97ChallengerSeat[];
  /** Every quest of the act's dreams, its roles bound. */
  readonly quests: readonly D97QuestBinding[];
}

// --- Assembly input -------------------------------------------------------

interface CountBounds {
  readonly min: number;
  readonly max: number;
}

/** The act shape assembly draws to (`src/content/d97/acts.ts`). */
export interface D97ActShape {
  readonly dreams: CountBounds;
  readonly challengerAnchors: CountBounds;
  readonly minCategories: number;
  readonly minGuardianAnchors: number;
  /** `g`: the Avatar guardians every route from the entry dream to the incarnation passes. */
  readonly chokepointGuardians: number;
  readonly avatarGuardians: CountBounds;
  readonly loopDoors: CountBounds;
  /** Seed salts tried, 0 first, before assembly fails. */
  readonly retryLimit: number;
}

/** One anchor of a dream's maps, as assembly reads it. */
export interface D97ActAnchor {
  readonly id: DreamAnchorId;
  readonly kind: DreamAnchorKind;
  /** The room it stands in, or null on the dream's own map. */
  readonly roomId: D97RoomId | null;
  /** A guardian's blocked door. */
  readonly blocksDoor?: DreamAnchorId;
}

/** One dream assembly may place: its module, its tileset's category and its maps' anchors. */
export interface D97ActCatalogDream {
  readonly dream: D97CatalogDream;
  readonly category: D97TilesetCategory;
  readonly anchors: readonly D97ActAnchor[];
}

/** What assembly draws an act from. */
export interface D97ActCatalog {
  /** The dream catalog, in catalog order. */
  readonly dreams: readonly D97ActCatalogDream[];
  /** The Avatars a generic challenger's deck may be built from, in a stable order. */
  readonly deckSourceAvatarIds: readonly AvatarId[];
}

/** A dream a one-dream act plays: a catalog dream, or a development or synthetic one. */
export interface D97ActStartDream {
  readonly dream: D97DreamDefinition;
  readonly anchors: readonly D97ActAnchor[];
  /** The personas its generic challengers may take; none for a dream outside the catalog. */
  readonly personas: readonly D97DreamPersona[];
  /** Its quests; none for a dream outside the catalog. */
  readonly quests: readonly D97DreamQuest[];
}
