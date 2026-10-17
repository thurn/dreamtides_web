// LPC Tile Atlas terrains (P23: `lpc-tile-atlas/files/terrain_atlas.png`),
// standard LPC 3×6 blocks (`lpcBlockLayout`). Grass, dirt and sand have
// transparent edges and lie over a base; the water blocks carry their banks.

import { lpcBlockLayout, type TerrainSheetLayout } from "../../../d97/map/assets";
import type { TilePoint } from "../../../d97/map/definition";
import { defineD97Terrain, type D97CatalogTerrain } from "../../../d97/map/terrain-catalog";
import { parseD97TerrainId } from "../../../types/identifiers";

const ATLAS = { path: "lpc-tile-atlas/files/terrain_atlas.png", width: 1024, height: 1024 } as const;

function block(origin: TilePoint, fullRow = true): { readonly kind: "corners" } & TerrainSheetLayout {
  return { kind: "corners", ...lpcBlockLayout(origin, fullRow) };
}

export const LPC_TILE_ATLAS_TERRAINS: readonly D97CatalogTerrain[] = [
  defineD97Terrain({
    id: parseD97TerrainId("085a116e-a0b9-4ec1-a61c-5aae5953a9dc"),
    name: "atlas grass",
    family: "grass",
    sheet: ATLAS,
    layout: block([21, 0]),
    blocksMovement: false,
    layer: "Grass",
  }),
  defineD97Terrain({
    id: parseD97TerrainId("1e3b6cbc-695a-41f5-9aa6-1bef094dff62"),
    name: "atlas flower meadow",
    family: "grass",
    sheet: ATLAS,
    layout: block([21, 6]),
    blocksMovement: false,
    layer: "Grass",
  }),
  defineD97Terrain({
    id: parseD97TerrainId("6e18ad50-e7be-4622-b33c-bd3dd6efc0f5"),
    name: "atlas dirt",
    family: "dirt",
    sheet: ATLAS,
    layout: block([15, 0]),
    blocksMovement: false,
    layer: "Dirt",
  }),
  defineD97Terrain({
    id: parseD97TerrainId("1187c5f2-be30-4c05-8ff3-5a23422c9fda"),
    name: "atlas red dirt",
    family: "dirt",
    sheet: ATLAS,
    layout: block([18, 0]),
    blocksMovement: false,
    layer: "Dirt",
  }),
  defineD97Terrain({
    id: parseD97TerrainId("5e467aa6-889c-423b-8e65-9c2498d1a558"),
    name: "atlas sand",
    family: "sand",
    sheet: ATLAS,
    layout: block([0, 9]),
    blocksMovement: false,
    layer: "Sand",
  }),
  defineD97Terrain({
    id: parseD97TerrainId("5c92e2bf-a4b8-41d2-a03b-737720fe4303"),
    name: "atlas cave stone",
    family: "stone",
    sheet: ATLAS,
    layout: block([18, 6]),
    blocksMovement: false,
    layer: "Ground",
  }),
  defineD97Terrain({
    id: parseD97TerrainId("314ffed7-2195-4ff3-a51b-855956f812ab"),
    name: "atlas water on sand",
    family: "water",
    sheet: ATLAS,
    layout: block([3, 9]),
    blocksMovement: true,
    layer: "Water",
  }),
  defineD97Terrain({
    id: parseD97TerrainId("6d492b74-03e8-4165-b1dd-d144c21c4674"),
    name: "atlas water in grass",
    family: "water",
    sheet: ATLAS,
    layout: block([6, 9], false),
    blocksMovement: true,
    layer: "Water",
  }),
  defineD97Terrain({
    id: parseD97TerrainId("fcb893b9-94b1-4e79-ab4d-bd1f90e1d111"),
    name: "atlas water in dirt",
    family: "water",
    sheet: ATLAS,
    layout: block([9, 9], false),
    blocksMovement: true,
    layer: "Water",
  }),
  defineD97Terrain({
    id: parseD97TerrainId("5596fd34-d557-41d9-8518-2fd3415ea659"),
    name: "atlas lava",
    family: "lava",
    sheet: ATLAS,
    layout: block([15, 6]),
    blocksMovement: true,
    layer: "Lava",
  }),
  defineD97Terrain({
    id: parseD97TerrainId("1c3d1f7b-a40a-46da-a692-a79ca83aa001"),
    name: "atlas dirt pit",
    family: "pit",
    sheet: ATLAS,
    layout: block([24, 0]),
    blocksMovement: true,
    layer: "Pits",
  }),
  defineD97Terrain({
    id: parseD97TerrainId("4b877ed5-ef52-411e-a1e9-ada0f68a854c"),
    name: "atlas chasm",
    family: "pit",
    sheet: ATLAS,
    layout: block([27, 0]),
    blocksMovement: true,
    layer: "Pits",
  }),
];
