// The first dream's map: a 110×110 crop of Source of Tales' Mountainwatch
// (the hill town, its white bridge and falls, the great wheat field, the
// creek row and the cliffs to the south), with the ember arch stamped into
// the well square as the exit door. The inn door is a building door into
// the dream's one room, the inn (`./8f22aeec-9a8f-4d44-91fb-7668f369609f.ts`),
// where the shop is. The dream's brief is
// `../dreams/3229d6c7-0700-4f37-9b07-921e3dccb8b6.md`; every landmark it
// names is a landmark or region here.
//
// The town stands on a terrace whose only ways down run east over the white
// bridge, so the main route from the ember arch to the low cave walks the
// whole valley: over the bridge, down the far bank, back across the fords,
// round the woodcutter's yard and the long meadow, along the creek row, over
// the plank bridge and through the south fields.

import { defineDreamMap, type DreamAnchorDefinition } from "../../../d97/map/definition";
import {
  parseD97StampId,
  parseDreamAnchorId,
  parseDreamMapId,
  parseDreamMapSourceHash,
} from "../../../types/identifiers";

const EMBER_ARCH = parseD97StampId("684f3b39-baac-49fd-9031-5c874c76d5ee");

const EXIT_DOOR = parseDreamAnchorId("2ef5689f-f791-402c-9cc6-6e59cf0c5e14");
const ADIT_DOOR = parseDreamAnchorId("106a0852-85a9-4c0a-b17d-bd434a6c668d");
const LOW_CAVE_DOOR = parseDreamAnchorId("c9f6d615-0e4c-465b-a990-7bd30bdb0fc8");
const ARCH_GUARDIAN = parseDreamAnchorId("649daef4-9f8b-4e0e-b3f2-3d2ab91a844d");
const INN_DOOR = parseDreamAnchorId("be2ecdb3-f77c-4efd-84a8-11d197767a0b");

/** Layers the source draws over its characters: roofs, treetops, cliff lips. */
const ABOVE_PLAYER_LAYERS = ["MountainOver1", "MountainOver2", "Over", "Over1", "Over2", "Over3"];

const ANCHORS: readonly DreamAnchorDefinition[] = [
  // Doors. The ember arch is the exit; its guardian fills the arch's mouth.
  // The low cave comes first: until runs record an arrival, the overworld
  // spawns at the first door's entry, which must not be behind the guardian.
  { id: LOW_CAVE_DOOR, kind: "door", at: { landmark: "the low cave" }, entry: [7, 109] },
  { id: ADIT_DOOR, kind: "door", at: { landmark: "the adit" }, entry: [40, 20] },
  { id: EXIT_DOOR, kind: "door", at: { landmark: "the ember arch" }, entry: [60, 29] },
  { id: ARCH_GUARDIAN, kind: "guardian", at: [60, 30], blocksDoor: EXIT_DOOR },

  { id: parseDreamAnchorId("d01c6e03-c291-4164-a3ec-50393ed0c817"), kind: "waypoint", at: [67, 30] },
  // The inn door leads into the inn, which holds the shop.
  { id: INN_DOOR, kind: "buildingDoor", at: [51, 23], entry: { landmark: "the inn door" } },

  // Residents: the two quest givers, and an open place beside the inn door.
  {
    id: parseDreamAnchorId("63620809-4908-4881-b5ed-f7e5b3410b2a"),
    kind: "friendly",
    at: [52, 25],
    cluster: "well square",
  },
  {
    id: parseDreamAnchorId("8d202783-1114-45ae-af43-115eb6688d64"),
    kind: "friendly",
    at: { landmark: "the hall steps" },
    cluster: "well square",
  },
  {
    id: parseDreamAnchorId("ee1d1483-32ee-414b-98cd-5f3788471b13"),
    kind: "friendly",
    at: { landmark: "the wheat corner" },
  },
  // Open places in the square for the friendly characters assembly places.
  { id: parseDreamAnchorId("e90b4db7-a6da-4157-b98c-a912df082eb5"), kind: "friendly", at: [71, 24], cluster: "well square" },
  { id: parseDreamAnchorId("8816b1d1-78f5-4bfe-ad24-73572dd620a2"), kind: "friendly", at: [72, 31], cluster: "well square" },
  { id: parseDreamAnchorId("6a7546f9-f3c7-49b7-b016-3c7da90cfbbb"), kind: "friendly", at: [53, 30], cluster: "well square" },

  // Townsfolk.
  { id: parseDreamAnchorId("8b9d34e7-c976-49b2-a995-c22eec88f4ce"), kind: "townsfolk", at: [74, 30] },
  { id: parseDreamAnchorId("ba3c1bab-018c-4164-988d-67f48de0b423"), kind: "townsfolk", at: [68, 24] },
  { id: parseDreamAnchorId("bc4b6a27-abf6-430c-9a5e-23b899945106"), kind: "townsfolk", at: [31, 71] },
  { id: parseDreamAnchorId("c36ac406-967d-4dee-9fa7-faebc17b1da7"), kind: "townsfolk", at: { landmark: "the creek well" } },
  { id: parseDreamAnchorId("e2f1e61b-dcf6-4c18-86a7-412d8fcdb536"), kind: "townsfolk", at: [79, 43] },

  // Challengers, one per quarter of the valley.
  { id: parseDreamAnchorId("3bc16e16-b79f-4d67-8db3-5b99ccb9cdf2"), kind: "challenger", at: [18, 26] },
  { id: parseDreamAnchorId("bf1e576a-4b6b-4908-8fd2-3875b360dfd3"), kind: "challenger", at: [102, 56] },
  { id: parseDreamAnchorId("7a2a2fa2-608f-4f41-81dc-659bf11bd0a2"), kind: "challenger", at: [20, 49] },
  { id: parseDreamAnchorId("720d48ff-863e-4c8f-9354-b1431147d967"), kind: "challenger", at: [34, 100] },
  { id: parseDreamAnchorId("457b0f96-1ecf-473d-bbec-62054dde63ec"), kind: "challenger", at: [64, 6] },

  { id: parseDreamAnchorId("46f219f5-2ae5-4535-a099-7494feff5b0b"), kind: "chest", at: [33, 51] },
  { id: parseDreamAnchorId("42ce7969-3a9a-432d-b018-4c6e5a2f09ea"), kind: "chest", at: [79, 3] },

  // Quest objects: the feast bell's tongue and the harvest maiden.
  { id: parseDreamAnchorId("f55a21ec-b472-4bb0-9403-3d21d4075340"), kind: "object", at: [82, 92] },
  { id: parseDreamAnchorId("190788a7-cf67-4903-9a5d-af1ab5607ae3"), kind: "object", at: [3, 36] },
];

export default defineDreamMap({
  id: parseDreamMapId("3229d6c7-0700-4f37-9b07-921e3dccb8b6"),
  source: {
    kind: "tiled",
    path: "source-of-tales/maps/mountainwatch/main.tmx",
    sha256: parseDreamMapSourceHash("88f3428886232c33e12d5b1a05d0fc458bd9e5f4a275849834e39ab14c6b5bfe"),
  },
  recipe: [
    { op: "crop", from: [48, 51], to: [157, 160] },
    // A stray automapping rule marker from Source of Tales' unserved
    // `ruleset` sheet; erasing it lets the compiled map drop that tileset.
    { op: "erase", from: [109, 81], to: [109, 81], layers: ["MountainOver2"] },
    // The exit door: the ember arch in the well square, below the hall steps.
    { op: "stamp", stamp: EMBER_ARCH, at: [57, 24] },
    // A dirt ledge the source walls off: opens the pine meadow and the dry
    // hollow to the south fields.
    { op: "open", from: [62, 100], to: [62, 100] },
    ...ABOVE_PLAYER_LAYERS.map((layer) => ({ op: "abovePlayer" as const, layer })),
  ],
  regions: [
    { name: "the well square", from: [50, 21], to: [78, 33], note: "The town's heart: the inn, the reeve's hall, the well and the ember arch." },
    { name: "the high field", from: [41, 0], to: [83, 11], note: "Open ground above the town, up the barrel lane." },
    { name: "the terraces", from: [0, 0], to: [40, 32], note: "Green hill steps and pines north-west of the town, with the adit." },
    { name: "the long meadow", from: [0, 33], to: [12, 75], note: "A strip of grass along the west edge." },
    { name: "the woodcutter's yard", from: [14, 42], to: [39, 60], note: "A stump field and a fenced yard round the woodcutter's house." },
    { name: "the great wheat field", from: [28, 59], to: [60, 78], note: "Standing wheat south of the woodcutter's yard." },
    { name: "the creek row", from: [0, 78], to: [48, 92], note: "Four cottages and a well along the creek." },
    { name: "the south fields", from: [0, 93], to: [62, 109], note: "Corn, a second wheat field and the cliffs over the low cave." },
    { name: "the far bank", from: [84, 34], to: [109, 72], note: "Pasture east of the white bridge, down to the fords." },
    { name: "the pine meadow", from: [62, 79], to: [89, 109], note: "Grass behind the pines and the dry hollow below it." },
  ],
  landmarks: [
    { name: "the ember arch", at: [60, 28], note: "The exit door, stamped into the square." },
    { name: "the well", at: [67, 26] },
    { name: "the inn door", at: [51, 24], note: "Before the inn's door, a building door into the inn." },
    { name: "the barrel stall", at: [54, 24], note: "The inn's barrels." },
    { name: "the hall steps", at: [56, 23], note: "The reeve's hall." },
    { name: "the barrel lane", at: [60, 16], note: "The lane up to the high field." },
    { name: "the white bridge", at: [82, 42] },
    { name: "the fords", at: [86, 61], note: "Plank crossings over the river's two arms." },
    { name: "the adit", at: [40, 19], note: "A cave mouth in the terraces; a door." },
    { name: "the wheat corner", at: [55, 66], note: "The grass east of the standing wheat." },
    { name: "the creek well", at: [38, 86] },
    { name: "the dry hollow", at: [76, 100], note: "Bare dirt between the south fields and the pine meadow." },
    { name: "the plank bridge", at: [60, 90], note: "A one-plank footbridge over the creek." },
    { name: "the low cave", at: [7, 108], note: "A cave mouth in the south cliffs; a door." },
  ],
  anchors: ANCHORS,
});
