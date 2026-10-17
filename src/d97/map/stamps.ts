// The D97 stamp catalog format (decision P12): named LPC chunks a map
// recipe's `stamp` operation places by id. A catalog stamp is a DreamStamp
// (tilesets, layers, walkability mask, named points) plus a display name and
// the rectangle of the map it was extracted from. Each lives in its own
// module under `src/content/d97/stamps/`, listed by that directory's index.
//
// Its footprint is `width × height`; its anchor points are `points`; its
// above-player mask is derived from its `above` layers
// (`stampAbovePlayerMask`), so the layers stay the single source of truth.

import type { D97StampId, DreamMapSourceHash } from "../../types/identifiers";
import type { DreamStamp, DreamStampLayer } from "./assets";
import type { CompiledDreamMap, CompiledTileset } from "./compiled";
import type { TilePoint, TileRect } from "./definition";
import { gidWithoutFlags, TILED_FLIP_BITS, type TiledTileset } from "./tiled";

/** Where a catalog stamp was extracted from. */
export interface D97StampOrigin {
  /** The map as the extractor named it: a catalog map id, a module path or a library Tiled path. */
  readonly map: string;
  /** The extracted rectangle in the compiled map's coordinates. */
  readonly rect: TileRect;
  /** The compiled map's pinned source hash, null for a blank-canvas map. */
  readonly sourceSha256: DreamMapSourceHash | null;
}

export interface D97CatalogStamp extends DreamStamp {
  /** Display name for authoring and briefs; the id is the identity. */
  readonly name: string;
  readonly extractedFrom: D97StampOrigin;
}

/** Declare a catalog stamp module. */
export function defineD97Stamp(stamp: D97CatalogStamp): D97CatalogStamp {
  return stamp;
}

/** Row-major `width × height`: `1` where an above-player layer draws a tile. */
export function stampAbovePlayerMask(stamp: DreamStamp): string {
  const mask = new Array<string>(stamp.width * stamp.height).fill("0");
  for (const layer of stamp.layers) {
    if (layer.above !== true) continue;
    layer.gids.forEach((gid, cell) => {
      if (gidWithoutFlags(gid) !== 0) mask[cell] = "1";
    });
  }
  return mask.join("");
}

function tiledTileset(tileset: CompiledTileset, firstGid: number): TiledTileset {
  const { columns, tileCount } = tilesetGrid(tileset);
  return {
    firstGid,
    name: tileset.name,
    tileWidth: tileset.tileWidth,
    tileHeight: tileset.tileHeight,
    tileCount,
    columns,
    spacing: tileset.spacing,
    margin: tileset.margin,
    tileOffset: tileset.tileOffset,
    image:
      tileset.image === null
        ? null
        : { path: tileset.image, width: tileset.imageWidth, height: tileset.imageHeight },
    tiles: tileset.tileImages.map((tile) => ({
      id: tile.id,
      properties: {},
      image: { path: tile.image, width: tile.width, height: tile.height },
      hasCollision: false,
    })),
    properties: {},
    externalPath: null,
  };
}

/**
 * A sheet tileset's columns and tile count, derived from its image size when
 * the tileset leaves them out (older Tiled tilesets do).
 */
export function tilesetGrid(tileset: CompiledTileset): { readonly columns: number; readonly tileCount: number } {
  const across = (size: number, tile: number) =>
    Math.max(0, Math.floor((size - 2 * tileset.margin + tileset.spacing) / (tile + tileset.spacing)));
  const columns = tileset.columns > 0 ? tileset.columns : across(tileset.imageWidth, tileset.tileWidth);
  const tileCount =
    tileset.tileCount > 0
      ? tileset.tileCount
      : tileset.image === null
        ? Math.max(0, ...tileset.tileImages.map((tile) => tile.id + 1))
        : columns * across(tileset.imageHeight, tileset.tileHeight);
  return { columns, tileCount };
}

/** The compiled tileset owning `gid` (flags stripped), or null. */
export function compiledTilesetForGid(
  tilesets: readonly CompiledTileset[],
  gid: number,
): CompiledTileset | null {
  let owner: CompiledTileset | null = null;
  for (const tileset of tilesets) {
    if (tileset.firstGid <= gid && (owner === null || tileset.firstGid > owner.firstGid)) owner = tileset;
  }
  return owner;
}

/**
 * A stamp shaped like a compiled map for previews: its layers over its
 * tilesets, its walkability mask (`.` cells drawn walkable) and its
 * above-player mask. Tiles are sized by its first tileset.
 */
export function stampPreviewMap(stamp: DreamStamp): Pick<
  CompiledDreamMap,
  "width" | "height" | "tileWidth" | "tileHeight" | "tilesets" | "layers" | "objects" | "walkable" | "abovePlayer" | "regions" | "anchors"
> {
  const first = stamp.tilesets[0] as TiledTileset | undefined;
  const cells = stamp.width * stamp.height;
  const mask = stamp.walkability ?? ".".repeat(cells);
  return {
    width: stamp.width,
    height: stamp.height,
    tileWidth: first?.tileWidth ?? 32,
    tileHeight: first?.tileHeight ?? 32,
    tilesets: stamp.tilesets.map((tileset) => ({
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
    })),
    layers: stamp.layers.map((layer) => ({
      name: layer.layer,
      gids: layer.gids,
      opacity: 1,
      offset: { x: 0, y: 0 },
      above: layer.above === true,
    })),
    objects: [],
    walkable: Array.from(mask, (flag) => (flag === "1" ? "0" : "1")).join(""),
    abovePlayer: stampAbovePlayerMask(stamp),
    regions: [],
    anchors: [],
  };
}

const ABOVE_SUFFIX = ":above";

export interface StampExtraction {
  readonly stamp: D97CatalogStamp;
  /** Tile objects (free-placed props) inside the rectangle, which stamps do not carry. */
  readonly omittedObjects: number;
}

/**
 * Cut `rect` out of a compiled map as a catalog stamp. It keeps every tile
 * layer with a tile inside the rectangle (an above-player split such as
 * `Roof:above` becomes an `above` layer of `Roof`), renumbers the tilesets
 * it uses from gid 1, writes blocked cells as `1` and walkable cells as `0`
 * in its walkability mask, and names a point for every landmark, anchor and
 * door entry inside the rectangle (`<kind>-<n>` for anchors). Per-tile
 * properties are not carried: the walkability mask holds their effect.
 */
export function extractStamp(
  map: CompiledDreamMap,
  rect: TileRect,
  identity: { readonly id: D97StampId; readonly name: string; readonly origin: string },
): StampExtraction {
  const x0 = Math.min(rect.from[0], rect.to[0]);
  const y0 = Math.min(rect.from[1], rect.to[1]);
  const x1 = Math.max(rect.from[0], rect.to[0]);
  const y1 = Math.max(rect.from[1], rect.to[1]);
  if (x0 < 0 || y0 < 0 || x1 >= map.width || y1 >= map.height) {
    throw new RangeError(`rectangle ${JSON.stringify(rect)} leaves the ${String(map.width)}×${String(map.height)} map`);
  }
  const width = x1 - x0 + 1;
  const height = y1 - y0 + 1;
  const inside = ([x, y]: TilePoint) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

  const cut = map.layers.map((layer) => {
    const gids: number[] = [];
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) gids.push(layer.gids[y * map.width + x]);
    }
    return { layer, gids };
  });
  const used = new Set<CompiledTileset>();
  for (const { gids } of cut) {
    for (const gid of gids) {
      const owner = compiledTilesetForGid(map.tilesets, gidWithoutFlags(gid));
      if (gidWithoutFlags(gid) !== 0 && owner !== null) used.add(owner);
    }
  }
  const ordered = map.tilesets.filter((tileset) => used.has(tileset));
  const tilesets: TiledTileset[] = [];
  const firstGids = new Map<CompiledTileset, number>();
  let next = 1;
  for (const tileset of ordered) {
    firstGids.set(tileset, next);
    tilesets.push(tiledTileset(tileset, next));
    next += Math.max(tilesetGrid(tileset).tileCount, 1);
  }
  const remap = (gid: number): number => {
    const id = gidWithoutFlags(gid);
    if (id === 0) return 0;
    const owner = compiledTilesetForGid(map.tilesets, id);
    const first = owner === null ? undefined : firstGids.get(owner);
    if (owner === null || first === undefined) return 0;
    return ((gid & TILED_FLIP_BITS) | (id - owner.firstGid + first)) >>> 0;
  };
  const layers: DreamStampLayer[] = cut
    .filter(({ gids }) => gids.some((gid) => gidWithoutFlags(gid) !== 0))
    .map(({ layer, gids }) => ({
      layer: layer.name.endsWith(ABOVE_SUFFIX) ? layer.name.slice(0, -ABOVE_SUFFIX.length) : layer.name,
      gids: gids.map(remap),
      ...(layer.above ? { above: true } : {}),
    }));

  let walkability = "";
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) walkability += map.walkable[y * map.width + x] === "1" ? "0" : "1";
  }

  const points: Record<string, TilePoint> = {};
  const local = ([x, y]: TilePoint): TilePoint => [x - x0, y - y0];
  for (const landmark of map.landmarks) if (inside(landmark.at)) points[landmark.name] = local(landmark.at);
  const counts = new Map<string, number>();
  const name = (label: string) => {
    const count = (counts.get(label) ?? 0) + 1;
    counts.set(label, count);
    return `${label}-${String(count)}`;
  };
  for (const anchor of map.anchors) {
    if (inside(anchor.at)) points[name(anchor.kind)] = local(anchor.at);
    if (anchor.entry !== undefined && inside(anchor.entry)) points[name("door-entry")] = local(anchor.entry);
  }

  const omittedObjects = map.objects.filter((object) =>
    inside([Math.floor(object.x / map.tileWidth), Math.floor((object.y - 1) / map.tileHeight)]),
  ).length;

  return {
    stamp: defineD97Stamp({
      id: identity.id,
      name: identity.name,
      width,
      height,
      tilesets,
      layers,
      walkability,
      ...(Object.keys(points).length > 0 ? { points } : {}),
      extractedFrom: {
        map: identity.origin,
        rect: { from: [x0, y0], to: [x1, y1] },
        sourceSha256: map.sourceSha256,
      },
    }),
    omittedObjects,
  };
}

type Literal = string | number | boolean | null | undefined | readonly Literal[] | { readonly [key: string]: Literal };

/**
 * A value as a TypeScript literal: identifier keys unquoted, arrays of
 * primitives on one line, and `gids` arrays broken into rows of `rowWidth`.
 */
function tsLiteral(value: Literal, indent: string, rowWidth: number, key?: string): string {
  if (value === null || value === undefined || typeof value !== "object") return JSON.stringify(value ?? null);
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    const items = value as readonly Literal[];
    if (items.length === 0) return "[]";
    if (items.every((item) => item === null || typeof item !== "object")) {
      const parts = items.map((item) => JSON.stringify(item));
      if (key !== "gids" || rowWidth <= 0) return `[${parts.join(", ")}]`;
      const rows: string[] = [];
      for (let start = 0; start < parts.length; start += rowWidth) {
        rows.push(`${inner}${parts.slice(start, start + rowWidth).join(", ")},`);
      }
      return `[\n${rows.join("\n")}\n${indent}]`;
    }
    return `[\n${items.map((item) => `${inner}${tsLiteral(item, inner, rowWidth)},`).join("\n")}\n${indent}]`;
  }
  const entries = Object.entries(value as { readonly [key: string]: Literal }).filter(([, entry]) => entry !== undefined);
  if (entries.length === 0) return "{}";
  const lines = entries.map(([name, entry]) => {
    const label = /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(name) ? name : JSON.stringify(name);
    return `${inner}${label}: ${tsLiteral(entry, inner, rowWidth, name)},`;
  });
  return `{\n${lines.join("\n")}\n${indent}}`;
}

/**
 * The TypeScript text of a catalog stamp module under
 * `src/content/d97/stamps/`, default-exporting the stamp.
 */
export function stampModuleSource(stamp: D97CatalogStamp): string {
  const { id, extractedFrom, ...rest } = stamp;
  const body = tsLiteral(rest as unknown as Literal, "", stamp.width)
    .split("\n")
    .slice(1, -1)
    .join("\n");
  const hash =
    extractedFrom.sourceSha256 === null
      ? "null"
      : `parseDreamMapSourceHash(${JSON.stringify(extractedFrom.sourceSha256)})`;
  const rect = `{ from: ${JSON.stringify(extractedFrom.rect.from)}, to: ${JSON.stringify(extractedFrom.rect.to)} }`;
  const identifiers =
    extractedFrom.sourceSha256 === null ? "parseD97StampId" : "parseD97StampId, parseDreamMapSourceHash";
  return [
    `// ${stamp.name}: a D97 map stamp extracted by \`npm run d97:map -- stamps extract\`.`,
    "",
    `import { defineD97Stamp } from "../../../d97/map/stamps";`,
    `import { ${identifiers} } from "../../../types/identifiers";`,
    "",
    "export default defineD97Stamp({",
    `  id: parseD97StampId(${JSON.stringify(id)}),`,
    body,
    "  extractedFrom: {",
    `    map: ${JSON.stringify(extractedFrom.map)},`,
    `    rect: ${rect},`,
    `    sourceSha256: ${hash},`,
    "  },",
    "});",
    "",
  ].join("\n");
}
