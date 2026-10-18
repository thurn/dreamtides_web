// The D97 room events (cases in ../d97-rooms.ts). Each names the building door
// stepped through. Unkeyed: a passage moves the player to the other map, where
// a repeat through the same door bounces.

import { dreamAnchorIdFromUnknown } from "../../../types/identifiers";
import { enterRoom, leaveRoom } from "../d97-rooms";
import { d97Event, payloadOf } from "./spec";

const doorPayload = payloadOf({ anchorId: dreamAnchorIdFromUnknown });

export const ROOM_EVENTS = {
  D97_ENTER_ROOM: d97Event({ phase: "overworld", parse: doorPayload, fold: enterRoom }),
  D97_LEAVE_ROOM: d97Event({ phase: "overworld", parse: doorPayload, fold: leaveRoom }),
};
