// The first dream's map: a 42×56 crop of Source of Tales' Mountainwatch
// around its hill town. The well square is the town (decision P33): the town
// door, an iron arch, stands in the square, with the waypoint, the inn door,
// the reeve's hall and the residents around it. The inn door is a building
// door into the dream's one room, the inn
// (`./8f22aeec-9a8f-4d44-91fb-7668f369609f.ts`), where the shop is. The
// dream's brief is `../dreams/3229d6c7-0700-4f37-9b07-921e3dccb8b6.md`;
// every landmark it names is a landmark or region here.
//
// Three broad ways lead out of the square: north up the barrel lane to the
// high field and the ember arch, the exit door; south between the houses to
// the south road, which runs east to the white bridge's door and west to
// the west green; and from the south road down the steps to the stubble
// terrace.

import { defineDreamMap, type DreamAnchorDefinition } from "../../../d97/map/definition";
import {
  parseD97StampId,
  parseDreamAnchorId,
  parseDreamMapId,
  parseDreamMapSourceHash,
} from "../../../types/identifiers";

const EMBER_ARCH = parseD97StampId("684f3b39-baac-49fd-9031-5c874c76d5ee");
const IRON_ARCH = parseD97StampId("b1f47948-7fa8-4bd6-9cd8-ce41a987c5f7");

const TOWN_DOOR = parseDreamAnchorId("c9f6d615-0e4c-465b-a990-7bd30bdb0fc8");
const BRIDGE_DOOR = parseDreamAnchorId("106a0852-85a9-4c0a-b17d-bd434a6c668d");
const EXIT_DOOR = parseDreamAnchorId("2ef5689f-f791-402c-9cc6-6e59cf0c5e14");
const ARCH_GUARDIAN = parseDreamAnchorId("649daef4-9f8b-4e0e-b3f2-3d2ab91a844d");
const INN_DOOR = parseDreamAnchorId("be2ecdb3-f77c-4efd-84a8-11d197767a0b");

/** Layers the source draws over its characters: roofs, treetops, cliff lips. */
const ABOVE_PLAYER_LAYERS = ["MountainOver1", "MountainOver2", "Over", "Over1", "Over2", "Over3"];

const ANCHORS: readonly DreamAnchorDefinition[] = [
  // Doors. The town door, where a run arrives; the white bridge's door at
  // the east end of the south road; the ember arch, the exit, whose
  // guardian fills its mouth.
  { id: TOWN_DOOR, kind: "door", at: { landmark: "the town door" }, entry: [20, 28] },
  { id: BRIDGE_DOOR, kind: "door", at: { landmark: "the white bridge" }, entry: [39, 42] },
  { id: EXIT_DOOR, kind: "door", at: { landmark: "the ember arch" }, entry: [21, 5] },
  { id: ARCH_GUARDIAN, kind: "guardian", at: [21, 6], blocksDoor: EXIT_DOOR },

  { id: parseDreamAnchorId("d01c6e03-c291-4164-a3ec-50393ed0c817"), kind: "waypoint", at: [26, 30] },
  // The inn door leads into the inn, which holds the shop.
  { id: INN_DOOR, kind: "buildingDoor", at: [10, 23], entry: { landmark: "the inn door" } },

  // Residents: the two quest givers, and an open place beside the inn door.
  { id: parseDreamAnchorId("63620809-4908-4881-b5ed-f7e5b3410b2a"), kind: "friendly", at: [11, 25], cluster: "well square" },
  { id: parseDreamAnchorId("8d202783-1114-45ae-af43-115eb6688d64"), kind: "friendly", at: { landmark: "the hall steps" }, cluster: "well square" },
  { id: parseDreamAnchorId("ee1d1483-32ee-414b-98cd-5f3788471b13"), kind: "friendly", at: { landmark: "the south corner" }, cluster: "well square" },
  // Open places in the square for the friendly characters assembly places.
  { id: parseDreamAnchorId("e90b4db7-a6da-4157-b98c-a912df082eb5"), kind: "friendly", at: [30, 24], cluster: "well square" },
  { id: parseDreamAnchorId("8816b1d1-78f5-4bfe-ad24-73572dd620a2"), kind: "friendly", at: [29, 31], cluster: "well square" },
  { id: parseDreamAnchorId("6a7546f9-f3c7-49b7-b016-3c7da90cfbbb"), kind: "friendly", at: [12, 30], cluster: "well square" },

  // Townsfolk: three in the square, two about the dream.
  { id: parseDreamAnchorId("8b9d34e7-c976-49b2-a995-c22eec88f4ce"), kind: "townsfolk", at: [31, 30] },
  { id: parseDreamAnchorId("ba3c1bab-018c-4164-988d-67f48de0b423"), kind: "townsfolk", at: [27, 24] },
  { id: parseDreamAnchorId("c36ac406-967d-4dee-9fa7-faebc17b1da7"), kind: "townsfolk", at: [27, 28] },
  { id: parseDreamAnchorId("bc4b6a27-abf6-430c-9a5e-23b899945106"), kind: "townsfolk", at: [24, 10] },
  { id: parseDreamAnchorId("e2f1e61b-dcf6-4c18-86a7-412d8fcdb536"), kind: "townsfolk", at: [37, 44] },

  // Challengers: two on the high ground, one on the south road, two on the
  // stubble terrace.
  { id: parseDreamAnchorId("3bc16e16-b79f-4d67-8db3-5b99ccb9cdf2"), kind: "challenger", at: [4, 4] },
  { id: parseDreamAnchorId("457b0f96-1ecf-473d-bbec-62054dde63ec"), kind: "challenger", at: [30, 7] },
  { id: parseDreamAnchorId("bf1e576a-4b6b-4908-8fd2-3875b360dfd3"), kind: "challenger", at: [32, 42] },
  { id: parseDreamAnchorId("7a2a2fa2-608f-4f41-81dc-659bf11bd0a2"), kind: "challenger", at: [16, 51] },
  { id: parseDreamAnchorId("720d48ff-863e-4c8f-9354-b1431147d967"), kind: "challenger", at: [34, 51] },

  { id: parseDreamAnchorId("46f219f5-2ae5-4535-a099-7494feff5b0b"), kind: "chest", at: [3, 38] },
  { id: parseDreamAnchorId("42ce7969-3a9a-432d-b018-4c6e5a2f09ea"), kind: "chest", at: [38, 3] },

  // Quest objects: the feast bell's tongue and the harvest maiden.
  { id: parseDreamAnchorId("f55a21ec-b472-4bb0-9403-3d21d4075340"), kind: "object", at: [28, 54] },
  { id: parseDreamAnchorId("190788a7-cf67-4903-9a5d-af1ab5607ae3"), kind: "object", at: [34, 2] },
];

export default defineDreamMap({
  id: parseDreamMapId("3229d6c7-0700-4f37-9b07-921e3dccb8b6"),
  source: {
    kind: "tiled",
    path: "source-of-tales/maps/mountainwatch/main.tmx",
    sha256: parseDreamMapSourceHash("88f3428886232c33e12d5b1a05d0fc458bd9e5f4a275849834e39ab14c6b5bfe"),
  },
  recipe: [
    { op: "crop", from: [89, 51], to: [130, 106] },
    // The town door: an iron arch in the middle of the well square.
    { op: "stamp", stamp: IRON_ARCH, at: [19, 25] },
    // The exit door: the ember arch at the head of the barrel lane, on
    // ground cleared of the cliff lips it would overlap.
    { op: "erase", from: [18, 0], to: [25, 6], layers: ["Ground", "Ground1"] },
    { op: "stamp", stamp: EMBER_ARCH, at: [18, 0] },
    // Ground no walk from the town reaches: the meadow below the stubble
    // terrace's cliffs, the pines under the herb ledge, and scraps of cliff
    // top and riverbank at the edges.
    { op: "block", from: [0, 47], to: [11, 55] },
    { op: "block", from: [12, 53], to: [23, 55] },
    { op: "block", from: [36, 54], to: [40, 55] },
    { op: "block", from: [0, 9], to: [8, 12] },
    { op: "block", from: [0, 19], to: [1, 22] },
    { op: "block", from: [0, 2], to: [0, 2] },
    { op: "block", from: [25, 19], to: [25, 19] },
    { op: "block", from: [40, 39], to: [40, 39] },
    // The bridge's south half: its door fills the walk across.
    { op: "block", from: [40, 43], to: [41, 43] },
    ...ABOVE_PLAYER_LAYERS.map((layer) => ({ op: "abovePlayer" as const, layer })),
  ],
  regions: [
    { name: "the well square", from: [9, 20], to: [33, 33], note: "The town: the inn, the reeve's hall, the well and the town door." },
    { name: "the high field", from: [13, 0], to: [41, 12], note: "Open ground above the roofs, up the barrel lane, with the ember arch." },
    { name: "the herb ledge", from: [0, 0], to: [12, 8], note: "A grassy shelf at the high field's west end." },
    { name: "the west green", from: [0, 30], to: [8, 41], note: "Grass under the inn's back wall, off the south road." },
    { name: "the south road", from: [6, 38], to: [41, 45], note: "The broad road below the houses, east to the white bridge." },
    { name: "the stubble terrace", from: [13, 46], to: [38, 55], note: "A cut field below the south road, down the steps." },
  ],
  landmarks: [
    { name: "the town door", at: [20, 27], note: "An iron arch in the square; a door." },
    { name: "the well", at: [26, 26] },
    { name: "the inn door", at: [10, 24], note: "Before the inn's door, a building door into the inn." },
    { name: "the barrel stall", at: [13, 23], note: "The inn's barrels." },
    { name: "the hall steps", at: [15, 23], note: "The reeve's hall." },
    { name: "the south corner", at: [14, 31], note: "The square's south-west corner, where the road goes down." },
    { name: "the barrel lane", at: [19, 16], note: "The lane up to the high field." },
    { name: "the ember arch", at: [21, 4], note: "The exit door, at the head of the barrel lane." },
    { name: "the white bridge", at: [41, 42], note: "The bridge over the falls at the south road's east end; a door." },
    { name: "the steps", at: [22, 47], note: "The way down from the south road to the stubble terrace." },
  ],
  anchors: ANCHORS,
});
