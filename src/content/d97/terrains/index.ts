// The D97 terrain catalog (decision P12): every auto-tiled terrain a map
// recipe's `brush` (or `paintTerrain`) operation paints, by source sheet.
// `npm run d97:map -- terrains` lists them with their families and layers.

import type { D97CatalogTerrain } from "../../../d97/map/terrain-catalog";
import { LPC_REVISED_TERRAINS } from "./lpc-revised";
import { LPC_TILE_ATLAS_TERRAINS } from "./lpc-tile-atlas";

export const D97_TERRAINS: readonly D97CatalogTerrain[] = [...LPC_REVISED_TERRAINS, ...LPC_TILE_ATLAS_TERRAINS];
