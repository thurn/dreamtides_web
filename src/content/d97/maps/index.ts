// The D97 dream map catalog: every committed map module (decision P11), and
// the stamps and terrains their recipes place. Workspace preparation compiles
// each map into the gitignored `public/d97/maps/<map-id>.json`
// (`scripts/d97/compile-maps.ts`). Stamps come from the stamp catalog
// (`src/content/d97/stamps/`).

import type { DreamStamp, DreamTerrain } from "../../../d97/map/assets";
import type { DreamMapDefinition } from "../../../d97/map/definition";
import type { D97StampId, D97TerrainId } from "../../../types/identifiers";
import { D97_STAMPS } from "../stamps";

export const D97_DREAM_MAPS: readonly DreamMapDefinition[] = [];

export const D97_MAP_STAMPS: ReadonlyMap<D97StampId, DreamStamp> = new Map(
  D97_STAMPS.map((stamp) => [stamp.id, stamp]),
);

export const D97_MAP_TERRAINS: ReadonlyMap<D97TerrainId, DreamTerrain> = new Map();
