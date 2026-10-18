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
// Recipe operations live one per module under `./ops/` and are applied
// through its registry. The compiled map lists only the tilesets its drawn
// layers and tile objects use.
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
  type DreamAnchorId,
  type DreamMapSourceHash,
} from "../../types/identifiers";
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
  TilePoint,
} from "./definition";
import { applyRecipeOp } from "./ops";
import {
  findLayer,
  inBounds,
  objectCell,
  RecipeError,
  type RecipeAssets,
  type WorkingMap,
  type WorkingObject,
} from "./ops/working-map";
import {
  gidWithoutFlags,
  readTiledMap,
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

export interface DreamMapCompileInput extends RecipeAssets {
  /** The Tiled source; null for a blank-canvas map. */
  readonly source: DreamMapSourceInput | null;
}

export type DreamMapCompileResult =
  | {
      readonly ok: true;
      readonly map: CompiledDreamMap;
      /** Tilesets the source or recipe brought in that no drawn tile uses, left out of the map. */
      readonly droppedTilesets: readonly { readonly name: string; readonly image: string | null }[];
    }
  | { readonly ok: false; readonly errors: readonly DreamMapCompileError[] };

/** SHA-256 of a source file's text, as map modules pin it. */
export function dreamMapSourceHash(text: string): DreamMapSourceHash {
  return parseDreamMapSourceHash(sha256(text));
}

const DEFAULT_BLOCKING_PROPERTIES = ["collides", "collision", "blocked"];

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
      case "door":
      case "buildingDoor": {
        const entry = place(anchor.entry, "entry");
        if (entry !== null) out.push({ id: anchor.id, kind: anchor.kind, at, entry });
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

/**
 * The tilesets a drawn layer or tile object uses, in map order. Tilesets no
 * drawn tile references (automapping rule sheets, collision sheets, art an
 * erase or crop removed) are dropped, so the compiled map names only art the
 * renderer draws; gids keep their numbering.
 */
function drawnTilesets(
  tilesets: readonly TiledTileset[],
  layers: readonly CompiledTileLayer[],
  objects: readonly CompiledTileObject[],
): TiledTileset[] {
  const used = new Set<TiledTileset>();
  const seen = new Set<number>();
  const use = (gid: number) => {
    const id = gidWithoutFlags(gid);
    if (id === 0 || seen.has(id)) return;
    seen.add(id);
    const owner = tilesetForGid(tilesets, id);
    if (owner !== null) used.add(owner);
  };
  for (const layer of layers) for (const gid of layer.gids) use(gid);
  for (const object of objects) use(object.gid);
  return tilesets.filter((tileset) => used.has(tileset));
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
      applyRecipeOp(map, op, input);
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

  const drawn = drawnTilesets(map.tilesets, layers, objects);
  return {
    ok: true,
    droppedTilesets: map.tilesets
      .filter((tileset) => !drawn.includes(tileset))
      .map((tileset) => ({ name: tileset.name, image: tileset.image?.path ?? null })),
    map: {
      format: COMPILED_DREAM_MAP_FORMAT,
      id: definition.id,
      sourceSha256: definition.source.kind === "tiled" ? definition.source.sha256 : null,
      width: map.width,
      height: map.height,
      tileWidth: map.tileWidth,
      tileHeight: map.tileHeight,
      tilesets: drawn.map(compiledTileset),
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
