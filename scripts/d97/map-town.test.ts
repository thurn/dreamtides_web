// The map tools' town lookup over a synthetic catalog: a dream map's town
// door, cluster, town anchors (a giver on the map, the building door to the
// room holding the shop) and exit door; a dream with no town; a map no dream
// plays.

import { describe, expect, it } from "vitest";
import type { D97QuestDefinition } from "../../src/content/d97/dialogue/schema.ts";
import type { D97DreamDefinition } from "../../src/content/d97/dreams/schema.ts";
import { defineDreamMap, type DreamAnchorDefinition } from "../../src/d97/map/definition.ts";
import {
  parseD97DreamId,
  parseD97QuestId,
  parseD97RoomId,
  parseDreamAnchorId,
  parseDreamMapId,
} from "../../src/types/identifiers.ts";
import { catalogMapTown } from "./map-town.ts";

const id = (n: number) => `4b5c6d7e-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const anchorId = (n: number) => parseDreamAnchorId(id(n));
const DREAM_MAP = parseDreamMapId(id(100));
const ROOM_MAP = parseDreamMapId(id(101));
const OTHER_MAP = parseDreamMapId(id(102));

const TOWN_DOOR = anchorId(1);
const EXIT_DOOR = anchorId(2);
const WAYPOINT = anchorId(3);
const GIVER = anchorId(4);
const BUILDING_DOOR = anchorId(5);
const ROOM_DOOR = anchorId(6);
const SHOP = anchorId(7);
const GUARDIAN = anchorId(8);
const ELSEWHERE_GIVER = anchorId(9);

const mapOf = (mapId: typeof DREAM_MAP, anchors: readonly DreamAnchorDefinition[]) =>
  defineDreamMap({
    id: mapId,
    source: { kind: "blank", width: 4, height: 4, tileWidth: 32, tileHeight: 32 },
    recipe: [],
    regions: [],
    landmarks: [],
    anchors,
  });

const MAPS = [
  mapOf(DREAM_MAP, [
    { id: TOWN_DOOR, kind: "door", at: [0, 0], entry: [0, 1] },
    { id: EXIT_DOOR, kind: "door", at: [3, 3], entry: [3, 2] },
    { id: WAYPOINT, kind: "waypoint", at: [1, 1] },
    { id: GIVER, kind: "friendly", at: [1, 2] },
    { id: BUILDING_DOOR, kind: "buildingDoor", at: [2, 0], entry: [2, 1] },
    { id: GUARDIAN, kind: "guardian", at: [3, 1], blocksDoor: EXIT_DOOR },
  ]),
  mapOf(ROOM_MAP, [
    { id: ROOM_DOOR, kind: "buildingDoor", at: [0, 3], entry: [0, 2] },
    { id: SHOP, kind: "shop", at: [1, 1] },
  ]),
  mapOf(OTHER_MAP, []),
];

const DREAM: D97DreamDefinition = {
  id: parseD97DreamId(id(200)),
  mapId: DREAM_MAP,
  topology: {
    waypointAnchorId: WAYPOINT,
    arrivalDoorAnchorId: TOWN_DOOR,
    exitDoorAnchorId: EXIT_DOOR,
    exitGuardianAnchorId: GUARDIAN,
    shopAnchorId: SHOP,
  },
  town: { doorAnchorId: TOWN_DOOR, cluster: "square" },
  rooms: [{ id: parseD97RoomId(id(201)), mapId: ROOM_MAP, buildingDoorAnchorId: BUILDING_DOOR, doorAnchorId: ROOM_DOOR }],
  residents: [],
};

const quest = (n: number, giverAnchorId: typeof GIVER): D97QuestDefinition => ({
  id: parseD97QuestId(id(300 + n)),
  kind: "errand",
  title: "",
  giverAnchorId,
  turnInAnchorId: giverAnchorId,
  carriedItemIds: [],
  steps: [],
  reward: { kind: "essence" },
});

const CATALOG = { dreams: [DREAM], maps: MAPS, quests: [quest(1, GIVER), quest(2, ELSEWHERE_GIVER)] };

describe("catalogMapTown", () => {
  it("resolves a dream map's town, standing the room's shop in town by its building door", () => {
    expect(catalogMapTown(DREAM_MAP, CATALOG)).toEqual({
      doorAnchorId: TOWN_DOOR,
      cluster: "square",
      townAnchorIds: [BUILDING_DOOR, GIVER],
      exitDoorAnchorId: EXIT_DOOR,
    });
  });

  it("is null for a dream that names no town, and undefined for a map no dream plays", () => {
    const { town: _town, ...townless } = DREAM;
    expect(catalogMapTown(DREAM_MAP, { ...CATALOG, dreams: [townless] })).toBeNull();
    expect(catalogMapTown(ROOM_MAP, CATALOG)).toBeUndefined();
    expect(catalogMapTown(OTHER_MAP, CATALOG)).toBeUndefined();
  });
});
