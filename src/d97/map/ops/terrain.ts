// `paintTerrain` and `brush`: auto-tiled terrain. A terrain is drawn on one
// tile layer by corners: each cell's tile is chosen by which of its four
// corners lie inside the terrain (the terrain's corner table), so painting or
// erasing a shape re-tiles the edges and inner corners around it against the
// terrain already on that layer.
//
// Corners are rebuilt from the layer's existing tiles of the same terrain,
// the shape's cells set (paint) or clear (erase) all four of their corners,
// and every cell within one tile of the shape is re-tiled. A cell whose
// corner mask has no piece in the table (two diagonal corners) takes the
// full piece. An edgeless terrain draws only fully covered cells.

import type { DreamTerrain } from "../assets";
import { TERRAIN_FULL } from "../assets";
import type { TerrainShape } from "../definition";
import { gidWithoutFlags } from "../tiled";
import type { RecipeAssets, RecipeOpHandler, WorkingMap } from "./working-map";
import { layerOrCreate, mergeTileset, RecipeError, shapeCells } from "./working-map";

/** A deterministic variant choice for a cell. */
function variantIndex(x: number, y: number, count: number): number {
  return (((x * 73856093) ^ (y * 19349663)) >>> 0) % count;
}

function terrainFor(assets: RecipeAssets, id: DreamTerrain["id"]): DreamTerrain {
  const terrain = assets.terrains.get(id);
  if (terrain === undefined) throw new RecipeError(`unknown terrain ${id}`);
  return terrain;
}

/** Paint (or erase) `terrain` over `shape` on the tile layer `layerName`. */
export function applyTerrain(
  map: WorkingMap,
  terrain: DreamTerrain,
  layerName: string,
  shape: TerrainShape,
  erase: boolean,
): void {
  const cells = shapeCells(map, shape);
  const full = terrain.corners[TERRAIN_FULL];
  if (full === undefined || full.length === 0) {
    throw new RecipeError(`terrain ${terrain.id} has no full piece`);
  }
  const firstGid = mergeTileset(map, terrain.tileset);
  const maskOfLocal = new Map<number, number>();
  for (const [mask, ids] of Object.entries(terrain.corners)) {
    for (const id of ids ?? []) if (!maskOfLocal.has(id)) maskOfLocal.set(id, Number(mask));
  }
  const layer = layerOrCreate(map, layerName);
  const vertexWidth = map.width + 1;
  const vertices = new Uint8Array(vertexWidth * (map.height + 1));
  const mark = (x: number, y: number, mask: number, value: 0 | 1) => {
    if (mask & 1) vertices[y * vertexWidth + x] = value;
    if (mask & 2) vertices[y * vertexWidth + x + 1] = value;
    if (mask & 4) vertices[(y + 1) * vertexWidth + x] = value;
    if (mask & 8) vertices[(y + 1) * vertexWidth + x + 1] = value;
  };
  const localOf = (gid: number): number | null => {
    const id = gidWithoutFlags(gid);
    const local = id - firstGid;
    return id !== 0 && local >= 0 && maskOfLocal.has(local) ? local : null;
  };
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const local = localOf(layer.gids[y * map.width + x]);
      if (local !== null) mark(x, y, maskOfLocal.get(local)!, 1);
    }
  }
  if (cells.length === 0) return;
  let x0 = map.width;
  let y0 = map.height;
  let x1 = -1;
  let y1 = -1;
  for (const [x, y] of cells) {
    mark(x, y, TERRAIN_FULL, erase ? 0 : 1);
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  for (let y = Math.max(0, y0 - 1); y <= Math.min(map.height - 1, y1 + 1); y += 1) {
    for (let x = Math.max(0, x0 - 1); x <= Math.min(map.width - 1, x1 + 1); x += 1) {
      const mask =
        vertices[y * vertexWidth + x] |
        (vertices[y * vertexWidth + x + 1] << 1) |
        (vertices[(y + 1) * vertexWidth + x] << 2) |
        (vertices[(y + 1) * vertexWidth + x + 1] << 3);
      const cell = y * map.width + x;
      if (mask === 0) {
        if (localOf(layer.gids[cell]) !== null) layer.gids[cell] = 0;
        continue;
      }
      if (terrain.edgeless === true && mask !== TERRAIN_FULL) {
        if (localOf(layer.gids[cell]) !== null) layer.gids[cell] = 0;
        continue;
      }
      const choices = terrain.corners[mask] ?? full;
      const pick = choices.length === 0 ? full : choices;
      layer.gids[cell] = firstGid + pick[variantIndex(x, y, pick.length)];
    }
  }
  if (terrain.blocksMovement) {
    for (const local of full) map.blockingGids.add(firstGid + local);
  }
}

export const paintTerrainOp: RecipeOpHandler<"paintTerrain"> = (map, op, assets) => {
  applyTerrain(map, terrainFor(assets, op.terrain), op.layer, op.shape, false);
};

export const brushOp: RecipeOpHandler<"brush"> = (map, op, assets) => {
  const terrain = terrainFor(assets, op.terrain);
  applyTerrain(map, terrain, op.layer ?? terrain.layer, op.shape, op.erase === true);
};
