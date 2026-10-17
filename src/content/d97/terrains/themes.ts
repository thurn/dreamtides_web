// Map themes for `npm run d97:map -- compose`: for each stamp theme, the
// terrains a blank-canvas scaffold starts from. A scaffold fills the map
// with `base`, lays `cover` over it, brushes a winding `path` (painting a
// terrain, or erasing the cover to show the base), digs a `water` pond, and
// reseasons the result when the theme names a season. The author then edits
// the module.

import type { D97Season } from "../../../d97/map/definition";
import type { D97StampTheme } from "../../../d97/map/stamps";
import type { D97TerrainId } from "../../../types/identifiers";
import { parseD97TerrainId } from "../../../types/identifiers";

export interface D97MapTheme {
  readonly theme: D97StampTheme;
  readonly base: D97TerrainId;
  readonly cover?: D97TerrainId;
  readonly path: { readonly terrain: D97TerrainId; readonly erase: boolean };
  readonly water?: D97TerrainId;
  readonly season?: D97Season;
}

const REVISED_GRASS = parseD97TerrainId("756a5332-1d9b-4f82-a9c3-34ad3a102e4e");
const REVISED_SNOW = parseD97TerrainId("e8de0d85-42f1-440c-af0e-c97e639c1b72");
const REVISED_DIRT = parseD97TerrainId("0e70e5da-3060-49dd-8d81-9503c3c28741");
const REVISED_SAND = parseD97TerrainId("efba8abf-d606-43de-b715-8c0492c33bc4");
const REVISED_COBBLES = parseD97TerrainId("4f7e2530-7dc7-49d3-be5b-64f3011e1838");
const REVISED_POND = parseD97TerrainId("7bfa0202-4794-491a-b8af-3f96ed1e9d62");
const REVISED_SAND_WATER = parseD97TerrainId("a2eed9d6-305d-49c3-98fd-0dc62a3db9a7");
const ATLAS_CAVE_STONE = parseD97TerrainId("5c92e2bf-a4b8-41d2-a03b-737720fe4303");
const ATLAS_DIRT = parseD97TerrainId("6e18ad50-e7be-4622-b33c-bd3dd6efc0f5");
const ATLAS_CHASM = parseD97TerrainId("4b877ed5-ef52-411e-a1e9-ada0f68a854c");
const ATLAS_RED_DIRT = parseD97TerrainId("1187c5f2-be30-4c05-8ff3-5a23422c9fda");

export const D97_MAP_THEMES: readonly D97MapTheme[] = [
  { theme: "building", base: REVISED_DIRT, cover: REVISED_GRASS, path: { terrain: REVISED_COBBLES, erase: false }, water: REVISED_POND },
  { theme: "nature", base: REVISED_DIRT, cover: REVISED_GRASS, path: { terrain: REVISED_GRASS, erase: true }, water: REVISED_POND },
  { theme: "dungeon", base: ATLAS_CAVE_STONE, path: { terrain: ATLAS_DIRT, erase: false }, water: ATLAS_CHASM },
  { theme: "desert", base: REVISED_SAND, path: { terrain: ATLAS_RED_DIRT, erase: false }, water: REVISED_SAND_WATER },
  { theme: "winter", base: REVISED_DIRT, cover: REVISED_SNOW, path: { terrain: REVISED_SNOW, erase: true }, water: REVISED_POND, season: "winter" },
  { theme: "japanese", base: REVISED_DIRT, cover: REVISED_GRASS, path: { terrain: REVISED_GRASS, erase: true }, water: REVISED_POND, season: "spring" },
  { theme: "scifi", base: ATLAS_CAVE_STONE, path: { terrain: ATLAS_DIRT, erase: false } },
  { theme: "graveyard", base: REVISED_DIRT, cover: REVISED_GRASS, path: { terrain: REVISED_GRASS, erase: true }, season: "autumn" },
  { theme: "street", base: REVISED_DIRT, cover: REVISED_GRASS, path: { terrain: REVISED_COBBLES, erase: false } },
];
