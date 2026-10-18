// The D97 dream module (decision P18): a dream's map and the residents who
// stand at its character anchors, keyed by anchor UUID. A dream module sits
// beside its brief (`<dream-uuid>.md`) as `<dream-uuid>.ts` and is registered
// in `./index.ts`. Dreams are unnamed (decision P10), so a module carries no
// name; its characters, quests and items carry theirs.
//
// A resident names its role, which must equal its anchor's kind on the map;
// its look (a character recipe), its scale and the dialogue module it speaks.
// An Avatar challenger or guardian instead lists its incarnations, each an
// Avatar with that Avatar's look and dialogue; `incarnationFor` picks the one
// a run meets.
// Shop, challenger and guardian badges derive from the role; a resident sets
// `badge` only for a badge its role does not derive (a prize duel, a sage). A
// challenger or guardian also declares the deck it fights with; the encounter
// rules read those declarations through `../challengers.ts`.
//
// A dream module also declares its topology (Appendix B §B5, §B6): its
// waypoint, the door a new run arrives through, its exit door with the
// guardian blocking it, and its shop. The travel and shop rules resolve these
// anchors in the run's own dream only (`runDreamAnchor` in
// src/rules/d97/d97-dreams.ts).

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
 * One Avatar an Avatar resident may appear as: that Avatar's character
 * recipe (`../characters/avatars/`) and the dialogue it speaks, if any.
 */
export interface D97Incarnation {
  readonly avatarId: AvatarId;
  readonly characterId: D97CharacterId;
  readonly dialogueId?: D97DialogueId;
}

/**
 * A challenger's or guardian's deck. A generic character fights with a deck
 * built from its deck source Avatar's tide set and never has an Avatar
 * ability; an Avatar resident appears, speaks and fights as the first of its
 * incarnations whose Avatar the player is not playing (Appendix B §B9, §B11).
 */
export type D97ChallengerDeck =
  | { readonly kind: "generic"; readonly deckSourceAvatarId: AvatarId }
  | { readonly kind: "avatar"; readonly incarnations: readonly [D97Incarnation, ...D97Incarnation[]] };

interface D97DreamResidentBase {
  readonly anchorId: DreamAnchorId;
  readonly scale: OccupantScale;
  /** A badge the role does not derive; omitted, the role's badge shows. */
  readonly badge?: BadgeKind;
}

/** A resident with one look: its character recipe and the dialogue it speaks. */
interface D97ResidentLook {
  readonly characterId: D97CharacterId;
  /** The dialogue module the resident speaks, if any. */
  readonly dialogueId?: D97DialogueId;
}

type D97BattleRole = "challenger" | "guardian";

/** A generic challenger or guardian: one look, a deck from its deck source. */
interface D97GenericBattleResident extends D97DreamResidentBase, D97ResidentLook {
  readonly role: D97BattleRole;
  readonly deck: Extract<D97ChallengerDeck, { readonly kind: "generic" }>;
}

/** An Avatar challenger or guardian: each incarnation carries its own look. */
interface D97AvatarBattleResident extends D97DreamResidentBase {
  readonly role: D97BattleRole;
  readonly deck: Extract<D97ChallengerDeck, { readonly kind: "avatar" }>;
  readonly characterId?: never;
  readonly dialogueId?: never;
}

/** A resident who fights: a challenger, or a guardian blocking a door. */
export type D97BattleResident = D97GenericBattleResident | D97AvatarBattleResident;

/** A resident who does not fight: the shopkeeper, a friendly, a townsperson. */
export interface D97CivilResident extends D97DreamResidentBase, D97ResidentLook {
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

/**
 * Who `resident` is in a run whose player plays `runAvatarId`: the character
 * drawn, the dialogue spoken and the Avatar fought as (null for a resident
 * who does not fight). An Avatar resident is its first incarnation whose
 * Avatar the player is not playing, or its first when the player plays them
 * all. The encounter rules, the drawn occupants and the dialogue speaker
 * lookup all read a resident through this, so its look, lines and deck agree.
 */
export interface D97ResidentIncarnation {
  readonly characterId: D97CharacterId;
  readonly dialogueId: D97DialogueId | null;
  readonly avatarId: AvatarId | null;
}

function isAvatarResident(resident: D97DreamResident): resident is D97AvatarBattleResident {
  return (resident.role === "challenger" || resident.role === "guardian") && resident.deck.kind === "avatar";
}

export function incarnationFor(resident: D97DreamResident, runAvatarId: AvatarId): D97ResidentIncarnation {
  if (isAvatarResident(resident)) {
    const { incarnations } = resident.deck;
    const chosen = incarnations.find((incarnation) => incarnation.avatarId !== runAvatarId) ?? incarnations[0];
    return { characterId: chosen.characterId, dialogueId: chosen.dialogueId ?? null, avatarId: chosen.avatarId };
  }
  const avatarId = resident.role === "challenger" || resident.role === "guardian" ? resident.deck.deckSourceAvatarId : null;
  return { characterId: resident.characterId, dialogueId: resident.dialogueId ?? null, avatarId };
}

/** A look a resident may show: its character, its dialogue and the Avatar it portrays, if any. */
export interface D97ResidentLookCandidate {
  readonly characterId: D97CharacterId;
  readonly dialogueId: D97DialogueId | null;
  readonly portrays: AvatarId | null;
}

/**
 * Every look `resident` may show across runs: its one look, or each of its
 * incarnations'. The validators check each against the catalogs.
 */
export function residentLooks(resident: D97DreamResident): readonly D97ResidentLookCandidate[] {
  if (isAvatarResident(resident)) {
    return resident.deck.incarnations.map(({ avatarId, characterId, dialogueId }) => ({
      characterId,
      dialogueId: dialogueId ?? null,
      portrays: avatarId,
    }));
  }
  return [{ characterId: resident.characterId, dialogueId: resident.dialogueId ?? null, portrays: null }];
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
