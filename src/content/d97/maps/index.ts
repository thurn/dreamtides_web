// The D97 dream map catalog: every committed map module (decision P11), and
// the stamps, terrains and seasonal sheet families their recipes place.
// Workspace preparation compiles each dream map into the gitignored
// `public/d97/maps/<map-id>.json` (`scripts/d97/compile-maps.ts`). Stamps
// come from the stamp catalog (`src/content/d97/stamps/`), terrains and
// seasons from the terrain catalog (`src/content/d97/terrains/`).
//
// Example maps are authoring references the map tools load, validate and
// preview (`validate --all` includes them); no dream plays them, so they are
// not compiled into `public/`.

import type { D97SeasonFamily, DreamStamp, DreamTerrain } from "../../../d97/map/assets";
import type { DreamMapDefinition } from "../../../d97/map/definition";
import type { D97StampId, D97TerrainId } from "../../../types/identifiers";
import { D97_STAMPS } from "../stamps";
import { D97_TERRAINS } from "../terrains";
import { D97_SEASON_FAMILIES } from "../terrains/seasons";
import map3229d6c7 from "./3229d6c7-0700-4f37-9b07-921e3dccb8b6";
import example9ad96a1d from "./9ad96a1d-4542-4228-a20f-1e4f6e274058";

export const D97_DREAM_MAPS: readonly DreamMapDefinition[] = [map3229d6c7];

export const D97_EXAMPLE_MAPS: readonly DreamMapDefinition[] = [example9ad96a1d];

export const D97_MAP_STAMPS: ReadonlyMap<D97StampId, DreamStamp> = new Map(
  D97_STAMPS.map((stamp) => [stamp.id, stamp]),
);

export const D97_MAP_TERRAINS: ReadonlyMap<D97TerrainId, DreamTerrain> = new Map(
  D97_TERRAINS.map((terrain) => [terrain.id, terrain]),
);

export const D97_MAP_SEASONS: readonly D97SeasonFamily[] = D97_SEASON_FAMILIES;
