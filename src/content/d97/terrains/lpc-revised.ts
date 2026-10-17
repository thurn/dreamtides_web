// LPC Revised terrains (P23: `lpc-revised/Terrain/`). Every terrain sheet
// is drawn once per season with the same layout; these entries name the
// summer sheet (and the winter sheet for snow), and a `reseason` operation
// moves painted tiles to another season (`./seasons.ts`).
//
// The grass frame has transparent edges, so it lies over any base fill
// (bare dirt, sand) on a lower layer; the water frames carry their banks.

import { defineD97Terrain, type D97CatalogTerrain } from "../../../d97/map/terrain-catalog";
import { parseD97TerrainId } from "../../../types/identifiers";

const SUMMER = { path: "lpc-revised/Terrain/terrain_summer.png", width: 512, height: 832 } as const;
const WINTER = { path: "lpc-revised/Terrain/terrain_winter.png", width: 512, height: 832 } as const;

const GRASS_LAYOUT = {
  kind: "corners",
  outer: [0, 0],
  inner: [0, 6],
  full: [[1, 1], [3, 1], [4, 1], [5, 1], [3, 2], [4, 2], [5, 2]],
} as const;

export const LPC_REVISED_TERRAINS: readonly D97CatalogTerrain[] = [
  defineD97Terrain({
    id: parseD97TerrainId("756a5332-1d9b-4f82-a9c3-34ad3a102e4e"),
    name: "revised grass",
    family: "grass",
    sheet: SUMMER,
    layout: GRASS_LAYOUT,
    blocksMovement: false,
    layer: "Grass",
  }),
  defineD97Terrain({
    id: parseD97TerrainId("e8de0d85-42f1-440c-af0e-c97e639c1b72"),
    name: "revised snow",
    family: "snow",
    sheet: WINTER,
    layout: GRASS_LAYOUT,
    blocksMovement: false,
    layer: "Grass",
  }),
  defineD97Terrain({
    id: parseD97TerrainId("0e70e5da-3060-49dd-8d81-9503c3c28741"),
    name: "revised bare dirt",
    family: "dirt",
    sheet: SUMMER,
    layout: { kind: "edgeless", full: [[3, 3], [4, 3], [5, 3], [3, 4], [4, 4], [5, 4]] },
    blocksMovement: false,
    layer: "Ground",
  }),
  defineD97Terrain({
    id: parseD97TerrainId("efba8abf-d606-43de-b715-8c0492c33bc4"),
    name: "revised bare sand",
    family: "sand",
    sheet: SUMMER,
    layout: { kind: "edgeless", full: [[3, 5], [4, 5], [5, 5]] },
    blocksMovement: false,
    layer: "Ground",
  }),
  defineD97Terrain({
    id: parseD97TerrainId("4f7e2530-7dc7-49d3-be5b-64f3011e1838"),
    name: "revised cobbles on dirt",
    family: "stone",
    sheet: SUMMER,
    layout: { kind: "corners", outer: [9, 0], inner: [9, 3], full: [[10, 1]] },
    blocksMovement: false,
    layer: "Paths",
  }),
  defineD97Terrain({
    id: parseD97TerrainId("7bfa0202-4794-491a-b8af-3f96ed1e9d62"),
    name: "revised pond in grass",
    family: "water",
    sheet: SUMMER,
    layout: { kind: "corners", outer: [0, 10], inner: [0, 13], full: [[1, 11]] },
    blocksMovement: true,
    layer: "Water",
  }),
  defineD97Terrain({
    id: parseD97TerrainId("3df34f2c-c6f8-4355-a311-ca40a6d6a65a"),
    name: "revised pond in dirt",
    family: "water",
    sheet: SUMMER,
    layout: { kind: "corners", outer: [6, 10], inner: [6, 13], full: [[7, 11]] },
    blocksMovement: true,
    layer: "Water",
  }),
  defineD97Terrain({
    id: parseD97TerrainId("a2eed9d6-305d-49c3-98fd-0dc62a3db9a7"),
    name: "revised water on sand",
    family: "water",
    sheet: SUMMER,
    layout: { kind: "corners", outer: [0, 20], inner: [3, 20], full: [[1, 21]] },
    blocksMovement: true,
    layer: "Water",
  }),
  defineD97Terrain({
    id: parseD97TerrainId("c4d1d19a-b50d-4a9f-8fe8-adafa907ee3c"),
    name: "revised deep water",
    family: "deep-water",
    sheet: SUMMER,
    layout: { kind: "corners", outer: [0, 23], inner: [3, 23], full: [[1, 24]] },
    blocksMovement: true,
    layer: "Deep water",
  }),
];
