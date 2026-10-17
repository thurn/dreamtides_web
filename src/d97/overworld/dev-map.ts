// The synthetic development dream the overworld shows until the first
// authored dream lands: a medium (110×110) blank-canvas map with walls, a
// lake, a river with two bridges, a few house blocks and one anchor of every
// kind. It has no tilesets, so it always draws placeholders. It is compiled
// in code from a map module, so it exercises the real compiler.

import {
  parseDreamAnchorId,
  parseDreamMapId,
  type DreamAnchorId,
} from "../../types/identifiers";
import { compileDreamMap } from "../map/compile";
import type { CompiledDreamMap } from "../map/compiled";
import {
  defineDreamMap,
  type DreamAnchorDefinition,
  type DreamMapRecipeOp,
  type TilePoint,
} from "../map/definition";

const SIZE = 110;

function anchorId(index: number): DreamAnchorId {
  return parseDreamAnchorId(`d9700000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`);
}

const block = (from: TilePoint, to: TilePoint): DreamMapRecipeOp => ({ op: "block", from, to });
const open = (from: TilePoint, to: TilePoint): DreamMapRecipeOp => ({ op: "open", from, to });

const RECIPE: readonly DreamMapRecipeOp[] = [
  block([0, 0], [109, 1]),
  block([0, 108], [109, 109]),
  block([0, 0], [1, 109]),
  block([108, 0], [109, 109]),
  // The lake.
  block([60, 18], [84, 34]),
  // The river, with two bridges.
  block([40, 2], [42, 107]),
  open([40, 54], [42, 56]),
  open([40, 90], [42, 91]),
  // House blocks around the plaza.
  block([14, 40], [19, 44]),
  block([24, 40], [29, 44]),
  block([14, 64], [19, 68]),
  block([24, 64], [29, 68]),
  block([70, 70], [77, 76]),
  // The guardian's gate: a wall with one gap.
  block([92, 2], [93, 107]),
  open([92, 52], [93, 52]),
];

const DOOR_WEST = anchorId(1);
const DOOR_EAST = anchorId(2);
const GUARDIAN = anchorId(4);

const ANCHORS: readonly DreamAnchorDefinition[] = [
  { id: DOOR_WEST, kind: "door", at: [6, 54], entry: [7, 54] },
  { id: DOOR_EAST, kind: "door", at: [104, 52], entry: [103, 52] },
  { id: anchorId(3), kind: "waypoint", at: [22, 52] },
  { id: GUARDIAN, kind: "guardian", at: [94, 52], blocksDoor: DOOR_EAST },
  { id: anchorId(5), kind: "shop", at: [21, 45] },
  { id: anchorId(6), kind: "challenger", at: [55, 40] },
  { id: anchorId(7), kind: "challenger", at: [52, 80] },
  { id: anchorId(8), kind: "challenger", at: [80, 50] },
  { id: anchorId(9), kind: "challenger", at: [30, 90] },
  { id: anchorId(10), kind: "friendly", at: [18, 50], cluster: "plaza" },
  { id: anchorId(11), kind: "friendly", at: [26, 50], cluster: "plaza" },
  { id: anchorId(12), kind: "friendly", at: [22, 58], cluster: "plaza" },
  { id: anchorId(13), kind: "chest", at: [100, 30], behindGuardian: GUARDIAN },
  { id: anchorId(14), kind: "object", at: [72, 40] },
  { id: anchorId(15), kind: "townsfolk", at: [20, 60] },
  { id: anchorId(16), kind: "townsfolk", at: [60, 60] },
];

const DEV_MAP_DEFINITION = defineDreamMap({
  id: parseDreamMapId("d9700000-0000-4000-8000-000000000000"),
  source: { kind: "blank", width: SIZE, height: SIZE, tileWidth: 32, tileHeight: 32 },
  recipe: RECIPE,
  regions: [
    { name: "plaza", from: [12, 46], to: [32, 62] },
    { name: "lake", from: [60, 18], to: [84, 34] },
    { name: "beyond the gate", from: [94, 2], to: [107, 107] },
  ],
  landmarks: [{ name: "west bridge", at: [41, 55] }],
  anchors: ANCHORS,
});

/** Compile the development dream; it always compiles (pinned by tests). */
export function compileDevMap(): CompiledDreamMap {
  const result = compileDreamMap(DEV_MAP_DEFINITION, {
    source: null,
    stamps: new Map(),
    terrains: new Map(),
  });
  if (!result.ok) throw new Error(`The development map does not compile: ${JSON.stringify(result.errors)}`);
  return result.map;
}
