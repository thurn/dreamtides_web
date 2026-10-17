// Catalog terrains derive their corner tables from a sheet layout: a corner
// frame matches the standard LPC block table, and an edgeless fill holds
// only full pieces and draws only fully covered cells.

import { describe, expect, it } from "vitest";
import { parseD97TerrainId } from "../../types/identifiers";
import { lpcBlockLayout, lpcTerrainCorners, TERRAIN_CORNER, TERRAIN_FULL } from "./assets";
import { defineD97Terrain } from "./terrain-catalog";

const SHEET = { path: "terrain/sheet.png", width: 320, height: 320 } as const;

describe("defineD97Terrain", () => {
  it("derives a corner frame's table from its layout", () => {
    const terrain = defineD97Terrain({
      id: parseD97TerrainId("grass"),
      name: "grass",
      family: "grass",
      sheet: SHEET,
      layout: { kind: "corners", ...lpcBlockLayout([3, 2]) },
      blocksMovement: false,
      layer: "Grass",
    });
    expect(terrain.corners).toEqual(lpcTerrainCorners([3, 2], 10));
    expect(terrain.tileset).toMatchObject({ columns: 10, tileCount: 100, image: { path: "terrain/sheet.png" } });
    expect(terrain.edgeless).toBeUndefined();
    // The outer frame's top-left piece covers only its south-east corner.
    expect(terrain.corners[TERRAIN_CORNER.se]).toEqual([4 * 10 + 3]);
  });

  it("gives an edgeless fill only full pieces", () => {
    const terrain = defineD97Terrain({
      id: parseD97TerrainId("dirt"),
      name: "dirt",
      family: "dirt",
      sheet: SHEET,
      layout: { kind: "edgeless", full: [[1, 0], [2, 1]] },
      blocksMovement: false,
      layer: "Ground",
    });
    expect(terrain.corners).toEqual({ [TERRAIN_FULL]: [1, 12] });
    expect(terrain.edgeless).toBe(true);
  });
});
