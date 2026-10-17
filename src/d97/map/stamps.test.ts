// Stamp extraction from a compiled synthetic town: the extracted stamp keeps
// the requested footprint, its tiles over renumbered tilesets, the
// walkability and above-player masks, and named points, and placing it back
// with a recipe reproduces the cut.

import { describe, expect, it } from "vitest";
import { parseD97StampId, parseDreamAnchorId } from "../../types/identifiers";
import { compileDreamMap, type DreamMapCompileInput } from "./compile";
import type { CompiledDreamMap } from "./compiled";
import type { DreamMapDefinition } from "./definition";
import { FIXTURE_TMX, HUT, HUT_STAMP, fixtureDefinition, loadFixtureText } from "./map-fixtures";
import { extractStamp, stampAbovePlayerMask, stampModuleSource, stampPreviewMap } from "./stamps";

const INPUT: DreamMapCompileInput = {
  source: { text: FIXTURE_TMX, loadText: loadFixtureText },
  stamps: new Map([[HUT, HUT_STAMP]]),
  terrains: new Map(),
};

function compile(definition: DreamMapDefinition, input: DreamMapCompileInput = INPUT): CompiledDreamMap {
  const result = compileDreamMap(definition, input);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.map;
}

const EXTRACTED = parseD97StampId("3f9b2c4e-1a2b-4c3d-8e4f-5a6b7c8d9e0f");
const SHOP_ANCHOR = parseDreamAnchorId("3f9b2c4e-1a2b-4c3d-8e4f-5a6b7c8d9e01");

const town = compile(
  fixtureDefinition({
    recipe: [{ op: "stamp", stamp: HUT, at: [0, 2] }],
    landmarks: [{ name: "step", at: [0, 3] }],
    anchors: [{ id: SHOP_ANCHOR, kind: "shop", at: [1, 2] }],
  }),
);

describe("extractStamp", () => {
  const { stamp } = extractStamp(town, { from: [0, 2], to: [1, 3] }, { id: EXTRACTED, name: "hut", theme: "building", origin: "town" });

  it("keeps the requested footprint, identity and origin", () => {
    expect(stamp).toMatchObject({ id: EXTRACTED, name: "hut", width: 2, height: 2 });
    expect(stamp.extractedFrom).toEqual({ map: "town", rect: { from: [0, 2], to: [1, 3] }, sourceSha256: town.sourceSha256 });
  });

  it("writes blocked cells as 1 and walkable cells as 0, and derives the above-player mask", () => {
    expect(stamp.walkability).toBe("0011");
    expect(stampAbovePlayerMask(stamp)).toBe("1100");
  });

  it("renumbers the tilesets it uses from gid 1 and keeps each layer's tiles", () => {
    expect(stamp.tilesets.map((tileset) => [tileset.name, tileset.firstGid])).toEqual([
      ["base", 1],
      ["hut", 17],
    ]);
    expect(stamp.layers).toEqual([
      { layer: "Ground", gids: [1, 1, 1, 1] },
      { layer: "Buildings", gids: [0, 0, 19, 20] },
      { layer: "Buildings", gids: [17, 18, 0, 0], above: true },
    ]);
  });

  it("names points for landmarks and anchors inside the rectangle", () => {
    expect(stamp.points).toEqual({ step: [0, 1], "shop-1": [1, 0] });
  });

  it("places back through a recipe with the same tiles and walkability", () => {
    const placed = compile(
      fixtureDefinition({ source: { kind: "blank", width: 2, height: 2, tileWidth: 32, tileHeight: 32 }, regions: [], landmarks: [], recipe: [{ op: "stamp", stamp: EXTRACTED, at: [0, 0] }] }),
      { source: null, stamps: new Map([[EXTRACTED, stamp]]), terrains: new Map() },
    );
    expect(placed.walkable).toBe("1100");
    expect(placed.abovePlayer).toBe("1100");
    expect(stampPreviewMap(stamp).walkable).toBe(placed.walkable);
  });

  it("rejects a rectangle leaving the map", () => {
    expect(() => extractStamp(town, { from: [6, 4], to: [8, 5] }, { id: EXTRACTED, name: "edge", theme: "building", origin: "town" })).toThrow(RangeError);
  });

  it("writes a module that names the stamp's id", () => {
    expect(stampModuleSource(stamp)).toContain(`parseD97StampId("${EXTRACTED}")`);
  });
});
