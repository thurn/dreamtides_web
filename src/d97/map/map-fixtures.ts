// Synthetic Tiled fixtures for the D97 map tests: a tiny "library" with an
// 8×6 TMX town (CSV data, an external oversized tileset, collision tile and
// object layers, a group layer, a tile object and a flipped tile), its TMJ twin, and the
// assets (a stamp and an LPC-layout terrain) recipes place. For the map tools'
// tests, `compiledFromRows` builds a compiled map straight from rows of
// walkability characters.

import {
  parseD97StampId,
  parseD97TerrainId,
  parseDreamAnchorId,
  parseDreamMapId,
} from "../../types/identifiers";
import type { CompiledAnchor, CompiledDreamMap } from "./compiled";
import { lpcTerrainCorners, type DreamStamp, type DreamTerrain } from "./assets";
import { dreamMapSourceHash } from "./compile";
import { defineDreamMap, type DreamMapDefinition, type DreamMapRegion } from "./definition";
import type { TiledTileset } from "./tiled";

export const FIXTURE_MAP_PATH = "maps/town.tmx";
export const FIXTURE_WIDTH = 8;
export const FIXTURE_HEIGHT = 6;
/** First gid of the external `props` tileset in the fixture map. */
export const PROPS_FIRST_GID = 17;
/** Raw gid of base tile 2 with Tiled's horizontal-flip bit. */
export const FLIPPED_GID = 0x80000003;

function csv(cells: readonly number[]): string {
  return cells.join(",");
}

function grid(fill: number, set: ReadonlyArray<readonly [number, number, number]> = []): number[] {
  const cells = new Array<number>(FIXTURE_WIDTH * FIXTURE_HEIGHT).fill(fill);
  for (const [x, y, gid] of set) cells[y * FIXTURE_WIDTH + x] = gid;
  return cells;
}

/** Ground: base tile 0 everywhere, gid 1. */
export const GROUND = grid(1);
/** Collision: the right column, gid 2. */
export const COLLISION = grid(0, Array.from({ length: FIXTURE_HEIGHT }, (_, y) => [7, y, 2] as const));
/** Roof (in group "upper"): two cells, gid 3. */
export const ROOF = grid(0, [[2, 1, 3], [3, 1, 3]]);
/** Deco: a colliding base tile (local 5) and a flipped tile. */
export const DECO = grid(0, [[5, 5, 6], [0, 0, FLIPPED_GID]]);

export const FIXTURE_TSX = `<?xml version="1.0" encoding="UTF-8"?>
<tileset version="1.10" name="props" tilewidth="64" tileheight="64" tilecount="4" columns="2">
 <image source="../images/props.png" width="128" height="128"/>
 <tile id="0">
  <properties><property name="collides" type="bool" value="true"/></properties>
 </tile>
</tileset>
`;

export const FIXTURE_TMX = `<?xml version="1.0" encoding="UTF-8"?>
<!-- A synthetic town for the D97 map tests. -->
<map version="1.10" orientation="orthogonal" renderorder="right-down" width="8" height="6" tilewidth="32" tileheight="32" infinite="0">
 <properties><property name="biome" value="meadow &amp; town"/></properties>
 <tileset firstgid="1" name="base" tilewidth="32" tileheight="32" tilecount="16" columns="4">
  <image source="../tiles/base.png" width="128" height="128"/>
  <tile id="5"><properties><property name="collides" type="bool" value="true"/></properties></tile>
  <tile id="6"><objectgroup><object id="1" x="0" y="0" width="32" height="32"/></objectgroup></tile>
 </tileset>
 <tileset firstgid="${String(PROPS_FIRST_GID)}" source="../tilesets/props.tsx"/>
 <layer id="1" name="Ground" width="8" height="6">
  <data encoding="csv">
${csv(GROUND)}
  </data>
 </layer>
 <layer id="2" name="Collision" width="8" height="6" visible="0">
  <data encoding="csv">${csv(COLLISION)}</data>
 </layer>
 <layer id="3" name="Deco" width="8" height="6">
  <data encoding="csv">${csv(DECO)}</data>
 </layer>
 <group id="4" name="upper" offsetx="2" opacity="0.5">
  <properties><property name="season" value="summer"/></properties>
  <layer id="5" name="Roof" width="8" height="6" offsety="3">
   <properties><property name="height" type="int" value="2"/></properties>
   <data encoding="csv">${csv(ROOF)}</data>
  </layer>
 </group>
 <objectgroup id="6" name="Props">
  <object id="7" gid="${String(PROPS_FIRST_GID)}" x="64" y="160" width="64" height="64"/>
  <object id="8" name="spawn" x="16" y="16"><point/></object>
 </objectgroup>
 <objectgroup id="9" name="collision" visible="0">
  <object id="10" x="40" y="0" width="20" height="20"/>
  <object id="11" x="96" y="64"><polygon points="0,0 64,0 64,32 0,32"/></object>
 </objectgroup>
</map>
`;

/** The same town as Tiled JSON, with the given layer data encoder. */
export function fixtureTmj(encode: (cells: readonly number[]) => Record<string, unknown> = (cells) => ({ data: cells })): string {
  const layer = (name: string, cells: readonly number[], extra: Record<string, unknown> = {}) => ({
    type: "tilelayer",
    name,
    width: FIXTURE_WIDTH,
    height: FIXTURE_HEIGHT,
    visible: true,
    opacity: 1,
    ...encode(cells),
    ...extra,
  });
  return JSON.stringify({
    type: "map",
    orientation: "orthogonal",
    width: FIXTURE_WIDTH,
    height: FIXTURE_HEIGHT,
    tilewidth: 32,
    tileheight: 32,
    infinite: false,
    properties: [{ name: "biome", type: "string", value: "meadow & town" }],
    tilesets: [
      {
        firstgid: 1,
        name: "base",
        tilewidth: 32,
        tileheight: 32,
        tilecount: 16,
        columns: 4,
        image: "../tiles/base.png",
        imagewidth: 128,
        imageheight: 128,
        tiles: [
          { id: 5, properties: [{ name: "collides", type: "bool", value: true }] },
          { id: 6, objectgroup: { objects: [{ id: 1, x: 0, y: 0, width: 32, height: 32 }] } },
        ],
      },
      { firstgid: PROPS_FIRST_GID, source: "../tilesets/props.tsx" },
    ],
    layers: [
      layer("Ground", GROUND),
      layer("Collision", COLLISION, { visible: false }),
      layer("Deco", DECO),
      {
        type: "group",
        name: "upper",
        offsetx: 2,
        opacity: 0.5,
        properties: [{ name: "season", type: "string", value: "summer" }],
        layers: [
          layer("Roof", ROOF, {
            offsety: 3,
            properties: [{ name: "height", type: "int", value: 2 }],
          }),
        ],
      },
      {
        type: "objectgroup",
        name: "Props",
        objects: [
          { id: 7, gid: PROPS_FIRST_GID, x: 64, y: 160, width: 64, height: 64 },
          { id: 8, name: "spawn", x: 16, y: 16, point: true },
        ],
      },
      {
        type: "objectgroup",
        name: "collision",
        visible: false,
        objects: [
          { id: 10, x: 40, y: 0, width: 20, height: 20 },
          { id: 11, x: 96, y: 64, polygon: [{ x: 0, y: 0 }, { x: 64, y: 0 }, { x: 64, y: 32 }, { x: 0, y: 32 }] },
        ],
      },
    ],
  });
}

/** The fixture library: path → file text. */
export const FIXTURE_FILES: ReadonlyMap<string, string> = new Map([
  ["maps/town.tmx", FIXTURE_TMX],
  ["tilesets/props.tsx", FIXTURE_TSX],
]);

export function loadFixtureText(path: string): string {
  const text = FIXTURE_FILES.get(path);
  if (text === undefined) throw new Error(`no fixture file ${path}`);
  return text;
}

/** A 3-column sheet holding one LPC terrain block at its origin. */
export const WATER_TILESET: TiledTileset = {
  firstGid: 1,
  name: "water",
  tileWidth: 32,
  tileHeight: 32,
  tileCount: 18,
  columns: 3,
  spacing: 0,
  margin: 0,
  tileOffset: { x: 0, y: 0 },
  image: { path: "terrain/water.png", width: 96, height: 192 },
  tiles: [],
  properties: {},
  externalPath: null,
};

export const WATER = parseD97TerrainId("water");
export const WATER_TERRAIN: DreamTerrain = {
  id: WATER,
  tileset: WATER_TILESET,
  corners: lpcTerrainCorners([0, 0], 3),
  blocksMovement: true,
  layer: "Water",
};

export const HUT = parseD97StampId("hut");
/** A 2×2 hut: walls block, its roof row draws above the player. */
export const HUT_STAMP: DreamStamp = {
  id: HUT,
  width: 2,
  height: 2,
  tilesets: [
    {
      ...WATER_TILESET,
      name: "hut",
      tileCount: 4,
      columns: 2,
      image: { path: "props/hut.png", width: 64, height: 64 },
    },
  ],
  layers: [
    { layer: "Buildings", gids: [1, 2, 0, 0], above: true },
    { layer: "Buildings", gids: [0, 0, 3, 4] },
  ],
  walkability: "..11",
  points: { door: [0, 1] },
};

export const FIXTURE_MAP_ID = parseDreamMapId("6f1d3c38-7c58-4e7e-9a5e-2d8f4b1c0a11");
export const DOOR = parseDreamAnchorId("0b8f8b3e-7f65-4b0e-8d6c-6a4e1f2d9c01");
export const GUARDIAN = parseDreamAnchorId("0b8f8b3e-7f65-4b0e-8d6c-6a4e1f2d9c02");
export const CHEST = parseDreamAnchorId("0b8f8b3e-7f65-4b0e-8d6c-6a4e1f2d9c03");
export const SHOP = parseDreamAnchorId("0b8f8b3e-7f65-4b0e-8d6c-6a4e1f2d9c04");

/** A town map module over the fixture source with no recipe. */
export function fixtureDefinition(
  overrides: Partial<DreamMapDefinition> = {},
): DreamMapDefinition {
  return defineDreamMap({
    id: FIXTURE_MAP_ID,
    source: { kind: "tiled", path: FIXTURE_MAP_PATH, sha256: dreamMapSourceHash(FIXTURE_TMX) },
    recipe: [],
    regions: [{ name: "square", from: [1, 1], to: [4, 3] }],
    landmarks: [{ name: "well", at: [3, 2] }],
    anchors: [],
    ...overrides,
  });
}

/** Anchor ids for maps built by `compiledFromRows`. */
export const ROW_ANCHORS = {
  doorA: parseDreamAnchorId("5c1e7a2e-3b44-4c1d-9f6a-0d2b8e4a7101"),
  doorB: parseDreamAnchorId("5c1e7a2e-3b44-4c1d-9f6a-0d2b8e4a7102"),
  doorC: parseDreamAnchorId("5c1e7a2e-3b44-4c1d-9f6a-0d2b8e4a7103"),
  guardian: parseDreamAnchorId("5c1e7a2e-3b44-4c1d-9f6a-0d2b8e4a7104"),
  chest: parseDreamAnchorId("5c1e7a2e-3b44-4c1d-9f6a-0d2b8e4a7105"),
  shop: parseDreamAnchorId("5c1e7a2e-3b44-4c1d-9f6a-0d2b8e4a7106"),
  waypoint: parseDreamAnchorId("5c1e7a2e-3b44-4c1d-9f6a-0d2b8e4a7107"),
} as const;

/**
 * A compiled map from rows of characters, `#` blocked and anything else
 * walkable, with no tilesets or layers, 32-pixel tiles, and the given
 * anchors and regions.
 */
export function compiledFromRows(
  rows: readonly string[],
  anchors: readonly CompiledAnchor[] = [],
  regions: readonly DreamMapRegion[] = [],
): CompiledDreamMap {
  const width = rows[0]?.length ?? 0;
  if (rows.some((row) => row.length !== width)) throw new Error("rows differ in length");
  const walkable = rows.map((row) => Array.from(row, (cell) => (cell === "#" ? "0" : "1")).join("")).join("");
  return {
    format: 1,
    id: FIXTURE_MAP_ID,
    sourceSha256: null,
    width,
    height: rows.length,
    tileWidth: 32,
    tileHeight: 32,
    tilesets: [],
    layers: [],
    objects: [],
    walkable,
    abovePlayer: "0".repeat(walkable.length),
    regions,
    landmarks: [],
    anchors,
  };
}
