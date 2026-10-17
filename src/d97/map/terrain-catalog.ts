// The D97 terrain catalog format: auto-tiled terrains a `brush` (or
// `paintTerrain`) paints, each named by UUID and described by its library
// sheet and where its corner pieces sit on that sheet. `defineD97Terrain`
// derives the compiler's corner table from the layout, so a catalog entry
// is a sheet path and a few tile coordinates.

import type { D97TerrainId } from "../../types/identifiers";
import { TERRAIN_FULL, terrainCorners, type DreamTerrain, type TerrainSheetLayout } from "./assets";
import type { TilePoint } from "./definition";
import { sheetTileset, type SheetImage } from "./sheets";

/** What a terrain is, for listings, themes and briefs. */
export type D97TerrainFamily =
  | "grass"
  | "dirt"
  | "sand"
  | "snow"
  | "water"
  | "deep-water"
  | "stone"
  | "lava"
  | "pit";

/** Where a terrain's pieces sit: an auto-tiled frame, or only full pieces (a base fill). */
export type D97TerrainLayout =
  | ({ readonly kind: "corners" } & TerrainSheetLayout)
  | { readonly kind: "edgeless"; readonly full: readonly TilePoint[] };

export interface D97TerrainSpec {
  readonly id: D97TerrainId;
  /** Display name for authoring; the id is the identity. */
  readonly name: string;
  readonly family: D97TerrainFamily;
  readonly sheet: SheetImage;
  readonly layout: D97TerrainLayout;
  readonly blocksMovement: boolean;
  /** The tile layer a `brush` paints by default. */
  readonly layer: string;
}

export interface D97CatalogTerrain extends DreamTerrain {
  readonly name: string;
  readonly family: D97TerrainFamily;
  readonly layout: D97TerrainLayout;
}

/** The tile size of every LPC sheet the catalog names. */
const LPC_TILE = 32;

/** Declare a catalog terrain; its tileset and corner table derive from the sheet and layout. */
export function defineD97Terrain(spec: D97TerrainSpec): D97CatalogTerrain {
  const tileset = sheetTileset(spec.sheet, LPC_TILE);
  const corners =
    spec.layout.kind === "corners"
      ? terrainCorners(spec.layout, tileset.columns)
      : { [TERRAIN_FULL]: spec.layout.full.map(([x, y]) => y * tileset.columns + x) };
  return {
    id: spec.id,
    name: spec.name,
    family: spec.family,
    layout: spec.layout,
    tileset,
    corners,
    blocksMovement: spec.blocksMovement,
    layer: spec.layer,
    ...(spec.layout.kind === "edgeless" ? { edgeless: true } : {}),
  };
}
