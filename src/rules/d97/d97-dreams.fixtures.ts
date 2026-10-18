// Synthetic D97 dreams for node tests: two dreams with disjoint anchors, each
// with a full topology (waypoint, arrival door, exit door, exit guardian,
// shop), two challengers, a guardian, a shopkeeper and one room behind a
// building door. Every id is a test UUID, so rules tests never read a
// production dream.

import { defineDream, type D97DreamDefinition, type D97DreamResident } from "../../content/d97/dreams/schema";
import type { D97RegisteredAnchor } from "./d97-content";
import {
  parseD97CharacterId,
  parseD97DreamId,
  parseD97RoomId,
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

/** The first anchor index inside a synthetic dream's room. */
const ROOM_ANCHOR_BASE = 0x100;

/** Anchor `index` inside synthetic dream `dream`'s room; index 0 is the room's door. */
export function syntheticRoomAnchor(dream: number, index: number): DreamAnchorId {
  return syntheticDreamAnchor(dream, ROOM_ANCHOR_BASE + index);
}

/** Whether `anchorId` is a synthetic dream's room anchor (`syntheticRoomAnchor`). */
function isSyntheticRoomAnchor(anchorId: DreamAnchorId): boolean {
  return /^d97a[0-9a-f]{4}-0000-4000-8000-/u.test(anchorId) && Number.parseInt(anchorId.slice(-12), 16) >= ROOM_ANCHOR_BASE;
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
 * door, exit door, guardian, shop), 6 and 7 its challengers, 0x50 the building
 * door into its room, whose own door is room anchor 0
 * (`syntheticRoomAnchor`); `residents` join the guardian, challengers and
 * shopkeeper, and stand in the room at room anchors.
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
    rooms: [
      {
        id: parseD97RoomId(`d97f${hex(index, 4)}-0000-4000-8000-000000000000`),
        mapId: parseDreamMapId(`d97b${hex(index, 4)}-0000-4000-8000-000000000000`),
        buildingDoorAnchorId: anchor(0x50),
        doorAnchorId: syntheticRoomAnchor(index, 0),
      },
    ],
    residents: [
      { role: "challenger", anchorId: anchor(6), characterId: SYNTHETIC_CHARACTER, scale: "standard", deck },
      { role: "challenger", anchorId: anchor(7), characterId: SYNTHETIC_CHARACTER, scale: "standard", deck },
      {
        role: "guardian",
        anchorId: anchor(4),
        scale: "incarnation",
        deck: { kind: "avatar", incarnations: [{ avatarId: SYNTHETIC_DECK_AVATAR, characterId: SYNTHETIC_CHARACTER }] },
      },
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
 * The anchors a synthetic dream's maps would declare: its topology's, its
 * rooms' doors and its residents', each of the kind its role names, in the
 * room its id places it.
 */
export function syntheticDreamAnchors(dream: D97DreamDefinition): D97RegisteredAnchor[] {
  const { topology } = dream;
  const firstRoom = dream.rooms[0]?.id ?? null;
  const roomOf = (anchorId: DreamAnchorId) => (isSyntheticRoomAnchor(anchorId) ? firstRoom : null);
  const anchors = new Map<DreamAnchorId, D97RegisteredAnchor>();
  const add = (id: DreamAnchorId, kind: D97RegisteredAnchor["kind"], roomId = roomOf(id)) => anchors.set(id, { id, kind, roomId });
  add(topology.waypointAnchorId, "waypoint");
  add(topology.arrivalDoorAnchorId, "door");
  add(topology.exitDoorAnchorId, "door");
  add(topology.exitGuardianAnchorId, "guardian");
  add(topology.shopAnchorId, "shop");
  for (const room of dream.rooms) {
    add(room.buildingDoorAnchorId, "buildingDoor", null);
    add(room.doorAnchorId, "buildingDoor", room.id);
  }
  for (const resident of dream.residents) add(resident.anchorId, resident.role);
  return [...anchors.values()];
}
