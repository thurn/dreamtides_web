// An example map composed only from brushes and stamps on a blank canvas
// (decision P11's third path): a small village on four lanes split by three
// streams. Each stream leaves a ford at alternating ends, so the cobbled
// lane winds east and west from the north door to the south door. The south
// lane is reseasoned to autumn. No dream plays it; it is the map tooling's
// reference composition, checked by `npm run d97:map -- validate --all`.

import { defineDreamMap } from "../../../d97/map/definition";
import {
  parseD97StampId,
  parseD97TerrainId,
  parseDreamAnchorId,
  parseDreamMapId,
} from "../../../types/identifiers";

const BARE_DIRT = parseD97TerrainId("0e70e5da-3060-49dd-8d81-9503c3c28741");
const GRASS = parseD97TerrainId("756a5332-1d9b-4f82-a9c3-34ad3a102e4e");
const POND = parseD97TerrainId("7bfa0202-4794-491a-b8af-3f96ed1e9d62");
const COBBLES = parseD97TerrainId("4f7e2530-7dc7-49d3-be5b-64f3011e1838");

const BRICK_HOUSE = parseD97StampId("9eb0de38-4bce-45b1-ab9b-2fae83854351");
const PANELED_HOUSE = parseD97StampId("ff3ef5e3-719b-4d81-9501-3c7baea7f672");
const OAK_TREE = parseD97StampId("80b4b406-3395-4da4-ae33-cf4036d9e446");
const PINE_TREE = parseD97StampId("b29437e2-f046-458e-9abc-06bf5aefc9f0");
const BOULDER = parseD97StampId("c0eec709-a0ec-4d04-b01a-7830aeb97a29");
const FLAT_ROCK = parseD97StampId("c8590469-f6f0-45fd-85e3-d7526f2a2efb");
const FOUNTAIN = parseD97StampId("8344f2c8-18e9-4a4d-83af-f2a48f067611");
const MARKET_STALL = parseD97StampId("8268bfc9-8643-408d-adfe-0e3c954cd2b2");
const HAND_CART = parseD97StampId("02d71085-3b42-4c6a-9e84-5d8f8a439735");
const WINCH_WELL = parseD97StampId("70d71581-6105-4671-948f-4dfd0da89e60");
const SIGNPOSTS = parseD97StampId("63183394-8a72-4692-8311-5f20bf2b623d");

const WIDTH = 56;
const HEIGHT = 40;
const WHOLE = { kind: "rect", from: [0, 0], to: [WIDTH - 1, HEIGHT - 1] } as const;

export default defineDreamMap({
  id: parseDreamMapId("9ad96a1d-4542-4228-a20f-1e4f6e274058"),
  source: { kind: "blank", width: WIDTH, height: HEIGHT, tileWidth: 32, tileHeight: 32 },
  recipe: [
    // Bare dirt under a meadow.
    { op: "brush", terrain: BARE_DIRT, shape: WHOLE },
    { op: "brush", terrain: GRASS, shape: WHOLE },
    // Three streams, fordable at alternating ends.
    { op: "brush", terrain: POND, shape: { kind: "rect", from: [0, 9], to: [47, 11] } },
    { op: "brush", terrain: POND, shape: { kind: "rect", from: [8, 19], to: [55, 21] } },
    { op: "brush", terrain: POND, shape: { kind: "rect", from: [0, 29], to: [47, 31] } },
    // The cobbled lane through the fords.
    {
      op: "brush",
      terrain: COBBLES,
      shape: { kind: "path", points: [[1, 7], [52, 7], [52, 15], [3, 15], [3, 25], [52, 25], [52, 33], [1, 33]] },
    },
    // The north lane: the brick house, two oaks and the well.
    { op: "stamp", stamp: BRICK_HOUSE, at: [14, 0] },
    { op: "stamp", stamp: OAK_TREE, at: [4, 1] },
    { op: "stamp", stamp: OAK_TREE, at: [32, 1] },
    { op: "stamp", stamp: WINCH_WELL, at: [40, 3] },
    // The market row.
    { op: "stamp", stamp: FOUNTAIN, at: [10, 12] },
    { op: "stamp", stamp: MARKET_STALL, at: [20, 12] },
    { op: "stamp", stamp: HAND_CART, at: [34, 16] },
    // The stone lane.
    { op: "stamp", stamp: BOULDER, at: [20, 22] },
    { op: "stamp", stamp: FLAT_ROCK, at: [40, 23] },
    { op: "stamp", stamp: SIGNPOSTS, at: [32, 26] },
    // The south lane, in autumn.
    { op: "stamp", stamp: PANELED_HOUSE, at: [20, 34] },
    { op: "stamp", stamp: PINE_TREE, at: [8, 34] },
    { op: "reseason", season: "autumn", from: [0, 32], to: [WIDTH - 1, HEIGHT - 1] },
  ],
  regions: [
    { name: "the north lane", from: [0, 0], to: [55, 8], note: "The brick house, the oaks and the well." },
    { name: "the market row", from: [0, 12], to: [55, 18], note: "The fountain, a stall and a hand cart." },
    { name: "the stone lane", from: [0, 22], to: [55, 28], note: "Boulders and the signposts." },
    { name: "the autumn end", from: [0, 32], to: [55, 39], note: "The paneled house under autumn grass." },
  ],
  landmarks: [
    { name: "the north door", at: [0, 7] },
    { name: "the south door", at: [0, 33] },
    { name: "the brick house door", at: [16, 5], note: "The brick house stamp's door point." },
    { name: "the market", at: [28, 15] },
  ],
  anchors: [
    {
      id: parseDreamAnchorId("a08e17ac-1548-4555-9dc5-80ee90aceff2"),
      kind: "door",
      at: { landmark: "the north door" },
      entry: [1, 7],
    },
    {
      id: parseDreamAnchorId("04167739-ba43-42dd-8038-fcec55f5687d"),
      kind: "door",
      at: { landmark: "the south door" },
      entry: [1, 33],
    },
    { id: parseDreamAnchorId("33436666-e8c3-4adf-8c3c-141521483dad"), kind: "waypoint", at: { landmark: "the market" } },
    { id: parseDreamAnchorId("ee035534-a49b-4257-bdc3-f3df82cea310"), kind: "friendly", at: [19, 16] },
    { id: parseDreamAnchorId("20a984d0-d643-4a2e-a715-7eb0dfda98fc"), kind: "townsfolk", at: { landmark: "the brick house door" } },
  ],
});
