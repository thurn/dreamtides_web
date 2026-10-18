// The oasis dream's map: a 32×24 crop of Source of Tales' Goldenfields
// desert cliffs, where the river comes down the falls. The oasis is the town
// (decision P33): the town door, a little portico in the cliff, opens on the
// palms, the domes, the awning where the shop stands and the waypoint. The
// dream's brief is `../dreams/0a5a7441-da58-417c-8787-4b854f400714.md`;
// every landmark it names is a landmark or region here.
//
// Two broad ways lead out of the oasis: up the cut stair, between its lions,
// to the high ground, where the temple court runs east to the temple
// portico (the exit door, its guardian in the mouth) and on to the rope
// bridge's door, and the high terrace runs west; and east along the oasis
// floor to the falls' foot. The stair, the river shelf and the temple court
// are cut from the cliffs with the source's own sand; the source's oaks give
// way to palms.

import { defineDreamMap, type DreamAnchorDefinition } from "../../../d97/map/definition";
import {
  parseD97StampId,
  parseDreamAnchorId,
  parseDreamMapId,
  parseDreamMapSourceHash,
} from "../../../types/identifiers";

const SAND = parseD97StampId("5ecb3e8c-46d5-408a-ba7c-e2eef373f74a");
const PORTICO = parseD97StampId("4ed63fa9-0ece-432f-ac80-f317dabfbaae");
const ADOBE_DOME = parseD97StampId("70ba8cff-3aad-4f83-af4d-aea70ec52475");
const AWNING = parseD97StampId("58b01d1b-d2d1-4f72-9933-a99491665a86");
const PALM = parseD97StampId("ef928535-7133-4414-8742-8721588270a8");
const TALL_PALM = parseD97StampId("82007c6c-315e-40c5-a919-504c77a7a9c1");
const GUARDIAN_LION = parseD97StampId("d100368c-074a-4821-bb96-219ec04da10d");
const GREAT_RIBCAGE = parseD97StampId("62660de6-d96a-439a-a97f-544b45f24c0c");

const TOWN_DOOR = parseDreamAnchorId("4778d845-4513-4c61-8fa5-1dfc7a70c9a7");
const BRIDGE_DOOR = parseDreamAnchorId("3a921991-cbe9-4ac3-af81-d2c1e7787b56");
const EXIT_DOOR = parseDreamAnchorId("f67306e1-6e5a-4712-adff-7391e86746d6");
const TEMPLE_GUARDIAN = parseDreamAnchorId("6119e753-b347-4fe4-846c-570bffb343d1");

/** Layers the source draws over its characters: treetops and cliff lips. */
const ABOVE_PLAYER_LAYERS = ["Over", "Over1", "Over2", "Over3"];
/** The source's tree layers (trunks, treetops) and its collision. */
const TREE_LAYERS = ["Ground2", "Fringe", "Over", "Over1", "Over2", "Over3", "Collision"];

const ANCHORS: readonly DreamAnchorDefinition[] = [
  // Doors. The town door, where a run arrives, in the little gate; the rope
  // bridge's door over the river; the temple portico, the exit, whose
  // guardian fills its mouth.
  { id: TOWN_DOOR, kind: "door", at: { landmark: "the little gate" }, entry: [5, 19] },
  { id: BRIDGE_DOOR, kind: "door", at: { landmark: "the rope bridge" }, entry: [27, 6] },
  { id: EXIT_DOOR, kind: "door", at: { landmark: "the temple portico" }, entry: [22, 4] },
  { id: TEMPLE_GUARDIAN, kind: "guardian", at: [22, 5], blocksDoor: EXIT_DOOR },

  { id: parseDreamAnchorId("d9451bd2-6447-4a41-b1ea-2daf66f3cb54"), kind: "waypoint", at: [10, 19] },
  { id: parseDreamAnchorId("d5d3658b-6fcf-4e4a-b63f-35bc4578e1e4"), kind: "shop", at: { landmark: "the awning" } },

  // The oasis's friendly places, for its quest givers and the friendly
  // characters assembly places: by the gate, before the west dome, under
  // the stair and beside the south dome.
  { id: parseDreamAnchorId("b9f671bb-477d-49b1-9428-750189d072c5"), kind: "friendly", at: [8, 17], cluster: "oasis" },
  { id: parseDreamAnchorId("5072d343-cc06-43fc-98b4-cdbf59cee51f"), kind: "friendly", at: [3, 20], cluster: "oasis" },
  { id: parseDreamAnchorId("394b59c3-938c-4e70-841e-4f5049006c35"), kind: "friendly", at: [7, 21], cluster: "oasis" },
  { id: parseDreamAnchorId("a67e9472-349a-4232-ae93-f32217ce74ee"), kind: "friendly", at: [12, 21], cluster: "oasis" },

  // Townsfolk: on the lower terrace at the stair's foot, under the tall
  // palm, by the west dome's door, and on the river shelf.
  { id: parseDreamAnchorId("da06c789-d10c-4719-bb29-530f725b3d96"), kind: "townsfolk", at: [11, 13] },
  { id: parseDreamAnchorId("d5dd73d1-48ea-4ff4-80f0-68491f209186"), kind: "townsfolk", at: [15, 20] },
  { id: parseDreamAnchorId("e7f5527d-f923-4344-a354-296258d1aa3a"), kind: "townsfolk", at: [1, 18] },
  { id: parseDreamAnchorId("acd2296b-dedb-4a57-8210-525d936c9db9"), kind: "townsfolk", at: [27, 3] },

  // Challengers: the high terrace, the cliff nook and the falls' foot.
  { id: parseDreamAnchorId("b9607104-f432-4d17-9206-b27be0ebed25"), kind: "challenger", at: [8, 1] },
  { id: parseDreamAnchorId("9674e7ef-2840-45a7-a3c1-f4b0704b2e6f"), kind: "challenger", at: [24, 9] },
  { id: parseDreamAnchorId("6ab6b15c-43f9-4432-8622-457f7abc14c4"), kind: "challenger", at: [23, 20] },

  // The chest at the high terrace's east end, above the stair.
  { id: parseDreamAnchorId("24b75963-a1cc-4e5b-ba91-e35f0d5fb49d"), kind: "chest", at: [12, 1] },

  // Quest objects: on the river shelf, and by the pool at the falls' foot.
  { id: parseDreamAnchorId("385a625a-ef9b-4b6c-b798-fc259a7264e5"), kind: "object", at: [26, 4] },
  { id: parseDreamAnchorId("c5dd559d-d501-4a68-863f-0ab2219ed439"), kind: "object", at: [25, 22] },
];

export default defineDreamMap({
  id: parseDreamMapId("0a5a7441-da58-417c-8787-4b854f400714"),
  source: {
    kind: "tiled",
    path: "source-of-tales/maps/goldenfields/main.tmx",
    sha256: parseDreamMapSourceHash("bfef031be76be13bb3071c5de967237364b5339bc7ec7563016db0b9c3aa8074"),
  },
  recipe: [
    { op: "crop", from: [106, 0], to: [137, 23] },
    // The source's automapping rule layers, which the game never draws.
    { op: "hideLayer", layer: "settree" },
    { op: "hideLayer", layer: "set_fence" },
    // The cut stair: through the cliff from the lower terrace to the high
    // ground, the oak above it cleared, and a lion at either side of its foot.
    { op: "erase", from: [10, 9], to: [13, 11] },
    { op: "stamp", stamp: SAND, at: [10, 9] },
    { op: "stamp", stamp: SAND, at: [12, 9] },
    { op: "stamp", stamp: SAND, at: [10, 10] },
    { op: "stamp", stamp: SAND, at: [12, 10] },
    { op: "erase", from: [11, 3], to: [14, 8], layers: TREE_LAYERS },
    { op: "stamp", stamp: GUARDIAN_LION, at: [8, 11] },
    { op: "stamp", stamp: GUARDIAN_LION, at: [14, 11] },
    { op: "block", from: [8, 11], to: [9, 11] },
    { op: "block", from: [14, 11], to: [15, 11] },
    // The river shelf, widened to the rope bridge.
    { op: "erase", from: [23, 6], to: [25, 7] },
    { op: "stamp", stamp: SAND, at: [23, 6] },
    { op: "stamp", stamp: SAND, at: [24, 6] },
    { op: "open", from: [26, 7], to: [26, 7] },
    // The temple portico, the exit door, cut into the cliff at the temple
    // court's head. Only its mouth is open: the door stands behind the
    // guardian's tile.
    { op: "erase", from: [21, 0], to: [24, 4] },
    { op: "stamp", stamp: SAND, at: [21, 0] },
    { op: "stamp", stamp: SAND, at: [23, 0] },
    { op: "stamp", stamp: SAND, at: [21, 2] },
    { op: "stamp", stamp: SAND, at: [23, 2] },
    { op: "stamp", stamp: SAND, at: [21, 3] },
    { op: "stamp", stamp: SAND, at: [23, 3] },
    { op: "stamp", stamp: PORTICO, at: [21, 0] },
    { op: "block", from: [21, 0], to: [24, 2] },
    { op: "block", from: [22, 3], to: [23, 3] },
    { op: "block", from: [23, 4], to: [23, 4] },
    // The oasis's oaks give way to palms.
    { op: "erase", from: [7, 14], to: [11, 19], layers: TREE_LAYERS },
    { op: "erase", from: [16, 16], to: [21, 22], layers: TREE_LAYERS },
    { op: "erase", from: [0, 18], to: [3, 23], layers: TREE_LAYERS },
    { op: "erase", from: [3, 20], to: [7, 23], layers: TREE_LAYERS },
    // The little gate, the town door: a portico against the cliff, open
    // only at its mouth.
    { op: "stamp", stamp: PORTICO, at: [4, 15] },
    { op: "block", from: [4, 15], to: [7, 18] },
    { op: "block", from: [6, 19], to: [6, 19] },
    // The domes, the awning and the palms.
    { op: "stamp", stamp: ADOBE_DOME, at: [0, 14] },
    { op: "stamp", stamp: ADOBE_DOME, at: [8, 20] },
    { op: "stamp", stamp: AWNING, at: [12, 14] },
    { op: "stamp", stamp: TALL_PALM, at: [15, 15] },
    { op: "stamp", stamp: PALM, at: [18, 17] },
    { op: "stamp", stamp: PALM, at: [2, 20] },
    { op: "stamp", stamp: PALM, at: [13, 20] },
    // Old bones at the high terrace's west end.
    { op: "stamp", stamp: GREAT_RIBCAGE, at: [1, 0] },
    // The domes' roofs against the cliff, and their doors, are no ground.
    { op: "block", from: [0, 14], to: [3, 15] },
    { op: "block", from: [10, 23], to: [10, 23] },
    // Ground no walk from the town reaches: the shelf above the west dome,
    // and the sand behind the bones.
    { op: "block", from: [0, 7], to: [6, 12] },
    { op: "block", from: [0, 2], to: [0, 3] },
    // The rope bridge beyond its door.
    { op: "block", from: [31, 6], to: [31, 6] },
    ...ABOVE_PLAYER_LAYERS.map((layer) => ({ op: "abovePlayer" as const, layer })),
  ],
  regions: [
    { name: "the oasis", from: [0, 14], to: [16, 23], note: "The town: the little gate, the domes, the awning, the palms and the waypoint." },
    { name: "the lower terrace", from: [7, 11], to: [13, 15], note: "A sand shelf above the palms, at the cut stair's foot." },
    { name: "the high terrace", from: [0, 0], to: [13, 3], note: "Open sand above the cliffs, west of the stair's head, with the withered tree." },
    { name: "the temple court", from: [11, 4], to: [22, 10], note: "The high ground at the stair's head, running east to the temple portico." },
    { name: "the cliff nook", from: [23, 8], to: [26, 10], note: "A sheltered ledge off the temple court, above the river." },
    { name: "the river shelf", from: [23, 3], to: [27, 7], note: "A strip of sand along the river, out to the rope bridge." },
    { name: "the falls' foot", from: [17, 16], to: [25, 23], note: "The east end of the oasis floor, under the cliffs, beside the pool below the falls." },
  ],
  landmarks: [
    { name: "the little gate", at: [5, 18], note: "A small portico in the cliff; the town door." },
    { name: "the west dome", at: [2, 16] },
    { name: "the south dome", at: [10, 22] },
    { name: "the awning", at: [13, 18], note: "The market awning; the shop stands before it." },
    { name: "the tall palm", at: [16, 19] },
    { name: "the cut stair", at: [11, 10], note: "The way up from the lower terrace to the temple court, a lion at either side of its foot." },
    { name: "the withered tree", at: [7, 5], note: "A dead tree on the cliff under the high terrace." },
    { name: "the temple portico", at: [22, 3], note: "The exit door, at the head of the temple court; the guardian stands in its mouth." },
    { name: "the rope bridge", at: [30, 6], note: "The bridge over the river off the river shelf; a door." },
    { name: "the falls", at: [28, 15], note: "Where the river comes down the cliffs." },
  ],
  anchors: ANCHORS,
});
