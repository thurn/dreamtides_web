// Synthetic D97 dreams for node tests: two dreams with disjoint anchors, each
// with a full topology (waypoint, arrival door, exit door, exit guardian,
// shop), two challengers, a guardian and a shopkeeper. Every id is a test
// UUID, so rules tests never read a production dream.

import { defineDream, type D97DreamDefinition, type D97DreamResident } from "../../content/d97/dreams/schema";
import type { D97RegisteredAnchor } from "./d97-content";
import {
  parseD97CharacterId,
  parseD97DreamId,
  parseDreamAnchorId,
  parseDreamMapId,
  type D97DialogueId,
  type DreamAnchorId,
} from "../../types/identifiers";
import { testAvatarId } from "../../types/test-identities";

const hex = (value: number, width: number) => value.toString(16).padStart(width, "0");

/** Anchor `index` of synthetic dream `dream`. */
export function syntheticDreamAnchor(dream: number, index: number): DreamAnchorId {
  return parseDreamAnchorId(`d97a${hex(dream, 4)}-0000-4000-8000-${hex(index, 12)}`);
}

/** A synthetic character look; the synthetic content never draws it. */
export const SYNTHETIC_CHARACTER = parseD97CharacterId("d97c0000-0000-4000-8000-000000000001");

/** A deck source Avatar the synthetic opponent decks name. */
export const SYNTHETIC_DECK_AVATAR = testAvatarId("d97-synthetic-deck-avatar");

/** A resident at `anchorId` speaking `dialogueId`. */
export function speakingResident(
  anchorId: DreamAnchorId,
  dialogueId: D97DialogueId,
  role: "friendly" | "townsfolk" | "shop" = "friendly",
): D97DreamResident {
  return { role, anchorId, characterId: SYNTHETIC_CHARACTER, scale: "standard", dialogueId };
}

/**
 * Synthetic dream `index`: anchors 1–5 are its topology (waypoint, arrival
 * door, exit door, guardian, shop), 6 and 7 its challengers; `residents` join
 * the guardian, challengers and shopkeeper.
 */
export function syntheticDream(index: number, residents: readonly D97DreamResident[] = []): D97DreamDefinition {
  const anchor = (n: number) => syntheticDreamAnchor(index, n);
  const deck = { kind: "generic", deckSourceAvatarId: SYNTHETIC_DECK_AVATAR } as const;
  return defineDream({
    id: parseD97DreamId(`d97d${hex(index, 4)}-0000-4000-8000-000000000000`),
    mapId: parseDreamMapId(`d97e${hex(index, 4)}-0000-4000-8000-000000000000`),
    topology: {
      waypointAnchorId: anchor(1),
      arrivalDoorAnchorId: anchor(2),
      exitDoorAnchorId: anchor(3),
      exitGuardianAnchorId: anchor(4),
      shopAnchorId: anchor(5),
    },
    residents: [
      { role: "challenger", anchorId: anchor(6), characterId: SYNTHETIC_CHARACTER, scale: "standard", deck },
      { role: "challenger", anchorId: anchor(7), characterId: SYNTHETIC_CHARACTER, scale: "standard", deck },
      { role: "guardian", anchorId: anchor(4), characterId: SYNTHETIC_CHARACTER, scale: "incarnation", deck: { kind: "avatar", avatarIds: [SYNTHETIC_DECK_AVATAR] } },
      { role: "shop", anchorId: anchor(5), characterId: SYNTHETIC_CHARACTER, scale: "standard" },
      ...residents,
    ],
  });
}

/** The default dream of the synthetic content: a run starts here. */
export const SYNTHETIC_DREAM_A = syntheticDream(1);

/** A second registered dream, whose anchors a run in dream A never reaches. */
export const SYNTHETIC_DREAM_B = syntheticDream(2);

/**
 * The anchors a synthetic dream's map would declare: its topology's and its
 * residents', each of the kind its role names.
 */
export function syntheticDreamAnchors(dream: D97DreamDefinition): D97RegisteredAnchor[] {
  const { topology } = dream;
  const anchors = new Map<DreamAnchorId, D97RegisteredAnchor["kind"]>([
    [topology.waypointAnchorId, "waypoint"],
    [topology.arrivalDoorAnchorId, "door"],
    [topology.exitDoorAnchorId, "door"],
    [topology.exitGuardianAnchorId, "guardian"],
    [topology.shopAnchorId, "shop"],
  ]);
  for (const resident of dream.residents) anchors.set(resident.anchorId, resident.role);
  return [...anchors].map(([id, kind]) => ({ id, kind }));
}
