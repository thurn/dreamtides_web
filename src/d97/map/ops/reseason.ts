// `reseason`: redraw LPC Revised tiles in another season. Every tile (and
// tile object) in the area whose tileset image belongs to a seasonal sheet
// family (`RecipeAssets.seasons`) moves to the same tile of that family's
// sheet for the target season, whose tileset is merged into the map. Tiles
// of other sheets stay. A blocking terrain's tiles keep blocking.

import { gidWithoutFlags, TILED_FLIP_BITS, tilesetForGid, type TiledTileset } from "../tiled";
import type { RecipeOpHandler } from "./working-map";
import { areaCells, mergeTileset, objectCell, RecipeError } from "./working-map";

function fileStem(path: string): string {
  const slash = path.lastIndexOf("/");
  return path.slice(slash + 1).replace(/\.[^.]+$/u, "");
}

export const reseasonOp: RecipeOpHandler<"reseason"> = (map, op, assets) => {
  const families = assets.seasons ?? [];
  if (families.length === 0) throw new RecipeError("no seasonal sheet families are catalogued");
  const { x0, y0, x1, y1 } = areaCells(map, op);
  const targetOf = new Map<string, string>();
  for (const family of families) {
    for (const image of Object.values(family.images)) targetOf.set(image, family.images[op.season]);
  }
  const firstGids = new Map<TiledTileset, number | null>();
  const target = (tileset: TiledTileset): number | null => {
    if (firstGids.has(tileset)) return firstGids.get(tileset) ?? null;
    const path = tileset.image?.path;
    const image = path === undefined ? undefined : targetOf.get(path);
    let first: number | null = null;
    if (image !== undefined && path !== undefined && image !== path && tileset.image !== null) {
      const name = fileStem(image);
      first = mergeTileset(map, { ...tileset, name, image: { ...tileset.image, path: image }, externalPath: null });
    }
    firstGids.set(tileset, first);
    return first;
  };
  const remap = (gid: number): number => {
    const id = gidWithoutFlags(gid);
    if (id === 0) return gid;
    const owner = tilesetForGid(map.tilesets, id);
    if (owner === null) return gid;
    const first = target(owner);
    if (first === null) return gid;
    const moved = id - owner.firstGid + first;
    if (map.blockingGids.has(id)) map.blockingGids.add(moved);
    return ((gid & TILED_FLIP_BITS) | moved) >>> 0;
  };
  for (const layer of map.layers) {
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const cell = y * map.width + x;
        layer.gids[cell] = remap(layer.gids[cell]);
      }
    }
  }
  for (const object of map.objects) {
    const [x, y] = objectCell(map, object);
    if (x >= x0 && x <= x1 && y >= y0 && y <= y1) object.gid = remap(object.gid);
  }
};
