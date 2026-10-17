// The D97 dream module (decision P18): a dream's map and the residents who
// stand at its character anchors, keyed by anchor UUID. A dream module sits
// beside its brief (`<dream-uuid>.md`) as `<dream-uuid>.ts` and is registered
// in `./index.ts`. Dreams are unnamed (decision P10), so a module carries no
// name; its characters, quests and items carry theirs.
//
// A resident names its role, which must equal its anchor's kind on the map;
// its look (a character recipe), its scale and the dialogue module it speaks.
// Shop, challenger and guardian badges derive from the role; a resident sets
// `badge` only for a badge its role does not derive (a prize duel, a sage). A
// challenger or guardian also declares the deck it fights with; the encounter
// rules read those declarations through `../challengers.ts`.
//
// A dream module also declares its topology (Appendix B §B5, §B6): its
// waypoint, the door a new run arrives through, its exit door with the
// guardian blocking it, and its shop. The travel and shop rules find a dream
// by these anchors (`d97DreamByAnchor` in `./index.ts`).

import type { BadgeKind } from "../../../d97/overworld/characters/badges";
import type { OccupantScale } from "../../../d97/overworld/occupants";
import type {
  AvatarId,
  D97CharacterId,
  D97DialogueId,
  D97DreamId,
  DreamAnchorId,
  DreamMapId,
} from "../../../types/identifiers";

/**
 * A challenger's or guardian's deck. A generic character fights with a deck
 * built from its deck source Avatar's tide set and never has an Avatar
 * ability; an Avatar character fights as its own Avatar, the first of its
 * Avatars the player is not playing (Appendix B §B9, §B11).
 */
export type D97ChallengerDeck =
  | { readonly kind: "generic"; readonly deckSourceAvatarId: AvatarId }
  | { readonly kind: "avatar"; readonly avatarIds: readonly AvatarId[] };

interface D97DreamResidentBase {
  readonly anchorId: DreamAnchorId;
  readonly characterId: D97CharacterId;
  readonly scale: OccupantScale;
  /** A badge the role does not derive; omitted, the role's badge shows. */
  readonly badge?: BadgeKind;
  /** The dialogue module the resident speaks, if any. */
  readonly dialogueId?: D97DialogueId;
}

/** A resident who fights: a challenger, or a guardian blocking a door. */
export interface D97BattleResident extends D97DreamResidentBase {
  readonly role: "challenger" | "guardian";
  readonly deck: D97ChallengerDeck;
}

/** A resident who does not fight: the shopkeeper, a friendly, a townsperson. */
export interface D97CivilResident extends D97DreamResidentBase {
  readonly role: "shop" | "friendly" | "townsfolk";
}

export type D97DreamResident = D97BattleResident | D97CivilResident;

/** The anchor kinds residents stand at. */
export type D97ResidentRole = D97DreamResident["role"];

/** A dream's travel anchors, by anchor UUID on its map. */
export interface D97DreamTopology {
  /** The dream's one waypoint. */
  readonly waypointAnchorId: DreamAnchorId;
  /** The door a new run arrives through. */
  readonly arrivalDoorAnchorId: DreamAnchorId;
  /** The exit door: stepping through it after its guardian falls ends the slice. */
  readonly exitDoorAnchorId: DreamAnchorId;
  /** The guardian anchor standing at the exit door's chokepoint. */
  readonly exitGuardianAnchorId: DreamAnchorId;
  /** The dream's one shop. */
  readonly shopAnchorId: DreamAnchorId;
}

export interface D97DreamDefinition {
  readonly id: D97DreamId;
  /** The dream's map module (`src/content/d97/maps/`). */
  readonly mapId: DreamMapId;
  readonly topology: D97DreamTopology;
  /** At most one resident per anchor; an anchor without one stays empty. */
  readonly residents: readonly D97DreamResident[];
}

/** Declare a dream module. */
export function defineDream(dream: D97DreamDefinition): D97DreamDefinition {
  return dream;
}

/** The badge `role` shows unless its resident sets one. */
export function derivedBadge(role: D97ResidentRole): BadgeKind | null {
  switch (role) {
    case "challenger":
      return "challenger";
    case "guardian":
      return "boss";
    case "shop":
      return "shop";
    case "friendly":
    case "townsfolk":
      return null;
  }
}
