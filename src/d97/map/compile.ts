// The D97 recipe compiler: reads a map's source (a Tiled map from the LPC
// library, or a blank canvas), checks its pinned content hash, applies the
// recipe in order, derives the walkability grid, and resolves regions,
// landmarks and anchors into a CompiledDreamMap. Pure: file access and
// decompression arrive with the input, and the same input always compiles
// to the same output.
//
// Layers are addressed by name. Tiled maps may repeat a name: hiding,
// lifting and erasing act on every layer of that name, while stamps and
// terrain paint the topmost one.
//
// Walkability: a cell blocks when a blocking (collision) tile layer has a
// tile there, a blocking object layer's shape covers it, or a drawn tile or
// tile object there blocks by its tile properties, collision shapes or
// blocking terrain. Recipe `block`/`open` operations and
// stamp walkability masks then override cells in recipe order; an `erase`
// clears earlier overrides in its rectangle.

import { sha256 } from "js-sha256";
import {
  parseDreamMapSourceHash,
  type D97StampId,
  type D97TerrainId,
  type DreamAnchorId,
  type DreamMapSourceHash,
} from "../../types/identifiers";
import type { DreamStamp, DreamTerrain } from "./assets";
import { TERRAIN_FULL } from "./assets";
import {
  COMPILED_DREAM_MAP_FORMAT,
  type CompiledAnchor,
  type CompiledDreamMap,
  type CompiledTileLayer,
  type CompiledTileObject,
  type CompiledTileset,
} from "./compiled";
import type {
  DreamAnchorDefinition,
  DreamAnchorPlacement,
  DreamMapDefinition,
  DreamMapRecipeOp,
  TerrainShape,
  TilePoint,
  TileRect,
} from "./definition";
import {
  gidWithoutFlags,
  readTiledMap,
  TILED_FLIP_BITS,
  tilesetForGid,
  type TiledCompression,
  type TiledObject,
  type TiledTileset,
} from "./tiled";

export type DreamMapCompileError =
  | { readonly kind: "source"; readonly message: string }
  | {
      readonly kind: "source-hash-mismatch";
      readonly expected: DreamMapSourceHash;
      readonly actual: DreamMapSourceHash;
    }
  | { readonly kind: "recipe"; readonly index: number; readonly message: string }
  | { readonly kind: "authoring"; readonly message: string }
  | {
      readonly kind: "anchor";
      readonly anchorId: DreamAnchorId;
      readonly message: string;
    };

export interface DreamMapSourceInput {
  /** The source map file's text. */
  readonly text: string;
  /** Reads a file the map references (an external tileset) as text. */
  readonly loadText: (path: string) => string;
  readonly decompress?: (bytes: Uint8Array, compression: TiledCompression) => Uint8Array;
}

export interface DreamMapCompileInput {
  /** The Tiled source; null for a blank-canvas map. */
  readonly source: DreamMapSourceInput | null;
  readonly stamps: ReadonlyMap<D97StampId, DreamStamp>;
  readonly terrains: ReadonlyMap<D97TerrainId, DreamTerrain>;
}

export type DreamMapCompileResult =
  | { readonly ok: true; readonly map: CompiledDreamMap }
  | { readonly ok: false; readonly errors: readonly DreamMapCompileError[] };

/** SHA-256 of a source file's text, as map modules pin it. */
export function dreamMapSourceHash(text: string): DreamMapSourceHash {
  return parseDreamMapSourceHash(sha256(text));
}

const DEFAULT_BLOCKING_PROPERTIES = ["collides", "collision", "blocked"];

interface WorkingLayer {
  readonly name: string;
  gids: number[];
  readonly visible: boolean;
  readonly opacity: number;
  readonly offset: { readonly x: number; readonly y: number };
  /** Per cell: 1 when that cell is lifted above the player. */
  lifted: Uint8Array;
  aboveAll: boolean;
}

interface WorkingObject {
  readonly gid: number;
  x: number;
  y: number;
  readonly width: number;
  readonly height: number;
  readonly layer: string;
  above: boolean;
}

interface WorkingMap {
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

class RecipeError extends Error {}

function rectCells({ from, to }: TileRect): { x0: number; y0: number; x1: number; y1: number } {
  return {
    x0: Math.min(from[0], to[0]),
    y0: Math.min(from[1], to[1]),
    x1: Math.max(from[0], to[0]),
    y1: Math.max(from[1], to[1]),
  };
}

function inBounds(map: { width: number; height: number }, [x, y]: TilePoint): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < map.width && y < map.height;
}

function requireRect(map: WorkingMap, rect: TileRect) {
  if (!inBounds(map, rect.from) || !inBounds(map, rect.to)) {
    throw new RecipeError(
      `rectangle ${JSON.stringify(rect.from)}–${JSON.stringify(rect.to)} leaves the ${String(map.width)}×${String(map.height)} map`,
    );
  }
  return rectCells(rect);
}

/** The topmost tile layer named `name`. */
function findLayer(map: WorkingMap, name: string): WorkingLayer | undefined {
  for (let index = map.layers.length - 1; index >= 0; index -= 1) {
    if (map.layers[index].name === name) return map.layers[index];
  }
  return undefined;
}

/** Whether the map has a tile or object layer named `name`. */
function hasLayer(map: WorkingMap, name: string): boolean {
  return findLayer(map, name) !== undefined || map.objectLayers.has(name);
}

function layerOrCreate(map: WorkingMap, name: string): WorkingLayer {
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

function tilesetSpan(tileset: TiledTileset): number {
  const highestTile = tileset.tiles.reduce((max, tile) => Math.max(max, tile.id + 1), 0);
  return Math.max(tileset.tileCount, highestTile, 1);
}

function sameTileset(a: TiledTileset, b: TiledTileset): boolean {
  if (a.image === null || b.image === null) return a.name === b.name && a.image === b.image;
  return a.image.path === b.image.path && a.tileWidth === b.tileWidth && a.tileHeight === b.tileHeight;
}

/** Add `tileset` to the map unless an identical one is there; returns its first gid. */
function mergeTileset(map: WorkingMap, tileset: TiledTileset): number {
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
function remapper(map: WorkingMap, tilesets: readonly TiledTileset[]): (gid: number) => number {
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

function cropOp(map: WorkingMap, rect: TileRect): void {
  const { x0, y0, x1, y1 } = requireRect(map, rect);
  const width = x1 - x0 + 1;
  const height = y1 - y0 + 1;
  const crop = <T extends number[] | Uint8Array | Int8Array>(cells: T, make: (n: number) => T): T => {
    const out = make(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        out[y * width + x] = cells[(y + y0) * map.width + x + x0];
      }
    }
    return out;
  };
  for (const layer of map.layers) {
    layer.gids = crop(layer.gids, (n) => new Array<number>(n).fill(0));
    layer.lifted = crop(layer.lifted, (n) => new Uint8Array(n));
  }
  map.override = crop(map.override, (n) => new Int8Array(n).fill(-1));
  for (const [name, cells] of map.objectShapes) {
    map.objectShapes.set(name, crop(cells, (n) => new Uint8Array(n)));
  }
  map.objects = map.objects
    .map((object) => ({ ...object, x: object.x - x0 * map.tileWidth, y: object.y - y0 * map.tileHeight }))
    .filter(
      (object) =>
        object.x >= 0 &&
        object.y > 0 &&
        object.x < width * map.tileWidth &&
        object.y <= height * map.tileHeight,
    );
  map.width = width;
  map.height = height;
}

/** The base cell of a tile object: the cell holding its bottom-left tile. */
function objectCell(map: WorkingMap, object: WorkingObject): TilePoint {
  return [Math.floor(object.x / map.tileWidth), Math.floor((object.y - 1) / map.tileHeight)];
}

function eraseOp(map: WorkingMap, op: Extract<DreamMapRecipeOp, { op: "erase" }>): void {
  const { x0, y0, x1, y1 } = requireRect(map, op);
  const names = op.layers ?? [...map.layers.map((layer) => layer.name), ...map.objectLayers];
  for (const name of names) {
    if (!hasLayer(map, name)) throw new RecipeError(`unknown layer ${name}`);
  }
  for (const layer of map.layers) {
    if (!names.includes(layer.name)) continue;
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        layer.gids[y * map.width + x] = 0;
        layer.lifted[y * map.width + x] = 0;
      }
    }
  }
  for (const [name, shapes] of map.objectShapes) {
    if (!names.includes(name)) continue;
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) shapes[y * map.width + x] = 0;
    }
  }
  map.objects = map.objects.filter((object) => {
    if (!names.includes(object.layer)) return true;
    const [x, y] = objectCell(map, object);
    return x < x0 || x > x1 || y < y0 || y > y1;
  });
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) map.override[y * map.width + x] = -1;
  }
}

function stampOp(map: WorkingMap, stamp: DreamStamp, at: TilePoint): void {
  const corner: TilePoint = [at[0] + stamp.width - 1, at[1] + stamp.height - 1];
  if (!inBounds(map, at) || !inBounds(map, corner)) {
    throw new RecipeError(`stamp ${stamp.id} at ${JSON.stringify(at)} leaves the map`);
  }
  const remap = remapper(map, stamp.tilesets);
  for (const stampLayer of stamp.layers) {
    if (stampLayer.gids.length !== stamp.width * stamp.height) {
      throw new RecipeError(`stamp ${stamp.id} layer ${stampLayer.layer} has the wrong cell count`);
    }
    const layer = layerOrCreate(map, stampLayer.layer);
    for (let y = 0; y < stamp.height; y += 1) {
      for (let x = 0; x < stamp.width; x += 1) {
        const gid = stampLayer.gids[y * stamp.width + x];
        if (gidWithoutFlags(gid) === 0) continue;
        const cell = (at[1] + y) * map.width + at[0] + x;
        layer.gids[cell] = remap(gid);
        if (stampLayer.above === true) layer.lifted[cell] = 1;
      }
    }
  }
  const mask = stamp.walkability;
  if (mask === undefined) return;
  if (mask.length !== stamp.width * stamp.height) {
    throw new RecipeError(`stamp ${stamp.id} walkability mask has the wrong cell count`);
  }
  for (let y = 0; y < stamp.height; y += 1) {
    for (let x = 0; x < stamp.width; x += 1) {
      const flag = mask[y * stamp.width + x];
      if (flag !== "0" && flag !== "1") continue;
      map.override[(at[1] + y) * map.width + at[0] + x] = flag === "1" ? 1 : 0;
    }
  }
}

function shapeCells(map: WorkingMap, shape: TerrainShape): TilePoint[] {
  const cells: TilePoint[] = [];
  if (shape.kind === "rect") {
    const { x0, y0, x1, y1 } = requireRect(map, shape);
    for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) cells.push([x, y]);
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
  const segments = shape.points.length === 1 ? [[shape.points[0], shape.points[0]]] : shape.points.slice(1).map((point, index) => [shape.points[index], point]);
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

/** A deterministic variant choice for a cell. */
function variantIndex(x: number, y: number, count: number): number {
  return (((x * 73856093) ^ (y * 19349663)) >>> 0) % count;
}

function paintTerrainOp(
  map: WorkingMap,
  terrain: DreamTerrain,
  layerName: string,
  shape: TerrainShape,
): void {
  const cells = shapeCells(map, shape);
  const firstGid = mergeTileset(map, terrain.tileset);
  const full = terrain.corners[TERRAIN_FULL];
  if (full === undefined || full.length === 0) {
    throw new RecipeError(`terrain ${terrain.id} has no full piece`);
  }
  const maskOfLocal = new Map<number, number>();
  for (const [mask, ids] of Object.entries(terrain.corners)) {
    for (const id of ids ?? []) if (!maskOfLocal.has(id)) maskOfLocal.set(id, Number(mask));
  }
  const layer = layerOrCreate(map, layerName);
  const vertexWidth = map.width + 1;
  const vertices = new Uint8Array(vertexWidth * (map.height + 1));
  const mark = (x: number, y: number, mask: number) => {
    if (mask & 1) vertices[y * vertexWidth + x] = 1;
    if (mask & 2) vertices[y * vertexWidth + x + 1] = 1;
    if (mask & 4) vertices[(y + 1) * vertexWidth + x] = 1;
    if (mask & 8) vertices[(y + 1) * vertexWidth + x + 1] = 1;
  };
  const localOf = (gid: number): number | null => {
    const id = gidWithoutFlags(gid);
    const local = id - firstGid;
    return id !== 0 && local >= 0 && maskOfLocal.has(local) ? local : null;
  };
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const local = localOf(layer.gids[y * map.width + x]);
      if (local !== null) mark(x, y, maskOfLocal.get(local)!);
    }
  }
  for (const [x, y] of cells) mark(x, y, TERRAIN_FULL);
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
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
      const choices = terrain.corners[mask] ?? full;
      const pick = choices.length === 0 ? full : choices;
      layer.gids[cell] = firstGid + pick[variantIndex(x, y, pick.length)];
    }
  }
  if (terrain.blocksMovement) {
    for (const local of full) map.blockingGids.add(firstGid + local);
  }
}

function applyOp(map: WorkingMap, op: DreamMapRecipeOp, input: DreamMapCompileInput): void {
  switch (op.op) {
    case "crop":
      cropOp(map, op);
      return;
    case "erase":
      eraseOp(map, op);
      return;
    case "stamp": {
      const stamp = input.stamps.get(op.stamp);
      if (stamp === undefined) throw new RecipeError(`unknown stamp ${op.stamp}`);
      stampOp(map, stamp, op.at);
      return;
    }
    case "paintTerrain": {
      const terrain = input.terrains.get(op.terrain);
      if (terrain === undefined) throw new RecipeError(`unknown terrain ${op.terrain}`);
      paintTerrainOp(map, terrain, op.layer, op.shape);
      return;
    }
    case "hideLayer":
      if (!hasLayer(map, op.layer)) throw new RecipeError(`unknown layer ${op.layer}`);
      map.hidden.add(op.layer);
      return;
    case "abovePlayer": {
      if (!hasLayer(map, op.layer)) throw new RecipeError(`unknown layer ${op.layer}`);
      const named = map.layers.filter((layer) => layer.name === op.layer);
      if (op.from === undefined || op.to === undefined) {
        if (op.from !== op.to) throw new RecipeError("abovePlayer needs both corners or neither");
        for (const layer of named) layer.aboveAll = true;
        for (const object of map.objects) if (object.layer === op.layer) object.above = true;
        return;
      }
      const { x0, y0, x1, y1 } = requireRect(map, { from: op.from, to: op.to });
      for (const layer of named) {
        for (let y = y0; y <= y1; y += 1) {
          for (let x = x0; x <= x1; x += 1) layer.lifted[y * map.width + x] = 1;
        }
      }
      for (const object of map.objects) {
        const [x, y] = objectCell(map, object);
        if (object.layer === op.layer && x >= x0 && x <= x1 && y >= y0 && y <= y1) object.above = true;
      }
      return;
    }
    case "block":
    case "open": {
      const { x0, y0, x1, y1 } = requireRect(map, op);
      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) map.override[y * map.width + x] = op.op === "block" ? 1 : 0;
      }
      return;
    }
  }
}

function loadWorkingMap(
  definition: DreamMapDefinition,
  input: DreamMapCompileInput,
): WorkingMap | DreamMapCompileError {
  const base = {
    objects: [] as WorkingObject[],
    objectLayers: new Set<string>(),
    invisibleObjectLayers: new Set<string>(),
    objectShapes: new Map<string, Uint8Array>(),
    hidden: new Set<string>(),
    blockingGids: new Set<number>(),
  };
  const source = definition.source;
  if (source.kind === "blank") {
    return {
      ...base,
      width: source.width,
      height: source.height,
      tileWidth: source.tileWidth,
      tileHeight: source.tileHeight,
      tilesets: [],
      layers: [],
      override: new Int8Array(source.width * source.height).fill(-1),
    };
  }
  if (input.source === null) {
    return { kind: "source", message: `no source text for ${source.path}` };
  }
  const actual = dreamMapSourceHash(input.source.text);
  if (actual !== source.sha256) {
    return { kind: "source-hash-mismatch", expected: source.sha256, actual };
  }
  let tiled;
  try {
    tiled = readTiledMap(input.source.text, {
      path: source.path,
      loadText: input.source.loadText,
      ...(input.source.decompress === undefined ? {} : { decompress: input.source.decompress }),
    });
  } catch (error) {
    return { kind: "source", message: error instanceof Error ? error.message : String(error) };
  }
  const cells = tiled.width * tiled.height;
  const map: WorkingMap = {
    ...base,
    width: tiled.width,
    height: tiled.height,
    tileWidth: tiled.tileWidth,
    tileHeight: tiled.tileHeight,
    tilesets: [...tiled.tilesets],
    layers: [],
    override: new Int8Array(cells).fill(-1),
  };
  for (const layer of tiled.layers) {
    if (layer.kind === "tile") {
      map.layers.push({
        name: layer.name,
        gids: [...layer.gids],
        visible: layer.visible,
        opacity: layer.opacity,
        offset: layer.offset,
        lifted: new Uint8Array(cells),
        aboveAll: false,
      });
      continue;
    }
    map.objectLayers.add(layer.name);
    if (!layer.visible) map.invisibleObjectLayers.add(layer.name);
    const shapes = map.objectShapes.get(layer.name) ?? new Uint8Array(cells);
    map.objectShapes.set(layer.name, shapes);
    for (const object of layer.objects) {
      if (object.gid === null) {
        markShape(shapes, tiled.width, tiled.height, tiled.tileWidth, tiled.tileHeight, object);
        continue;
      }
      map.objects.push({
        gid: object.gid,
        x: object.x,
        y: object.y,
        width: object.width,
        height: object.height,
        layer: layer.name,
        above: false,
      });
    }
  }
  return map;
}

/**
 * Mark the cells a shape object covers: a rectangle marks every cell its
 * interior overlaps; a polygon or polyline (closed) marks the cells whose
 * centers lie inside it.
 */
function markShape(
  cells: Uint8Array,
  width: number,
  height: number,
  tileWidth: number,
  tileHeight: number,
  object: TiledObject,
): void {
  if (object.point) return;
  const vertices = object.vertices;
  if (vertices !== null) {
    if (vertices.length < 3) return;
    const xs = vertices.map((vertex) => object.x + vertex.x);
    const ys = vertices.map((vertex) => object.y + vertex.y);
    const x0 = Math.max(0, Math.floor(Math.min(...xs) / tileWidth));
    const y0 = Math.max(0, Math.floor(Math.min(...ys) / tileHeight));
    const x1 = Math.min(width - 1, Math.floor(Math.max(...xs) / tileWidth));
    const y1 = Math.min(height - 1, Math.floor(Math.max(...ys) / tileHeight));
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const px = (x + 0.5) * tileWidth;
        const py = (y + 0.5) * tileHeight;
        let inside = false;
        for (let i = 0, j = xs.length - 1; i < xs.length; j = i, i += 1) {
          if (ys[i] > py !== ys[j] > py && px < ((xs[j] - xs[i]) * (py - ys[i])) / (ys[j] - ys[i]) + xs[i]) {
            inside = !inside;
          }
        }
        if (inside) cells[y * width + x] = 1;
      }
    }
    return;
  }
  if (object.width <= 0 || object.height <= 0) return;
  const x0 = Math.max(0, Math.floor(object.x / tileWidth));
  const y0 = Math.max(0, Math.floor(object.y / tileHeight));
  const x1 = Math.min(width - 1, Math.ceil((object.x + object.width) / tileWidth) - 1);
  const y1 = Math.min(height - 1, Math.ceil((object.y + object.height) / tileHeight) - 1);
  for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) cells[y * width + x] = 1;
}

function compiledTileset(tileset: TiledTileset): CompiledTileset {
  return {
    firstGid: tileset.firstGid,
    name: tileset.name,
    image: tileset.image?.path ?? null,
    imageWidth: tileset.image?.width ?? 0,
    imageHeight: tileset.image?.height ?? 0,
    tileWidth: tileset.tileWidth,
    tileHeight: tileset.tileHeight,
    columns: tileset.columns,
    tileCount: tileset.tileCount,
    spacing: tileset.spacing,
    margin: tileset.margin,
    tileOffset: tileset.tileOffset,
    tileImages: tileset.tiles.flatMap((tile) =>
      tile.image === null
        ? []
        : [{ id: tile.id, image: tile.image.path, width: tile.image.width, height: tile.image.height }],
    ),
  };
}

function resolvePlacement(
  placement: DreamAnchorPlacement,
  landmarks: ReadonlyMap<string, TilePoint>,
): TilePoint | string {
  if ("landmark" in placement) {
    return landmarks.get(placement.landmark) ?? `unknown landmark ${placement.landmark}`;
  }
  return placement;
}

function resolveAnchors(
  anchors: readonly DreamAnchorDefinition[],
  landmarks: ReadonlyMap<string, TilePoint>,
  size: { width: number; height: number },
  errors: DreamMapCompileError[],
): CompiledAnchor[] {
  const kinds = new Map<DreamAnchorId, DreamAnchorDefinition["kind"]>();
  for (const anchor of anchors) {
    if (kinds.has(anchor.id)) {
      errors.push({ kind: "anchor", anchorId: anchor.id, message: "duplicate anchor id" });
    }
    kinds.set(anchor.id, anchor.kind);
  }
  const out: CompiledAnchor[] = [];
  for (const anchor of anchors) {
    const fail = (message: string) => errors.push({ kind: "anchor", anchorId: anchor.id, message });
    const place = (placement: DreamAnchorPlacement, what: string): TilePoint | null => {
      const resolved = resolvePlacement(placement, landmarks);
      if (typeof resolved === "string") {
        fail(`${what}: ${resolved}`);
        return null;
      }
      if (!inBounds(size, resolved)) {
        fail(`${what} ${JSON.stringify(resolved)} leaves the map`);
        return null;
      }
      return [resolved[0], resolved[1]];
    };
    const at = place(anchor.at, "position");
    if (at === null) continue;
    switch (anchor.kind) {
      case "door": {
        const entry = place(anchor.entry, "entry");
        if (entry !== null) out.push({ id: anchor.id, kind: "door", at, entry });
        break;
      }
      case "guardian":
        if (kinds.get(anchor.blocksDoor) !== "door") {
          fail(`blocks ${anchor.blocksDoor}, which is not a door anchor`);
        } else {
          out.push({ id: anchor.id, kind: "guardian", at, blocksDoor: anchor.blocksDoor });
        }
        break;
      case "chest":
        if (anchor.behindGuardian !== undefined && kinds.get(anchor.behindGuardian) !== "guardian") {
          fail(`sits behind ${anchor.behindGuardian}, which is not a guardian anchor`);
        } else {
          out.push({
            id: anchor.id,
            kind: "chest",
            at,
            ...(anchor.behindGuardian === undefined ? {} : { behindGuardian: anchor.behindGuardian }),
          });
        }
        break;
      case "friendly":
        out.push({
          id: anchor.id,
          kind: "friendly",
          at,
          ...(anchor.cluster === undefined ? {} : { cluster: anchor.cluster }),
        });
        break;
      default:
        out.push({ id: anchor.id, kind: anchor.kind, at });
    }
  }
  return out;
}

/** The object layers whose shapes block movement. */
function blockingObjectLayerNames(map: WorkingMap, definition: DreamMapDefinition): ReadonlySet<string> {
  return new Set(
    definition.walkability?.blockingObjectLayers ??
      [...map.objectLayers].filter((name) => name.toLowerCase() === "collision"),
  );
}

/** The tile layers whose tiles block movement and are never drawn. */
function blockingLayerNames(map: WorkingMap, definition: DreamMapDefinition): ReadonlySet<string> {
  return new Set(
    definition.walkability?.blockingLayers ??
      map.layers.filter((layer) => layer.name.toLowerCase() === "collision").map((layer) => layer.name),
  );
}

function deriveWalkability(map: WorkingMap, definition: DreamMapDefinition): string {
  const rules = definition.walkability ?? {};
  const blockingLayers = blockingLayerNames(map, definition);
  const properties = rules.blockingTileProperties ?? DEFAULT_BLOCKING_PROPERTIES;
  const shapesBlock = rules.collisionShapesBlock ?? true;
  const blocksCache = new Map<number, boolean>();
  const tileBlocks = (gid: number): boolean => {
    const id = gidWithoutFlags(gid);
    if (id === 0) return false;
    const cached = blocksCache.get(id);
    if (cached !== undefined) return cached;
    const tileset = tilesetForGid(map.tilesets, id);
    const tile = tileset?.tiles.find((candidate) => candidate.id === id - tileset.firstGid);
    const blocks =
      map.blockingGids.has(id) ||
      (tile !== undefined &&
        ((shapesBlock && tile.hasCollision) || properties.some((name) => tile.properties[name] === true)));
    blocksCache.set(id, blocks);
    return blocks;
  };
  const blocked = new Uint8Array(map.width * map.height);
  for (const layer of map.layers) {
    if (map.hidden.has(layer.name)) continue;
    const isBlockingLayer = blockingLayers.has(layer.name);
    if (!isBlockingLayer && !layer.visible) continue;
    layer.gids.forEach((gid, cell) => {
      if (isBlockingLayer ? gidWithoutFlags(gid) !== 0 : tileBlocks(gid)) blocked[cell] = 1;
    });
  }
  for (const name of blockingObjectLayerNames(map, definition)) {
    if (map.hidden.has(name)) continue;
    map.objectShapes.get(name)?.forEach((flag, cell) => {
      if (flag === 1) blocked[cell] = 1;
    });
  }
  for (const object of map.objects) {
    if (map.hidden.has(object.layer) || map.invisibleObjectLayers.has(object.layer) || !tileBlocks(object.gid)) continue;
    const [left, row] = objectCell(map, object);
    const span = Math.max(1, Math.ceil(object.width / map.tileWidth));
    for (let x = left; x < left + span; x += 1) {
      if (inBounds(map, [x, row])) blocked[row * map.width + x] = 1;
    }
  }
  let walkable = "";
  for (let cell = 0; cell < blocked.length; cell += 1) {
    const forced = map.override[cell];
    walkable += (forced === -1 ? blocked[cell] === 0 : forced === 0) ? "1" : "0";
  }
  return walkable;
}

/** Compile a dream map module against its source and the asset catalogs. */
export function compileDreamMap(
  definition: DreamMapDefinition,
  input: DreamMapCompileInput,
): DreamMapCompileResult {
  const loaded = loadWorkingMap(definition, input);
  if ("kind" in loaded) return { ok: false, errors: [loaded] };
  const map = loaded;
  const errors: DreamMapCompileError[] = [];
  for (const [index, op] of definition.recipe.entries()) {
    try {
      applyOp(map, op, input);
    } catch (error) {
      if (!(error instanceof RecipeError)) throw error;
      errors.push({ kind: "recipe", index, message: `${op.op}: ${error.message}` });
      return { ok: false, errors };
    }
  }
  for (const name of definition.walkability?.blockingLayers ?? []) {
    if (findLayer(map, name) === undefined) {
      errors.push({ kind: "authoring", message: `unknown blocking layer ${name}` });
    }
  }
  for (const name of definition.walkability?.blockingObjectLayers ?? []) {
    if (!map.objectLayers.has(name)) {
      errors.push({ kind: "authoring", message: `unknown blocking object layer ${name}` });
    }
  }
  const blockingLayers = blockingLayerNames(map, definition);

  const landmarks = new Map<string, TilePoint>();
  for (const landmark of definition.landmarks) {
    if (landmarks.has(landmark.name)) errors.push({ kind: "authoring", message: `duplicate landmark ${landmark.name}` });
    if (!inBounds(map, landmark.at)) errors.push({ kind: "authoring", message: `landmark ${landmark.name} leaves the map` });
    landmarks.set(landmark.name, landmark.at);
  }
  const regionNames = new Set<string>();
  for (const region of definition.regions) {
    if (regionNames.has(region.name)) errors.push({ kind: "authoring", message: `duplicate region ${region.name}` });
    if (!inBounds(map, region.from) || !inBounds(map, region.to)) {
      errors.push({ kind: "authoring", message: `region ${region.name} leaves the map` });
    }
    regionNames.add(region.name);
  }
  const anchors = resolveAnchors(definition.anchors, landmarks, map, errors);
  if (errors.length > 0) return { ok: false, errors };

  const cells = map.width * map.height;
  const layers: CompiledTileLayer[] = [];
  const aboveMask = new Uint8Array(cells);
  for (const layer of map.layers) {
    if (map.hidden.has(layer.name) || blockingLayers.has(layer.name) || !layer.visible) continue;
    const base = layer.gids.map((gid, cell) => (layer.aboveAll || layer.lifted[cell] === 0 ? gid : 0));
    const lifted = layer.gids.map((gid, cell) => (!layer.aboveAll && layer.lifted[cell] === 1 ? gid : 0));
    const common = { opacity: layer.opacity, offset: layer.offset };
    const entries: CompiledTileLayer[] = [
      { name: layer.name, gids: base, ...common, above: layer.aboveAll },
    ];
    if (lifted.some((gid) => gid !== 0)) {
      entries.push({ name: `${layer.name}:above`, gids: lifted, ...common, above: true });
    }
    for (const entry of entries) {
      layers.push(entry);
      if (!entry.above) continue;
      entry.gids.forEach((gid, cell) => {
        if (gidWithoutFlags(gid) !== 0) aboveMask[cell] = 1;
      });
    }
  }
  const objects: CompiledTileObject[] = map.objects
    .filter((object) => !map.hidden.has(object.layer) && !map.invisibleObjectLayers.has(object.layer))
    .map((object) => ({
      gid: object.gid,
      x: object.x,
      y: object.y,
      width: object.width,
      height: object.height,
      layer: object.layer,
      above: object.above,
    }));

  return {
    ok: true,
    map: {
      format: COMPILED_DREAM_MAP_FORMAT,
      id: definition.id,
      sourceSha256: definition.source.kind === "tiled" ? definition.source.sha256 : null,
      width: map.width,
      height: map.height,
      tileWidth: map.tileWidth,
      tileHeight: map.tileHeight,
      tilesets: map.tilesets.map(compiledTileset),
      layers,
      objects,
      walkable: deriveWalkability(map, definition),
      abovePlayer: Array.from(aboveMask, (flag) => (flag === 1 ? "1" : "0")).join(""),
      regions: definition.regions,
      landmarks: definition.landmarks,
      anchors,
    },
  };
}
