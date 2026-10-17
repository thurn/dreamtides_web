// The recipe compiler contract over the synthetic town: the pinned source
// hash gates compilation; walkability derives from collision layers, tile
// properties, collision shapes and tile objects; each recipe operation has
// its pinned effect on tiles, layers and the walkability grid; anchors
// resolve (landmarks, door entries, guardian and chest references) or report
// errors; and compilation is deterministic.

import { describe, expect, it } from "vitest";
import { parseD97StampId, parseDreamAnchorId, parseDreamMapSourceHash } from "../../types/identifiers";
import type { DreamTerrain } from "./assets";
import { compileDreamMap, dreamMapSourceHash, type DreamMapCompileInput } from "./compile";
import { isWalkable, type CompiledDreamMap } from "./compiled";
import type { DreamMapDefinition, DreamMapRecipeOp } from "./definition";
import {
  CHEST,
  DOOR,
  FIXTURE_TMX,
  FLIPPED_GID,
  GUARDIAN,
  HUT,
  HUT_STAMP,
  PROPS_FIRST_GID,
  SHOP,
  WATER,
  WATER_TERRAIN,
  fixtureDefinition,
  fixtureTmj,
  loadFixtureText,
} from "./map-fixtures";

const INPUT: DreamMapCompileInput = {
  source: { text: FIXTURE_TMX, loadText: loadFixtureText },
  stamps: new Map([[HUT, HUT_STAMP]]),
  terrains: new Map([[WATER, WATER_TERRAIN]]),
};

function compile(definition: DreamMapDefinition, input: DreamMapCompileInput = INPUT): CompiledDreamMap {
  const result = compileDreamMap(definition, input);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.map;
}

function withRecipe(...recipe: DreamMapRecipeOp[]): CompiledDreamMap {
  return compile(fixtureDefinition({ recipe }));
}

function blank(recipe: DreamMapRecipeOp[]): CompiledDreamMap {
  return compile(
    fixtureDefinition({
      source: { kind: "blank", width: 6, height: 6, tileWidth: 32, tileHeight: 32 },
      regions: [],
      landmarks: [],
      recipe,
    }),
  );
}

function gidAt(map: CompiledDreamMap, layer: string, x: number, y: number): number | undefined {
  return map.layers.find((entry) => entry.name === layer)?.gids[y * map.width + x];
}

function blockedCells(map: CompiledDreamMap): string[] {
  const out: string[] = [];
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) if (!isWalkable(map, [x, y])) out.push(`${String(x)},${String(y)}`);
  }
  return out;
}

const RIGHT_WALL = ["7,0", "7,1", "7,2", "7,3", "7,4", "7,5"];

describe("source hash", () => {
  it("reports a mismatch with both hashes instead of compiling", () => {
    const stale = parseDreamMapSourceHash("0".repeat(64));
    const result = compileDreamMap(
      fixtureDefinition({ source: { kind: "tiled", path: "maps/town.tmx", sha256: stale } }),
      INPUT,
    );
    expect(result).toEqual({
      ok: false,
      errors: [{ kind: "source-hash-mismatch", expected: stale, actual: dreamMapSourceHash(FIXTURE_TMX) }],
    });
  });

  it("reports a missing source", () => {
    const result = compileDreamMap(fixtureDefinition(), { ...INPUT, source: null });
    expect(result.ok === false && result.errors[0]?.kind).toBe("source");
  });
});

describe("walkability derivation", () => {
  it("blocks collision-layer cells and shapes, blocking tile properties and colliding tile objects", () => {
    const map = withRecipe();
    expect(blockedCells(map).sort()).toEqual(["1,0", "3,2", "4,2", "2,4", "3,4", "5,5", ...RIGHT_WALL].sort());
    expect(map.layers.map((layer) => layer.name)).toEqual(["Ground", "Deco", "Roof"]);
    expect(map.objects).toEqual([
      { gid: PROPS_FIRST_GID, x: 64, y: 160, width: 64, height: 64, layer: "Props", above: false },
    ]);
  });

  it("follows the module's blocking layers and properties", () => {
    const map = compile(
      fixtureDefinition({ walkability: { blockingLayers: ["Deco"], blockingObjectLayers: [], blockingTileProperties: [] } }),
    );
    // Deco now blocks wherever it has a tile and is not drawn; the hidden
    // Collision layer neither blocks nor draws; property blocking is off.
    expect(blockedCells(map).sort()).toEqual(["0,0", "5,5"]);
    expect(map.layers.map((layer) => layer.name)).toEqual(["Ground", "Roof"]);
  });
});

describe("recipe operations", () => {
  it("crop keeps the rectangle and shifts tiles and objects", () => {
    const map = withRecipe({ op: "crop", from: [1, 1], to: [6, 5] });
    expect([map.width, map.height]).toEqual([6, 5]);
    expect(gidAt(map, "Roof", 1, 0)).toBe(3);
    expect(map.objects[0]).toMatchObject({ x: 32, y: 128 });
    expect(blockedCells(map).sort()).toEqual(["2,1", "3,1", "1,3", "2,3", "4,4"].sort());
  });

  it("erase clears tiles on the named layers, or all, and earlier overrides", () => {
    const one = withRecipe({ op: "erase", from: [5, 5], to: [5, 5], layers: ["Deco"] });
    expect(gidAt(one, "Deco", 5, 5)).toBe(0);
    expect(isWalkable(one, [5, 5])).toBe(true);

    const all = withRecipe({ op: "erase", from: [6, 0], to: [7, 1] });
    expect(gidAt(all, "Ground", 7, 0)).toBe(0);
    expect(isWalkable(all, [7, 0])).toBe(true);
    expect(isWalkable(all, [7, 2])).toBe(false);

    const reset = withRecipe(
      { op: "block", from: [0, 1], to: [0, 1] },
      { op: "erase", from: [0, 1], to: [0, 1], layers: ["Deco"] },
    );
    expect(isWalkable(reset, [0, 1])).toBe(true);
  });

  it("stamp places remapped tiles, lifts its above layer and applies its walkability", () => {
    const map = withRecipe(
      { op: "stamp", stamp: HUT, at: [0, 2] },
      { op: "stamp", stamp: HUT, at: [4, 0] },
    );
    const hut = map.tilesets.filter((tileset) => tileset.name === "hut");
    expect(hut).toHaveLength(1);
    const first = hut[0].firstGid;
    expect(first).toBe(PROPS_FIRST_GID + 4);
    expect([gidAt(map, "Buildings", 0, 3), gidAt(map, "Buildings", 1, 3)]).toEqual([first + 2, first + 3]);
    expect([gidAt(map, "Buildings:above", 0, 2), gidAt(map, "Buildings:above", 1, 2)]).toEqual([first, first + 1]);
    expect(gidAt(map, "Buildings", 0, 2)).toBe(0);
    expect(map.layers.find((layer) => layer.name === "Buildings:above")?.above).toBe(true);
    expect(map.abovePlayer[2 * map.width]).toBe("1");
    expect(isWalkable(map, [0, 2])).toBe(true);
    expect([isWalkable(map, [0, 3]), isWalkable(map, [1, 3])]).toEqual([false, false]);
  });

  it("paintTerrain auto-tiles corners, edges, inner corners and blocking full cells", () => {
    const map = blank([{ op: "paintTerrain", terrain: WATER, layer: "Water", shape: { kind: "rect", from: [2, 2], to: [3, 3] } }]);
    const first = map.tilesets.find((tileset) => tileset.name === "water")!.firstGid;
    const fulls = [10, 15, 16, 17].map((local) => first + local);
    for (const [x, y] of [[2, 2], [3, 2], [2, 3], [3, 3]] as const) {
      expect(fulls).toContain(gidAt(map, "Water", x, y));
      expect(isWalkable(map, [x, y])).toBe(false);
    }
    expect(gidAt(map, "Water", 1, 1)).toBe(first + 6);
    expect(gidAt(map, "Water", 2, 1)).toBe(first + 7);
    expect(gidAt(map, "Water", 1, 2)).toBe(first + 9);
    expect(gidAt(map, "Water", 4, 4)).toBe(first + 14);
    expect(gidAt(map, "Water", 0, 0)).toBe(0);
    expect(isWalkable(map, [1, 1])).toBe(true);

    const inner = blank([{ op: "paintTerrain", terrain: WATER, layer: "Water", shape: { kind: "cells", cells: [[2, 2], [3, 2], [2, 3]] } }]);
    expect(gidAt(inner, "Water", 3, 3)).toBe(first + 1);
  });

  it("paintTerrain merges with terrain already on the layer and paints paths", () => {
    const map = blank([
      { op: "paintTerrain", terrain: WATER, layer: "Water", shape: { kind: "rect", from: [2, 2], to: [3, 3] } },
      { op: "paintTerrain", terrain: WATER, layer: "Water", shape: { kind: "rect", from: [4, 2], to: [4, 2] } },
    ]);
    const first = map.tilesets.find((tileset) => tileset.name === "water")!.firstGid;
    expect([10, 15, 16, 17].map((local) => first + local)).toContain(gidAt(map, "Water", 4, 2));
    expect(gidAt(map, "Water", 5, 2)).toBe(first + 11);

    const path = blank([{ op: "paintTerrain", terrain: WATER, layer: "Water", shape: { kind: "path", points: [[1, 1], [4, 1], [4, 4]] } }]);
    expect(blockedCells(path).sort()).toEqual(["1,1", "2,1", "3,1", "4,1", "4,2", "4,3", "4,4"].sort());
  });

  it("hideLayer removes a layer's drawing and its blocking", () => {
    const deco = withRecipe({ op: "hideLayer", layer: "Deco" });
    expect(deco.layers.map((layer) => layer.name)).not.toContain("Deco");
    expect(isWalkable(deco, [5, 5])).toBe(true);
    const collision = withRecipe({ op: "hideLayer", layer: "Collision" });
    expect(isWalkable(collision, [7, 0])).toBe(true);
    const props = withRecipe({ op: "hideLayer", layer: "Props" });
    expect(props.objects).toEqual([]);
    expect(isWalkable(props, [2, 4])).toBe(true);
    const shapes = withRecipe({ op: "hideLayer", layer: "collision" });
    expect([isWalkable(shapes, [1, 0]), isWalkable(shapes, [3, 2])]).toEqual([true, true]);
  });

  it("acts on every layer sharing a name when hiding or lifting, and paints the topmost", () => {
    const tmx = `<map orientation="orthogonal" width="2" height="1" tilewidth="32" tileheight="32">
 <tileset firstgid="1" name="t" tilewidth="32" tileheight="32" tilecount="4" columns="2"><image source="t.png" width="64" height="64"/></tileset>
 <layer name="Ground" width="2" height="1"><data encoding="csv">1,1</data></layer>
 <layer name="Ground" width="2" height="1"><data encoding="csv">0,2</data></layer>
</map>`;
    const input = { ...INPUT, source: { text: tmx, loadText: loadFixtureText } };
    const definition = (recipe: DreamMapRecipeOp[]) =>
      fixtureDefinition({
        source: { kind: "tiled", path: "maps/twin.tmx", sha256: dreamMapSourceHash(tmx) },
        regions: [],
        landmarks: [],
        recipe,
      });
    expect(compile(definition([{ op: "hideLayer", layer: "Ground" }]), input).layers).toEqual([]);
    const lifted = compile(definition([{ op: "abovePlayer", layer: "Ground" }]), input);
    expect(lifted.layers.map((layer) => layer.above)).toEqual([true, true]);
    const stamped = compile(definition([{ op: "stamp", stamp: HUT, at: [0, 0] }]), {
      ...input,
      stamps: new Map([[HUT, { ...HUT_STAMP, width: 1, height: 1, layers: [{ layer: "Ground", gids: [1] }], walkability: "." }]]),
    });
    expect(stamped.layers.map((layer) => layer.gids[0])).toEqual([1, 5]);
  });

  it("abovePlayer lifts a whole layer, part of a layer, or an object layer", () => {
    const whole = withRecipe({ op: "abovePlayer", layer: "Roof" });
    expect(whole.layers.find((layer) => layer.name === "Roof")?.above).toBe(true);
    expect([whole.abovePlayer[1 * 8 + 2], whole.abovePlayer[1 * 8 + 1]]).toEqual(["1", "0"]);

    const part = withRecipe({ op: "abovePlayer", layer: "Deco", from: [0, 0], to: [0, 0] });
    expect(gidAt(part, "Deco", 0, 0)).toBe(0);
    expect(gidAt(part, "Deco:above", 0, 0)).toBe(FLIPPED_GID);
    expect(gidAt(part, "Deco", 5, 5)).toBe(6);
    expect(part.abovePlayer[0]).toBe("1");

    const objects = withRecipe({ op: "abovePlayer", layer: "Props" });
    expect(objects.objects[0]?.above).toBe(true);
  });

  it("block and open override derived walkability", () => {
    const map = withRecipe({ op: "block", from: [0, 0], to: [1, 0] }, { op: "open", from: [7, 2], to: [7, 2] });
    expect([isWalkable(map, [0, 0]), isWalkable(map, [1, 0])]).toEqual([false, false]);
    expect(isWalkable(map, [7, 2])).toBe(true);
  });

  it("reports the first failing operation by index", () => {
    const result = compileDreamMap(
      fixtureDefinition({
        recipe: [
          { op: "block", from: [0, 0], to: [0, 0] },
          { op: "stamp", stamp: parseD97StampId("missing"), at: [0, 0] },
        ],
      }),
      INPUT,
    );
    expect(result.ok === false && result.errors.map((error) => [error.kind, "index" in error ? error.index : null])).toEqual([["recipe", 1]]);
    for (const op of [
      { op: "crop", from: [0, 0], to: [9, 9] },
      { op: "hideLayer", layer: "Nope" },
      { op: "paintTerrain", terrain: WATER, layer: "W", shape: { kind: "path", points: [[0, 0], [2, 2]] } },
    ] as const) {
      expect(compileDreamMap(fixtureDefinition({ recipe: [op] }), INPUT).ok).toBe(false);
    }
  });

  it("rejects a terrain without a full piece", () => {
    const broken: DreamTerrain = { ...WATER_TERRAIN, corners: {} };
    const result = compileDreamMap(
      fixtureDefinition({ recipe: [{ op: "paintTerrain", terrain: WATER, layer: "W", shape: { kind: "rect", from: [0, 0], to: [0, 0] } }] }),
      { ...INPUT, terrains: new Map([[WATER, broken]]) },
    );
    expect(result.ok).toBe(false);
  });
});

describe("anchors", () => {
  it("resolves landmarks, door entries and guardian and chest references", () => {
    const map = compile(
      fixtureDefinition({
        anchors: [
          { id: DOOR, kind: "door", at: { landmark: "well" }, entry: [3, 3] },
          { id: GUARDIAN, kind: "guardian", at: [2, 2], blocksDoor: DOOR },
          { id: CHEST, kind: "chest", at: [1, 1], behindGuardian: GUARDIAN },
          { id: SHOP, kind: "shop", at: [0, 5] },
        ],
      }),
    );
    expect(map.anchors).toEqual([
      { id: DOOR, kind: "door", at: [3, 2], entry: [3, 3] },
      { id: GUARDIAN, kind: "guardian", at: [2, 2], blocksDoor: DOOR },
      { id: CHEST, kind: "chest", at: [1, 1], behindGuardian: GUARDIAN },
      { id: SHOP, kind: "shop", at: [0, 5] },
    ]);
  });

  it("reports bad references, duplicates, unknown landmarks and off-map anchors", () => {
    const stray = parseDreamAnchorId("0b8f8b3e-7f65-4b0e-8d6c-6a4e1f2d9c09");
    const result = compileDreamMap(
      fixtureDefinition({
        anchors: [
          { id: SHOP, kind: "shop", at: [0, 5] },
          { id: GUARDIAN, kind: "guardian", at: [2, 2], blocksDoor: SHOP },
          { id: CHEST, kind: "chest", at: [1, 1], behindGuardian: SHOP },
          { id: SHOP, kind: "challenger", at: [1, 5] },
          { id: DOOR, kind: "door", at: { landmark: "nowhere" }, entry: [0, 0] },
          { id: stray, kind: "object", at: [8, 0] },
        ],
      }),
      INPUT,
    );
    expect(result.ok === false && result.errors.map((error) => (error.kind === "anchor" ? error.anchorId : error.kind)).sort()).toEqual(
      [SHOP, GUARDIAN, CHEST, DOOR, stray].sort(),
    );
  });

  it("reports duplicate and off-map regions and landmarks", () => {
    const result = compileDreamMap(
      fixtureDefinition({
        regions: [
          { name: "square", from: [0, 0], to: [1, 1] },
          { name: "square", from: [0, 0], to: [9, 1] },
        ],
        landmarks: [{ name: "well", at: [8, 8] }],
      }),
      INPUT,
    );
    expect(result.ok === false && result.errors.length).toBe(3);
  });
});

describe("determinism", () => {
  it("compiles the same input to the same output, and the TMJ twin to the same map", () => {
    const recipe: DreamMapRecipeOp[] = [
      { op: "crop", from: [0, 0], to: [6, 5] },
      { op: "stamp", stamp: HUT, at: [0, 2] },
      { op: "paintTerrain", terrain: WATER, layer: "Water", shape: { kind: "rect", from: [4, 1], to: [5, 2] } },
      { op: "abovePlayer", layer: "Roof" },
    ];
    const first = withRecipe(...recipe);
    const second = withRecipe(...recipe);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));

    const tmj = fixtureTmj();
    const twin = compile(
      fixtureDefinition({ recipe, source: { kind: "tiled", path: "maps/town.tmx", sha256: dreamMapSourceHash(tmj) } }),
      { ...INPUT, source: { text: tmj, loadText: loadFixtureText } },
    );
    expect({ ...twin, sourceSha256: null }).toEqual({ ...first, sourceSha256: null });
  });
});
