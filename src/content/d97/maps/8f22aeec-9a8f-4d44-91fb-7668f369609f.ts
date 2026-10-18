// The first dream's inn (decision P19): a room behind the inn door on the
// well square (`./3229d6c7-0700-4f37-9b07-921e3dccb8b6.ts`), cropped from
// Source of Tales' Goldenfields pub. Its tap room has three tables, barrels
// and a long bar along the east wall; the storeroom off the west end is
// walled off. A short passage leads south from the tap room to the inn door.
// Wenna Ashdown keeps the dream's shop in front of the bar.

import { defineDreamMap } from "../../../d97/map/definition";
import { parseDreamAnchorId, parseDreamMapId, parseDreamMapSourceHash } from "../../../types/identifiers";

export default defineDreamMap({
  id: parseDreamMapId("8f22aeec-9a8f-4d44-91fb-7668f369609f"),
  source: {
    kind: "tiled",
    path: "source-of-tales/maps/goldenfields/pub.tmx",
    sha256: parseDreamMapSourceHash("ed63196a2e5b72043a6e53696923544363507c35dd553cde288307bdd1488517"),
  },
  recipe: [
    // The source's empty rows below the storeroom.
    { op: "crop", from: [0, 0], to: [20, 13] },
  ],
  regions: [
    { name: "the tap room", from: [1, 2], to: [16, 6], note: "Three tables, the barrels in the west corner." },
    { name: "the bar", from: [15, 7], to: [19, 9], note: "The counter and the snug's table before it." },
  ],
  landmarks: [
    { name: "the inn door", at: [10, 9], note: "The way out to the well square." },
    { name: "the counter", at: [18, 8], note: "In front of the bar." },
  ],
  anchors: [
    { id: parseDreamAnchorId("3d1b6084-0b8f-4c0f-a41d-2b4cad8a9af6"), kind: "buildingDoor", at: { landmark: "the inn door" }, entry: [10, 8] },
    { id: parseDreamAnchorId("9823fdb3-fff7-4dda-8d86-230b0109e7a3"), kind: "shop", at: { landmark: "the counter" } },
  ],
});
