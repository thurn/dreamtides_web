// Which dream the overworld plays, and loading its compiled map. A started
// run plays the first catalog dream; a development QA scene, or an empty
// catalog, plays the development dream. A catalog dream's map is the
// workspace-compiled `public/d97/maps/<map-id>.json`, fetched once per map
// and checked for its shape; when it cannot be loaded the run plays the
// development dream instead, whose map compiles in code.

import { DEVELOPMENT_DREAM } from "../../content/d97/dreams/development";
import type { D97DreamDefinition } from "../../content/d97/dreams/schema";
import { assetUrl } from "../../runtime/asset-url";
import type { DreamMapId } from "../../types/identifiers";
import { COMPILED_DREAM_MAP_FORMAT, type CompiledDreamMap } from "../map/compiled";

export interface D97DreamSelection {
  readonly dream: D97DreamDefinition;
  /** Where the dream came from: the catalog, or the development dream. */
  readonly source: "catalog" | "development";
}

/** The dream a run plays: the catalog's first, unless `development` asks otherwise. */
export function selectRunDream(
  catalog: readonly D97DreamDefinition[],
  { development }: { readonly development: boolean },
): D97DreamSelection {
  const first = catalog[0];
  return development || first === undefined
    ? { dream: DEVELOPMENT_DREAM, source: "development" }
    : { dream: first, source: "catalog" };
}

export type D97DreamMapFailure = "unavailable" | "malformed" | "mismatched";

export type D97DreamMapLoad =
  | { readonly ok: true; readonly map: CompiledDreamMap }
  | { readonly ok: false; readonly reason: D97DreamMapFailure };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const isCount = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value > 0;

/**
 * Check `json` is a compiled map of the current format for `mapId`: its id,
 * positive dimensions, grids of the right length and the lists the renderer
 * reads. The compiler wrote it, so the check is minimal.
 */
export function parseCompiledDreamMap(json: unknown, mapId: DreamMapId): D97DreamMapLoad {
  if (!isRecord(json) || json.format !== COMPILED_DREAM_MAP_FORMAT) return { ok: false, reason: "malformed" };
  const { width, height, tileWidth, tileHeight, walkable, abovePlayer } = json;
  if (!isCount(width) || !isCount(height) || !isCount(tileWidth) || !isCount(tileHeight)) return { ok: false, reason: "malformed" };
  const cells = width * height;
  if (typeof walkable !== "string" || walkable.length !== cells || typeof abovePlayer !== "string" || abovePlayer.length !== cells) {
    return { ok: false, reason: "malformed" };
  }
  const lists = [json.tilesets, json.layers, json.objects, json.regions, json.landmarks, json.anchors];
  if (!lists.every(Array.isArray)) return { ok: false, reason: "malformed" };
  if (json.id !== mapId) return { ok: false, reason: "mismatched" };
  return { ok: true, map: json as unknown as CompiledDreamMap };
}

const loads = new Map<DreamMapId, Promise<D97DreamMapLoad>>();

/** Fetch and check `mapId`'s compiled map, once per map. */
export function loadCompiledDreamMap(mapId: DreamMapId): Promise<D97DreamMapLoad> {
  let load = loads.get(mapId);
  if (load === undefined) {
    load = fetch(assetUrl(`/d97/maps/${mapId}.json`))
      .then(async (response): Promise<D97DreamMapLoad> =>
        response.ok ? parseCompiledDreamMap(await response.json(), mapId) : { ok: false, reason: "unavailable" },
      )
      .catch((): D97DreamMapLoad => ({ ok: false, reason: "unavailable" }));
    loads.set(mapId, load);
  }
  return load;
}
