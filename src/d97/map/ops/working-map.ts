// The mutable map the recipe compiler edits, and the helpers recipe
// operations share: rectangles and bounds, layers by name, tileset merging
// and gid remapping, and terrain shapes. Each operation module under this
// directory edits a WorkingMap in place and throws RecipeError on a bad
// operation; `../compile.ts` reports it by recipe index.

import type { D97StampId, D97TerrainId } from "../../../types/identifiers";
import type { D97SeasonFamily, DreamStamp, DreamTerrain } from "../assets";
import type { DreamMapRecipeOp, TerrainShape, TilePoint, TileRect } from "../definition";
import { gidWithoutFlags, TILED_FLIP_BITS, tilesetForGid, type TiledTileset } from "../tiled";

/** The catalogs recipe operations place from. */
export interface RecipeAssets {
  readonly stamps: ReadonlyMap<D97StampId, DreamStamp>;
  readonly terrains: ReadonlyMap<D97TerrainId, DreamTerrain>;
  /** The seasonal sheet families `reseason` maps between; none by default. */
  readonly seasons?: readonly D97SeasonFamily[];
}

export interface WorkingLayer {
  readonly name: string;
  gids: number[];
  readonly visible: boolean;
  readonly opacity: number;
  readonly offset: { readonly x: number; readonly y: number };
  /** Per cell: 1 when that cell is lifted above the player. */
  lifted: Uint8Array;
  aboveAll: boolean;
}

export interface WorkingObject {
  gid: number;
  x: number;
  y: number;
  readonly width: number;
  readonly height: number;
  readonly layer: string;
  above: boolean;
}

export interface WorkingMap {
  width: number;
  height: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly tilesets: TiledTileset[];
  layers: WorkingLayer[];
  objects: WorkingObject[];
  readonly objectLayers: Set<string>;
  /** Object layers hidden in the source. */
  readonly invisibleObjectLayers: Set<string>;
  /** Per object layer, cells its shapes (non-tile objects) cover. */
  readonly objectShapes: Map<string, Uint8Array>;
  readonly hidden: Set<string>;
  /** Per cell: -1 derived, 0 forced open, 1 forced blocked. */
  override: Int8Array;
  /** Gids (without flags) that block because a blocking terrain placed them. */
  readonly blockingGids: Set<number>;
}

/** A recipe operation handler: edits the map in place, throws RecipeError when the operation is bad. */
export type RecipeOpHandler<K extends DreamMapRecipeOp["op"]> = (
  map: WorkingMap,
  op: Extract<DreamMapRecipeOp, { op: K }>,
  assets: RecipeAssets,
) => void;

export class RecipeError extends Error {}

export interface CellRect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export function rectCells({ from, to }: TileRect): CellRect {
  return {
    x0: Math.min(from[0], to[0]),
    y0: Math.min(from[1], to[1]),
    x1: Math.max(from[0], to[0]),
    y1: Math.max(from[1], to[1]),
  };
}

export function inBounds(map: MapBounds, [x, y]: TilePoint): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < map.width && y < map.height;
}

/** A map's size, for bounds checks. */
export interface MapBounds {
  readonly width: number;
  readonly height: number;
}

export function requireRect(map: MapBounds, rect: TileRect): CellRect {
  if (!inBounds(map, rect.from) || !inBounds(map, rect.to)) {
    throw new RecipeError(
      `rectangle ${JSON.stringify(rect.from)}–${JSON.stringify(rect.to)} leaves the ${String(map.width)}×${String(map.height)} map`,
    );
  }
  return rectCells(rect);
}

/** The topmost tile layer named `name`. */
export function findLayer(map: WorkingMap, name: string): WorkingLayer | undefined {
  for (let index = map.layers.length - 1; index >= 0; index -= 1) {
    if (map.layers[index].name === name) return map.layers[index];
  }
  return undefined;
}

/** Whether the map has a tile or object layer named `name`. */
export function hasLayer(map: WorkingMap, name: string): boolean {
  return findLayer(map, name) !== undefined || map.objectLayers.has(name);
}

export function requireLayer(map: WorkingMap, name: string): void {
  if (!hasLayer(map, name)) throw new RecipeError(`unknown layer ${name}`);
}

export function layerOrCreate(map: WorkingMap, name: string): WorkingLayer {
  const existing = findLayer(map, name);
  if (existing !== undefined) return existing;
  const created: WorkingLayer = {
    name,
    gids: new Array<number>(map.width * map.height).fill(0),
    visible: true,
    opacity: 1,
    offset: { x: 0, y: 0 },
    lifted: new Uint8Array(map.width * map.height),
    aboveAll: false,
  };
  map.layers.push(created);
  return created;
}

/** Tiles of a sheet along one image side, as Tiled lays them out. */
function tilesAlong(size: number, tile: number, tileset: TiledTileset): number {
  return Math.max(0, Math.floor((size - 2 * tileset.margin + tileset.spacing) / (tile + tileset.spacing)));
}

/**
 * The gids `tileset` occupies. Older Tiled tilesets leave out `tilecount`
 * (Big Island's and Neverwell Moor's all do), so a sheet's span also counts
 * the tiles its image holds; otherwise a tileset merged after it would take
 * gids its tiles use.
 */
export function tilesetSpan(tileset: TiledTileset): number {
  const highestTile = tileset.tiles.reduce((max, tile) => Math.max(max, tile.id + 1), 0);
  const sheetTiles =
    tileset.image === null
      ? 0
      : tilesAlong(tileset.image.width, tileset.tileWidth, tileset) *
        tilesAlong(tileset.image.height, tileset.tileHeight, tileset);
  return Math.max(tileset.tileCount, sheetTiles, highestTile, 1);
}

function sameTileset(a: TiledTileset, b: TiledTileset): boolean {
  if (a.image === null || b.image === null) return a.name === b.name && a.image === b.image;
  return a.image.path === b.image.path && a.tileWidth === b.tileWidth && a.tileHeight === b.tileHeight;
}

/** Add `tileset` to the map unless an identical one is there; returns its first gid. */
export function mergeTileset(map: WorkingMap, tileset: TiledTileset): number {
  const existing = map.tilesets.find((candidate) => sameTileset(candidate, tileset));
  if (existing !== undefined) return existing.firstGid;
  const firstGid = map.tilesets.reduce(
    (next, candidate) => Math.max(next, candidate.firstGid + tilesetSpan(candidate)),
    1,
  );
  map.tilesets.push({ ...tileset, firstGid });
  return firstGid;
}

/** Map a gid from an asset's own tileset numbering into the map's. */
export function remapper(map: WorkingMap, tilesets: readonly TiledTileset[]): (gid: number) => number {
  const bases = tilesets.map((tileset) => ({ tileset, mapFirstGid: mergeTileset(map, tileset) }));
  return (gid) => {
    const id = gidWithoutFlags(gid);
    if (id === 0) return 0;
    const owner = tilesetForGid(tilesets, id);
    const base = bases.find((entry) => entry.tileset === owner);
    if (owner === null || base === undefined) {
      throw new RecipeError(`gid ${String(id)} has no tileset`);
    }
    return ((gid & TILED_FLIP_BITS) | (id - owner.firstGid + base.mapFirstGid)) >>> 0;
  };
}

/** The base cell of a tile object: the cell holding its bottom-left tile. */
export function objectCell(map: Pick<WorkingMap, "tileWidth" | "tileHeight">, object: WorkingObject): TilePoint {
  return [Math.floor(object.x / map.tileWidth), Math.floor((object.y - 1) / map.tileHeight)];
}

/** The cells a terrain shape covers, in the map. */
export function shapeCells(map: MapBounds, shape: TerrainShape): TilePoint[] {
  const cells: TilePoint[] = [];
  if (shape.kind === "rect" || shape.kind === "ellipse") {
    const { x0, y0, x1, y1 } = requireRect(map, shape);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const rx = (x1 - x0 + 1) / 2;
    const ry = (y1 - y0 + 1) / 2;
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        if (shape.kind === "ellipse" && ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 > 1) continue;
        cells.push([x, y]);
      }
    }
    return cells;
  }
  if (shape.kind === "cells") {
    for (const cell of shape.cells) {
      if (!inBounds(map, cell)) throw new RecipeError(`cell ${JSON.stringify(cell)} leaves the map`);
      cells.push(cell);
    }
    return cells;
  }
  const width = shape.width ?? 1;
  if (!Number.isInteger(width) || width < 1) throw new RecipeError("path width must be a positive integer");
  if (shape.points.length === 0) throw new RecipeError("path has no points");
  const low = -Math.floor((width - 1) / 2);
  const high = low + width - 1;
  const segments =
    shape.points.length === 1
      ? [[shape.points[0], shape.points[0]]]
      : shape.points.slice(1).map((point, index) => [shape.points[index], point]);
  for (const [from, to] of segments) {
    if (from[0] !== to[0] && from[1] !== to[1]) {
      throw new RecipeError(`path segment ${JSON.stringify(from)}–${JSON.stringify(to)} is not straight`);
    }
    const { x0, y0, x1, y1 } = rectCells({ from, to });
    for (let y = y0 + low; y <= y1 + high; y += 1) {
      for (let x = x0 + low; x <= x1 + high; x += 1) {
        if (!inBounds(map, [x, y])) throw new RecipeError(`path cell ${JSON.stringify([x, y])} leaves the map`);
        cells.push([x, y]);
      }
    }
  }
  return cells;
}

/** Every cell of `area` (the whole map when absent), validated against the map. */
export function areaCells(map: WorkingMap, area: Partial<TileRect>): CellRect {
  if (area.from === undefined && area.to === undefined) {
    return { x0: 0, y0: 0, x1: map.width - 1, y1: map.height - 1 };
  }
  if (area.from === undefined || area.to === undefined) throw new RecipeError("needs both corners or neither");
  return requireRect(map, { from: area.from, to: area.to });
}
