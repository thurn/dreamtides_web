// The D97 room cases (decision P19, Appendix B §B17): stepping through a
// building door into one of the dream's rooms, and back out. A room belongs to
// its dream, so its doors resolve in the run's own dream (`runDreamAnchor`).
// Each passage records the door the player comes out of as the run's last
// place, with the room it is in: a reload inside a room places the player at
// the room's door, and the place's room is the map the overworld plays
// (`d97RunRoomId`).
//
// This module obeys the src/rules/ lint rails: no React, no live clock or rng.

import type { D97DreamRoom } from "../../content/d97/dreams/schema";
import type { DreamAnchorId } from "../../types/identifiers";
import { d97ContentProvider } from "./d97-content";
import { runDreamAnchor } from "./d97-dreams";
import type { D97Transition } from "./d97-run";
import { d97RunRoomId, type D97Run } from "./d97-state";
import type { D97RunInput } from "./events/spec";

/**
 * Where stepping through the building door at an anchor leads: into a room,
 * out of the room the player is in, or nowhere. `noRoom`: no room of the
 * dream has a door there. `notHere`: the door is a room's, but not on the map
 * the player is on.
 */
export type D97RoomPassage =
  | { readonly kind: "enter" | "leave"; readonly room: D97DreamRoom }
  | { readonly kind: "refused"; readonly refusal: "noRoom" | "notHere" };

/** Where the building door at `anchorId` leads for `run`, among its dream's `rooms`. */
export function roomPassage(run: D97Run, rooms: readonly D97DreamRoom[], anchorId: DreamAnchorId): D97RoomPassage {
  const roomId = d97RunRoomId(run);
  const current = roomId === null ? undefined : rooms.find((room) => room.id === roomId);
  if (current?.doorAnchorId === anchorId) return { kind: "leave", room: current };
  const entered = roomId === null ? rooms.find((room) => room.buildingDoorAnchorId === anchorId) : undefined;
  if (entered !== undefined) return { kind: "enter", room: entered };
  const someRoomsDoor = rooms.some((room) => room.buildingDoorAnchorId === anchorId || room.doorAnchorId === anchorId);
  return { kind: "refused", refusal: someRoomsDoor ? "notHere" : "noRoom" };
}

/** The run's dream and the passage through the building door at `anchorId`, or null. */
function passageContext(run: D97Run, anchorId: DreamAnchorId) {
  const content = d97ContentProvider();
  const dream = content === null ? null : runDreamAnchor(run, content, anchorId);
  return dream === null ? null : { dream: dream.definition, passage: roomPassage(run, dream.definition.rooms, anchorId) };
}

/**
 * `D97_ENTER_ROOM { anchorId }`: step through the building door at `anchorId`
 * on the dream's map into its room. The room's own door becomes the reload
 * place.
 */
export function enterRoom({ d97, run }: D97RunInput, { anchorId }: { readonly anchorId: DreamAnchorId }): D97Transition | null {
  const context = passageContext(run, anchorId);
  if (context === null || context.passage.kind !== "enter") return null;
  const { dream, passage: { room } } = context;
  return {
    d97: { ...d97, run: { ...run, lastPlace: { kind: "door", anchorId: room.doorAnchorId, roomId: room.id }, returnAnchorId: null } },
    logRecords: [
      {
        event: "d97_room_entered",
        fields: {
          runId: run.runId,
          dreamId: dream.id,
          roomId: room.id,
          mapId: room.mapId,
          buildingDoorAnchorId: room.buildingDoorAnchorId,
          doorAnchorId: room.doorAnchorId,
        },
      },
    ],
  };
}

/**
 * `D97_LEAVE_ROOM { anchorId }`: step out of the room the player is in through
 * its door at `anchorId`. The building door outside becomes the reload place.
 */
export function leaveRoom({ d97, run }: D97RunInput, { anchorId }: { readonly anchorId: DreamAnchorId }): D97Transition | null {
  const context = passageContext(run, anchorId);
  if (context === null || context.passage.kind !== "leave") return null;
  const { dream, passage: { room } } = context;
  return {
    d97: { ...d97, run: { ...run, lastPlace: { kind: "door", anchorId: room.buildingDoorAnchorId, roomId: null }, returnAnchorId: null } },
    logRecords: [
      {
        event: "d97_room_left",
        fields: {
          runId: run.runId,
          dreamId: dream.id,
          roomId: room.id,
          mapId: dream.mapId,
          buildingDoorAnchorId: room.buildingDoorAnchorId,
          doorAnchorId: room.doorAnchorId,
        },
      },
    ],
  };
}
