// The dreams the D97 rules know: each registered dream with its own
// challenger and speaker maps (`registerDream`), and `runDreamAnchor`, the one
// way a rule reads an anchor. Every shop, travel, encounter and
// dialogue-effect case resolves its payload's anchor in the run's own dream,
// so an intent at another registered dream's anchor bounces. A dream's rooms
// (decision P19) are part of it: their anchors register with the dream's
// (`dreamMapAnchors`), each with its room, and an anchor resolves only on the
// map the player is on, so an intent at a room's anchor bounces outside the
// room and a dream-map anchor bounces inside one.
//
// This module obeys the src/rules/ lint rails: no React, no live clock or rng.

import { dreamChallengers } from "../../content/d97/challengers";
import type { D97DialogueModule } from "../../content/d97/dialogue/schema";
import { incarnationFor, type D97DreamDefinition } from "../../content/d97/dreams/schema";
import type { DreamAnchorKind } from "../../d97/map/definition";
import type { AvatarId, D97DialogueId, D97RoomId, DreamAnchorId, DreamMapId } from "../../types/identifiers";
import type { D97ContentProvider, D97RegisteredAnchor, D97RegisteredDream } from "./d97-content";
import { d97RunRoomId, type D97Run } from "./d97-state";

/**
 * Every anchor of `dream`'s maps, each with the room it stands in: its own
 * map's (`roomId` null), then each room's, in room order. `anchorsOf` reads a
 * map module's anchors; a map it does not know contributes none.
 */
export function dreamMapAnchors<Anchor extends { readonly id: DreamAnchorId; readonly kind: DreamAnchorKind }>(
  dream: D97DreamDefinition,
  anchorsOf: (mapId: DreamMapId) => readonly Anchor[] | undefined,
): (Anchor & Pick<D97RegisteredAnchor, "roomId">)[] {
  return [
    ...(anchorsOf(dream.mapId) ?? []).map((anchor) => ({ ...anchor, roomId: null })),
    ...dream.rooms.flatMap((room) => (anchorsOf(room.mapId) ?? []).map((anchor) => ({ ...anchor, roomId: room.id }))),
  ];
}

/**
 * Register `dream` over its maps' `anchors` (`dreamMapAnchors`): its challengers by anchor, and
 * the lookup of the dialogue among `dialogues` that the resident at an anchor
 * speaks to a run playing a given Avatar (its incarnation's, for an Avatar
 * resident; a resident whose dialogue is unregistered does not speak).
 */
export function registerDream(
  dream: D97DreamDefinition,
  anchors: readonly D97RegisteredAnchor[],
  dialogues: ReadonlyMap<D97DialogueId, D97DialogueModule>,
): D97RegisteredDream {
  const residents = new Map(dream.residents.map((resident) => [resident.anchorId, resident]));
  const speakerDialogue = (anchorId: DreamAnchorId, runAvatarId: AvatarId): D97DialogueModule | null => {
    const resident = residents.get(anchorId);
    const dialogueId = resident === undefined ? null : incarnationFor(resident, runAvatarId).dialogueId;
    return (dialogueId === null ? undefined : dialogues.get(dialogueId)) ?? null;
  };
  const { topology } = dream;
  // Declared anchors stand on the dream's map until a room or a map places them.
  const anchorRooms = new Map<DreamAnchorId, D97RoomId | null>();
  for (const id of [
    topology.waypointAnchorId,
    topology.arrivalDoorAnchorId,
    topology.exitDoorAnchorId,
    topology.exitGuardianAnchorId,
    topology.shopAnchorId,
    ...dream.residents.map((resident) => resident.anchorId),
  ]) {
    anchorRooms.set(id, null);
  }
  for (const room of dream.rooms) {
    anchorRooms.set(room.buildingDoorAnchorId, null);
    anchorRooms.set(room.doorAnchorId, room.id);
  }
  for (const anchor of anchors) anchorRooms.set(anchor.id, anchor.roomId);
  return {
    definition: dream,
    anchors,
    anchorRooms,
    rooms: new Map(dream.rooms.map((room) => [room.id, room])),
    challengers: dreamChallengers(dream),
    speakerDialogue,
  };
}

/**
 * The run's registered dream when it declares `anchorId` on the map the
 * player is on (the dream's own map, or the room of the run's last place,
 * `d97RunRoomId`), or null: for an unregistered dream, a missing anchor, an
 * anchor of any other dream, or one on the dream's other map.
 */
export function runDreamAnchor(
  run: D97Run,
  content: D97ContentProvider,
  anchorId: DreamAnchorId | null,
): D97RegisteredDream | null {
  const dream = content.dreams.get(run.dreamId);
  if (anchorId === null || dream === undefined) return null;
  const roomId = dream.anchorRooms.get(anchorId);
  return roomId !== undefined && roomId === d97RunRoomId(run) ? dream : null;
}
