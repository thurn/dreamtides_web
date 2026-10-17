// The first dream: the hill town of its brief
// (`./3229d6c7-0700-4f37-9b07-921e3dccb8b6.md`) on its map
// (`../maps/3229d6c7-0700-4f37-9b07-921e3dccb8b6.ts`). Its residents are
// written against the brief; until they are, its character anchors stand
// empty.

import { parseD97DreamId, parseDreamAnchorId, parseDreamMapId } from "../../../types/identifiers";
import { defineDream } from "./schema";

export default defineDream({
  id: parseD97DreamId("3229d6c7-0700-4f37-9b07-921e3dccb8b6"),
  mapId: parseDreamMapId("3229d6c7-0700-4f37-9b07-921e3dccb8b6"),
  topology: {
    waypointAnchorId: parseDreamAnchorId("d01c6e03-c291-4164-a3ec-50393ed0c817"),
    // The low cave, the map's first door.
    arrivalDoorAnchorId: parseDreamAnchorId("c9f6d615-0e4c-465b-a990-7bd30bdb0fc8"),
    // The ember arch and the guardian filling its mouth.
    exitDoorAnchorId: parseDreamAnchorId("2ef5689f-f791-402c-9cc6-6e59cf0c5e14"),
    exitGuardianAnchorId: parseDreamAnchorId("649daef4-9f8b-4e0e-b3f2-3d2ab91a844d"),
    // The barrel stall.
    shopAnchorId: parseDreamAnchorId("9823fdb3-fff7-4dda-8d86-230b0109e7a3"),
  },
  residents: [],
});
