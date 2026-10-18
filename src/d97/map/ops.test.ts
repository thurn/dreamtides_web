// The hardened recipe operations over synthetic blank canvases: `brush`
// (catalog default layer, erase, ellipse shapes, edgeless base fills),
// `reseason` (seasonal sheet families, areas, blocking kept), dropping
// tilesets no drawn tile uses, and the acceptance check that a map built
// only from brushes and stamps passes the validator.

import { describe, expect, it } from "vitest";
import { parseD97StampId, parseD97TerrainId, parseDreamAnchorId } from "../../types/identifiers";
import { TERRAIN_FULL, type D97SeasonFamily, type DreamStamp, type DreamTerrain } from "./assets";
import { compileDreamMap, type DreamMapCompileInput } from "./compile";
import { isWalkable, type CompiledDreamMap } from "./compiled";
import type { DreamMapDefinition, DreamMapRecipeOp } from "./definition";
import { mergeTileset, tilesetSpan, type WorkingMap } from "./ops/working-map";
import { FIXTURE_TMX, HUT, HUT_STAMP, WATER, WATER_TERRAIN, WATER_TILESET, fixtureDefinition, loadFixtureText } from "./map-fixtures";
import type { D97MapTuning } from "./tuning";
import { validateDreamMap } from "./validate";

const BASE = parseD97TerrainId("base-fill");
const BASE_TERRAIN: DreamTerrain = {
  id: BASE,
  tileset: { ...WATER_TILESET, name: "base", image: { path: "terrain/base.png", width: 96, height: 192 } },
  corners: { [TERRAIN_FULL]: [4] },
  blocksMovement: false,
  layer: "Ground",
  edgeless: true,
};

const SEASONS: readonly D97SeasonFamily[] = [
  {
    family: "water",
    images: {
      spring: "terrain/water_spring.png",
      summer: "terrain/water.png",
      autumn: "terrain/water_autumn.png",
      winter: "terrain/water_winter.png",
    },
  },
];

const INPUT: DreamMapCompileInput = {
  source: null,
  stamps: new Map([[HUT, HUT_STAMP]]),
  terrains: new Map([
    [WATER, WATER_TERRAIN],
    [BASE, BASE_TERRAIN],
  ]),
  seasons: SEASONS,
};

function blank(recipe: DreamMapRecipeOp[], size = 8, overrides: Partial<DreamMapDefinition> = {}): CompiledDreamMap {
  const result = compileDreamMap(
    fixtureDefinition({
      source: { kind: "blank", width: size, height: size, tileWidth: 32, tileHeight: 32 },
      regions: [],
      landmarks: [],
      recipe,
      ...overrides,
    }),
    INPUT,
  );
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.map;
}

function layer(map: CompiledDreamMap, name: string): readonly number[] {
  const found = map.layers.find((entry) => entry.name === name);
  if (found === undefined) throw new Error(`no layer ${name}`);
  return found.gids;
}

function firstGid(map: CompiledDreamMap, image: string): number {
  const tileset = map.tilesets.find((entry) => entry.image === image);
  if (tileset === undefined) throw new Error(`no tileset ${image}`);
  return tileset.firstGid;
}

const at = (map: CompiledDreamMap, x: number, y: number) => y * map.width + x;
const WATER_FULLS = [10, 15, 16, 17];

describe("brush", () => {
  it("paints the terrain's catalog layer unless the operation names one", () => {
    const map = blank([
      { op: "brush", terrain: WATER, shape: { kind: "rect", from: [2, 2], to: [3, 3] } },
      { op: "brush", terrain: WATER, layer: "Moat", shape: { kind: "rect", from: [6, 6], to: [6, 6] } },
    ]);
    const first = firstGid(map, "terrain/water.png");
    expect(WATER_FULLS.map((local) => first + local)).toContain(layer(map, "Water")[at(map, 2, 2)]);
    expect(layer(map, "Water")[at(map, 1, 1)]).toBe(first + 6);
    expect(WATER_FULLS.map((local) => first + local)).toContain(layer(map, "Moat")[at(map, 6, 6)]);
    expect(isWalkable(map, [2, 2])).toBe(false);
  });

  it("erases terrain from a shape and re-tiles the edges around it", () => {
    const map = blank([
      { op: "brush", terrain: WATER, shape: { kind: "rect", from: [1, 1], to: [6, 6] } },
      { op: "brush", terrain: WATER, erase: true, shape: { kind: "rect", from: [3, 3], to: [4, 4] } },
    ]);
    const first = firstGid(map, "terrain/water.png");
    const water = layer(map, "Water");
    expect([water[at(map, 3, 3)], water[at(map, 4, 4)]]).toEqual([0, 0]);
    // The cells around the hole become inner corners and edges, and walkable.
    expect(water[at(map, 2, 2)]).toBe(first + 1);
    expect(water[at(map, 5, 5)]).toBe(first + 5);
    expect(isWalkable(map, [3, 3])).toBe(true);
    expect(isWalkable(map, [1, 1])).toBe(false);
  });

  it("paints the cells of an ellipse inscribed in its rectangle", () => {
    const map = blank([{ op: "brush", terrain: WATER, shape: { kind: "ellipse", from: [1, 1], to: [5, 5] } }]);
    expect(isWalkable(map, [3, 3])).toBe(false);
    expect(isWalkable(map, [1, 3])).toBe(false);
    // The rectangle's corner lies outside the ellipse; only edge pieces reach it.
    expect(isWalkable(map, [1, 1])).toBe(true);
  });

  it("draws only fully covered cells of an edgeless base fill", () => {
    const map = blank([{ op: "brush", terrain: BASE, shape: { kind: "rect", from: [2, 2], to: [4, 4] } }]);
    const first = firstGid(map, "terrain/base.png");
    const ground = layer(map, "Ground");
    expect(ground[at(map, 3, 3)]).toBe(first + 4);
    expect(ground[at(map, 1, 1)]).toBe(0);
    expect(ground[at(map, 5, 3)]).toBe(0);
  });
});

describe("reseason", () => {
  const painted: DreamMapRecipeOp = { op: "brush", terrain: WATER, shape: { kind: "rect", from: [1, 1], to: [6, 6] } };

  it("moves seasonal tiles to the same tile of the target season's sheet and keeps them blocking", () => {
    const summer = blank([painted]);
    const winter = blank([painted, { op: "reseason", season: "winter" }]);
    const from = firstGid(summer, "terrain/water.png");
    const to = firstGid(winter, "terrain/water_winter.png");
    for (const cell of [at(winter, 0, 0), at(winter, 3, 3), at(winter, 7, 7)]) {
      const before = layer(summer, "Water")[cell];
      expect(layer(winter, "Water")[cell]).toBe(before === 0 ? 0 : before - from + to);
    }
    expect(winter.walkable).toBe(summer.walkable);
    expect(winter.tilesets.map((tileset) => tileset.image)).toEqual(["terrain/water_winter.png"]);
  });

  it("limits itself to an area and leaves other sheets alone", () => {
    const map = blank([
      painted,
      { op: "stamp", stamp: HUT, at: [0, 6] },
      { op: "reseason", season: "autumn", from: [0, 0], to: [7, 3] },
    ]);
    const autumn = firstGid(map, "terrain/water_autumn.png");
    const summer = firstGid(map, "terrain/water.png");
    const water = layer(map, "Water");
    expect(water[at(map, 3, 2)] - autumn).toBeGreaterThanOrEqual(0);
    expect(water[at(map, 3, 2)]).toBeLessThan(summer > autumn ? summer : Infinity);
    expect(water[at(map, 3, 5)] - summer).toBeGreaterThanOrEqual(0);
    expect(map.tilesets.some((tileset) => tileset.image === "props/hut.png")).toBe(true);
  });

  it("fails when no seasonal families are catalogued", () => {
    const result = compileDreamMap(
      fixtureDefinition({ source: { kind: "blank", width: 2, height: 2, tileWidth: 32, tileHeight: 32 }, regions: [], landmarks: [], recipe: [{ op: "reseason", season: "spring" }] }),
      { ...INPUT, seasons: [] },
    );
    expect(result.ok === false && result.errors[0]?.kind).toBe("recipe");
  });
});

describe("merging a tileset", () => {
  it("places it after a sheet that leaves out its tile count", () => {
    // A 96×192 sheet of 32×32 tiles holds 18 tiles even when its tileset
    // states no tilecount, as Big Island's and Neverwell Moor's do.
    const countless = { ...WATER_TILESET, name: "countless", firstGid: 1, tileCount: 0, columns: 0, tiles: [] };
    expect(tilesetSpan(countless)).toBe(18);
    const map = { tilesets: [countless] } as unknown as WorkingMap;
    const merged = mergeTileset(map, { ...WATER_TILESET, name: "added", image: { path: "terrain/added.png", width: 64, height: 64 } });
    expect(merged).toBe(19);
  });
});

describe("unused tilesets", () => {
  it("drops tilesets no drawn tile uses and reports them", () => {
    const result = compileDreamMap(fixtureDefinition({ recipe: [{ op: "erase", from: [0, 0], to: [7, 5], layers: ["Deco", "Roof", "Props"] }] }), {
      ...INPUT,
      source: { text: FIXTURE_TMX, loadText: loadFixtureText },
    });
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.map.tilesets.map((tileset) => tileset.name)).toEqual(["base"]);
    expect(result.droppedTilesets).toEqual([{ name: "props", image: "images/props.png" }]);
    // Gids keep their numbering.
    expect(result.map.layers.find((entry) => entry.name === "Ground")?.gids[0]).toBe(1);
  });
});

describe("a map built only from brushes and stamps", () => {
  const TUNING: D97MapTuning = {
    walkingSpeedTilesPerSecond: 4,
    sizeClasses: [{ size: "small", nominalSide: 20, maxSide: 40, crossingTargetSeconds: 8, crossingSeverity: "error" }],
    crossingTolerance: 0.5,
    doorMinSpacingTiles: 8,
  };
  const WALL = parseD97StampId("wall");
  const wall: DreamStamp = {
    id: WALL,
    width: 6,
    height: 1,
    tilesets: HUT_STAMP.tilesets,
    layers: [{ layer: "Buildings", gids: [3, 4, 3, 4, 3, 4] }],
    walkability: "111111",
  };
  const westDoor = parseDreamAnchorId("7c9e1b2a-0d3f-4e5a-8b6c-1d2e3f4a5b01");
  const eastDoor = parseDreamAnchorId("7c9e1b2a-0d3f-4e5a-8b6c-1d2e3f4a5b02");
  const waypoint = parseDreamAnchorId("7c9e1b2a-0d3f-4e5a-8b6c-1d2e3f4a5b03");

  it("passes the validator", () => {
    const result = compileDreamMap(
      fixtureDefinition({
        source: { kind: "blank", width: 16, height: 12, tileWidth: 32, tileHeight: 32 },
        recipe: [
          { op: "brush", terrain: BASE, shape: { kind: "rect", from: [0, 0], to: [15, 11] } },
          { op: "brush", terrain: WATER, shape: { kind: "rect", from: [0, 5], to: [11, 6] } },
          { op: "stamp", stamp: HUT, at: [3, 1] },
          { op: "stamp", stamp: WALL, at: [8, 9] },
        ],
        regions: [{ name: "north bank", from: [0, 0], to: [15, 3] }],
        landmarks: [],
        anchors: [
          { id: westDoor, kind: "door", at: [0, 2], entry: [1, 2] },
          { id: eastDoor, kind: "door", at: [0, 11], entry: [1, 11] },
          { id: waypoint, kind: "waypoint", at: [14, 6] },
        ],
      }),
      { ...INPUT, stamps: new Map([[HUT, HUT_STAMP], [WALL, wall]]) },
    );
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(validateDreamMap(result.map, TUNING, ["terrain", "props"])).toEqual([]);
  });
});
