// A pure TS reader for Tiled maps (TMX XML and TMJ JSON) and tilesets (TSX
// and TSJ). It normalizes both formats to one model: finite tile layers in
// row-major global ids (flip flags kept), object layers, tilesets with their
// per-tile properties, images and collision shapes, and typed properties.
// Group layers flatten in draw order; image layers are ignored. Infinite maps
// normalize to the bounds of their chunks. Decompression and file access are
// injected, so the reader has no runtime dependency on Node.

import { childNamed, childrenNamed, parseXml, type XmlElement } from "./xml";

/** Tiled stores horizontal, vertical and diagonal flips in a gid's high bits. */
export const TILED_FLIP_BITS = 0xf0000000;

/** The tile id of a global id, without its flip flags. */
export function gidWithoutFlags(gid: number): number {
  return (gid & ~TILED_FLIP_BITS) >>> 0;
}

export type TiledPropertyValue = string | number | boolean;
export type TiledProperties = Readonly<Record<string, TiledPropertyValue>>;

export interface TiledImage {
  /** Path of the image, resolved against the referencing file's directory. */
  readonly path: string;
  readonly width: number;
  readonly height: number;
}

export interface TiledTile {
  /** Local id within its tileset. */
  readonly id: number;
  readonly properties: TiledProperties;
  /** An image-collection tile's own image. */
  readonly image: TiledImage | null;
  /** Whether the tile carries collision shapes (an object group). */
  readonly hasCollision: boolean;
}

export interface TiledTileset {
  readonly firstGid: number;
  readonly name: string;
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly tileCount: number;
  readonly columns: number;
  readonly spacing: number;
  readonly margin: number;
  readonly tileOffset: { readonly x: number; readonly y: number };
  /** The sheet image; null for an image-collection tileset. */
  readonly image: TiledImage | null;
  /** Tiles with properties, images or collision shapes. */
  readonly tiles: readonly TiledTile[];
  readonly properties: TiledProperties;
  /** The external tileset path as resolved, or null when embedded. */
  readonly externalPath: string | null;
}

export interface TiledTileLayer {
  readonly kind: "tile";
  readonly name: string;
  /** Raw global ids with flip flags, row-major, `width × height` of the map. */
  readonly gids: readonly number[];
  readonly visible: boolean;
  readonly opacity: number;
  readonly offset: { readonly x: number; readonly y: number };
  readonly properties: TiledProperties;
}

export interface TiledObject {
  readonly id: number;
  readonly name: string;
  /** The object's class (Tiled ≥1.9) or type. */
  readonly type: string;
  /** Pixel position; a tile object's y is its bottom edge, as in Tiled. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly gid: number | null;
  readonly point: boolean;
  /** A polygon's or polyline's vertices, in pixels relative to `x`, `y`. */
  readonly vertices: readonly { readonly x: number; readonly y: number }[] | null;
  readonly properties: TiledProperties;
}

export interface TiledObjectLayer {
  readonly kind: "object";
  readonly name: string;
  readonly objects: readonly TiledObject[];
  readonly visible: boolean;
  readonly properties: TiledProperties;
}

export type TiledLayer = TiledTileLayer | TiledObjectLayer;

export interface TiledMap {
  readonly width: number;
  readonly height: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly orientation: string;
  readonly tilesets: readonly TiledTileset[];
  readonly layers: readonly TiledLayer[];
  readonly properties: TiledProperties;
}

export type TiledCompression = "zlib" | "gzip" | "zstd";

export interface TiledReadOptions {
  /** The map file's path; relative references resolve against its directory. */
  readonly path: string;
  /** Reads a referenced file (external tileset or template) as text. */
  readonly loadText: (path: string) => string;
  /** Decompresses base64 layer data. Required only for compressed maps. */
  readonly decompress?: (bytes: Uint8Array, compression: TiledCompression) => Uint8Array;
}

// --- paths ---------------------------------------------------------------

/** Normalize a slash-separated path, resolving `.` and `..` segments. */
export function normalizePath(path: string): string {
  const absolute = path.startsWith("/");
  const out: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === ".." && out.length > 0 && out[out.length - 1] !== "..") out.pop();
    else if (segment !== ".." || !absolute) out.push(segment);
  }
  return `${absolute ? "/" : ""}${out.join("/")}`;
}

/** Resolve `reference` against the directory of the file at `from`. */
export function resolveRelativePath(from: string, reference: string): string {
  if (reference.startsWith("/")) return normalizePath(reference);
  const slash = from.lastIndexOf("/");
  const directory = slash === -1 ? "" : from.slice(0, slash + 1);
  return normalizePath(`${directory}${reference}`);
}

// --- shared decoding -------------------------------------------------------

function fail(path: string, message: string): never {
  throw new Error(`Tiled ${path}: ${message}`);
}

function numberOf(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function propertyValue(type: string, raw: unknown): TiledPropertyValue {
  if (type === "bool") return raw === true || raw === "true";
  if (type === "int" || type === "float") return numberOf(raw, 0);
  if (typeof raw === "string") return raw;
  return raw === undefined || raw === null ? "" : JSON.stringify(raw);
}

function decodeBase64(text: string): Uint8Array {
  const binary = atob(text.replace(/\s+/gu, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function gidsFromBytes(bytes: Uint8Array): number[] {
  const gids: number[] = [];
  for (let i = 0; i + 3 < bytes.length; i += 4) {
    gids.push(
      (bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24)) >>> 0,
    );
  }
  return gids;
}

function decodeLayerData(
  path: string,
  data: string | readonly number[],
  encoding: string | undefined,
  compression: string | undefined,
  options: TiledReadOptions,
): number[] {
  if (typeof data !== "string") return data.map((gid) => gid >>> 0);
  if (encoding === "csv") {
    return data
      .split(",")
      .map((cell) => cell.trim())
      .filter((cell) => cell !== "")
      .map((cell) => Number(cell) >>> 0);
  }
  if (encoding !== "base64") fail(path, `unsupported layer encoding ${String(encoding)}`);
  let bytes = decodeBase64(data);
  if (compression !== undefined && compression !== "") {
    if (compression !== "zlib" && compression !== "gzip" && compression !== "zstd") {
      fail(path, `unsupported layer compression ${compression}`);
    }
    if (options.decompress === undefined) fail(path, `no decompressor for ${compression}`);
    bytes = options.decompress(bytes, compression);
  }
  return gidsFromBytes(bytes);
}

/** A layer's tiles as chunks in map tile coordinates before normalization. */
interface RawChunk {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly gids: readonly number[];
}

interface RawTileLayer {
  readonly kind: "tile";
  readonly name: string;
  readonly chunks: readonly RawChunk[];
  readonly visible: boolean;
  readonly opacity: number;
  readonly offset: { readonly x: number; readonly y: number };
  readonly properties: TiledProperties;
}

type RawLayer = RawTileLayer | TiledObjectLayer;

interface GroupContext {
  readonly visible: boolean;
  readonly opacity: number;
  readonly offset: { readonly x: number; readonly y: number };
  readonly properties: TiledProperties;
}

const ROOT_GROUP: GroupContext = {
  visible: true,
  opacity: 1,
  offset: { x: 0, y: 0 },
  properties: {},
};

function within(
  group: GroupContext,
  visible: boolean,
  opacity: number,
  offset: { x: number; y: number },
  properties: TiledProperties,
): GroupContext {
  return {
    visible: group.visible && visible,
    opacity: group.opacity * opacity,
    offset: { x: group.offset.x + offset.x, y: group.offset.y + offset.y },
    properties: { ...group.properties, ...properties },
  };
}

/** Lay chunks onto finite layers sized to the bounds of every chunk. */
function normalizeLayers(
  layers: readonly RawLayer[],
  width: number,
  height: number,
  tileWidth: number,
  tileHeight: number,
  infinite: boolean,
): { width: number; height: number; layers: TiledLayer[] } {
  let minX = 0;
  let minY = 0;
  let maxX = width;
  let maxY = height;
  if (infinite) {
    const chunks = layers.flatMap((layer) => (layer.kind === "tile" ? layer.chunks : []));
    if (chunks.length > 0) {
      minX = Math.min(...chunks.map((chunk) => chunk.x));
      minY = Math.min(...chunks.map((chunk) => chunk.y));
      maxX = Math.max(...chunks.map((chunk) => chunk.x + chunk.width));
      maxY = Math.max(...chunks.map((chunk) => chunk.y + chunk.height));
    }
  }
  const outWidth = maxX - minX;
  const outHeight = maxY - minY;
  return {
    width: outWidth,
    height: outHeight,
    layers: layers.map((layer): TiledLayer => {
      if (layer.kind === "object") {
        return {
          ...layer,
          objects: layer.objects.map((object) => ({
            ...object,
            x: object.x - minX * tileWidth,
            y: object.y - minY * tileHeight,
          })),
        };
      }
      const gids = new Array<number>(outWidth * outHeight).fill(0);
      for (const chunk of layer.chunks) {
        for (let row = 0; row < chunk.height; row += 1) {
          for (let column = 0; column < chunk.width; column += 1) {
            const x = chunk.x + column - minX;
            const y = chunk.y + row - minY;
            if (x < 0 || y < 0 || x >= outWidth || y >= outHeight) continue;
            gids[y * outWidth + x] = chunk.gids[row * chunk.width + column] ?? 0;
          }
        }
      }
      return {
        kind: "tile",
        name: layer.name,
        gids,
        visible: layer.visible,
        opacity: layer.opacity,
        offset: layer.offset,
        properties: layer.properties,
      };
    }),
  };
}

// --- XML (TMX / TSX) -------------------------------------------------------

function xmlProperties(element: XmlElement): TiledProperties {
  const container = childNamed(element, "properties");
  if (container === null) return {};
  const out: Record<string, TiledPropertyValue> = {};
  for (const property of childrenNamed(container, "property")) {
    const name = property.attributes.name;
    if (name === undefined) continue;
    const type = property.attributes.type ?? "string";
    out[name] = propertyValue(type, property.attributes.value ?? property.text);
  }
  return out;
}

function xmlImage(element: XmlElement | null, from: string): TiledImage | null {
  if (element === null) return null;
  const reference = element.attributes.source;
  if (reference === undefined) return null;
  return {
    path: resolveRelativePath(from, reference),
    width: numberOf(element.attributes.width, 0),
    height: numberOf(element.attributes.height, 0),
  };
}

function xmlTileset(
  element: XmlElement,
  firstGid: number,
  path: string,
  externalPath: string | null,
): TiledTileset {
  const offset = childNamed(element, "tileoffset");
  return {
    firstGid,
    name: element.attributes.name ?? "",
    tileWidth: numberOf(element.attributes.tilewidth, 0),
    tileHeight: numberOf(element.attributes.tileheight, 0),
    tileCount: numberOf(element.attributes.tilecount, 0),
    columns: numberOf(element.attributes.columns, 0),
    spacing: numberOf(element.attributes.spacing, 0),
    margin: numberOf(element.attributes.margin, 0),
    tileOffset: {
      x: numberOf(offset?.attributes.x, 0),
      y: numberOf(offset?.attributes.y, 0),
    },
    image: xmlImage(childNamed(element, "image"), path),
    tiles: childrenNamed(element, "tile").map((tile) => ({
      id: numberOf(tile.attributes.id, 0),
      properties: xmlProperties(tile),
      image: xmlImage(childNamed(tile, "image"), path),
      hasCollision: (childNamed(tile, "objectgroup")?.children.length ?? 0) > 0,
    })),
    properties: xmlProperties(element),
    externalPath,
  };
}

function xmlVertices(element: XmlElement): TiledObject["vertices"] {
  const shape = childNamed(element, "polygon") ?? childNamed(element, "polyline");
  const points = shape?.attributes.points;
  if (points === undefined) return null;
  return points
    .trim()
    .split(/\s+/u)
    .map((pair) => {
      const [x, y] = pair.split(",");
      return { x: numberOf(x, 0), y: numberOf(y, 0) };
    });
}

function xmlObject(element: XmlElement): TiledObject {
  const gid = element.attributes.gid;
  return {
    id: numberOf(element.attributes.id, 0),
    name: element.attributes.name ?? "",
    type: element.attributes.class ?? element.attributes.type ?? "",
    x: numberOf(element.attributes.x, 0),
    y: numberOf(element.attributes.y, 0),
    width: numberOf(element.attributes.width, 0),
    height: numberOf(element.attributes.height, 0),
    gid: gid === undefined ? null : Number(gid) >>> 0,
    point: childNamed(element, "point") !== null,
    vertices: xmlVertices(element),
    properties: xmlProperties(element),
  };
}

function xmlLayers(
  parent: XmlElement,
  group: GroupContext,
  path: string,
  options: TiledReadOptions,
  width: number,
  height: number,
): RawLayer[] {
  const out: RawLayer[] = [];
  for (const element of parent.children) {
    const attributes = element.attributes;
    const context = within(
      group,
      attributes.visible !== "0",
      numberOf(attributes.opacity, 1),
      { x: numberOf(attributes.offsetx, 0), y: numberOf(attributes.offsety, 0) },
      xmlProperties(element),
    );
    if (element.name === "layer") {
      const data = childNamed(element, "data");
      if (data === null) fail(path, `layer ${attributes.name ?? ""} has no data`);
      const encoding = data.attributes.encoding;
      const compression = data.attributes.compression;
      const chunkElements = childrenNamed(data, "chunk");
      const decode = (holder: XmlElement): number[] =>
        encoding === undefined
          ? childrenNamed(holder, "tile").map((tile) => numberOf(tile.attributes.gid, 0) >>> 0)
          : decodeLayerData(path, holder.text, encoding, compression, options);
      const chunks: RawChunk[] =
        chunkElements.length > 0
          ? chunkElements.map((chunk) => ({
              x: numberOf(chunk.attributes.x, 0),
              y: numberOf(chunk.attributes.y, 0),
              width: numberOf(chunk.attributes.width, 0),
              height: numberOf(chunk.attributes.height, 0),
              gids: decode(chunk),
            }))
          : [{ x: 0, y: 0, width, height, gids: decode(data) }];
      out.push({ kind: "tile", name: attributes.name ?? "", chunks, ...context });
    } else if (element.name === "objectgroup") {
      out.push({
        kind: "object",
        name: attributes.name ?? "",
        objects: childrenNamed(element, "object").map(xmlObject),
        visible: context.visible,
        properties: context.properties,
      });
    } else if (element.name === "group") {
      out.push(...xmlLayers(element, context, path, options, width, height));
    }
  }
  return out;
}

function readTmx(text: string, options: TiledReadOptions): TiledMap {
  const path = options.path;
  const root = parseXml(text);
  if (root.name !== "map") fail(path, "root element is not <map>");
  const width = numberOf(root.attributes.width, 0);
  const height = numberOf(root.attributes.height, 0);
  const tileWidth = numberOf(root.attributes.tilewidth, 0);
  const tileHeight = numberOf(root.attributes.tileheight, 0);
  const tilesets = childrenNamed(root, "tileset").map((element) => {
    const firstGid = numberOf(element.attributes.firstgid, 1);
    const source = element.attributes.source;
    if (source === undefined) return xmlTileset(element, firstGid, path, null);
    return readExternalTileset(resolveRelativePath(path, source), firstGid, options);
  });
  const raw = xmlLayers(root, ROOT_GROUP, path, options, width, height);
  const normalized = normalizeLayers(
    raw,
    width,
    height,
    tileWidth,
    tileHeight,
    root.attributes.infinite === "1",
  );
  return {
    width: normalized.width,
    height: normalized.height,
    tileWidth,
    tileHeight,
    orientation: root.attributes.orientation ?? "orthogonal",
    tilesets,
    layers: normalized.layers,
    properties: xmlProperties(root),
  };
}

// --- JSON (TMJ / TSJ) ------------------------------------------------------

type Json = Record<string, unknown>;

function isJson(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function jsonString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function jsonProperties(value: unknown): TiledProperties {
  const out: Record<string, TiledPropertyValue> = {};
  for (const property of jsonArray(value)) {
    if (!isJson(property) || typeof property.name !== "string") continue;
    out[property.name] = propertyValue(jsonString(property.type, "string"), property.value);
  }
  return out;
}

function jsonImage(reference: unknown, width: unknown, height: unknown, from: string): TiledImage | null {
  if (typeof reference !== "string" || reference === "") return null;
  return {
    path: resolveRelativePath(from, reference),
    width: numberOf(width, 0),
    height: numberOf(height, 0),
  };
}

function jsonTileset(json: Json, firstGid: number, path: string, externalPath: string | null): TiledTileset {
  const offset = isJson(json.tileoffset) ? json.tileoffset : {};
  return {
    firstGid,
    name: jsonString(json.name),
    tileWidth: numberOf(json.tilewidth, 0),
    tileHeight: numberOf(json.tileheight, 0),
    tileCount: numberOf(json.tilecount, 0),
    columns: numberOf(json.columns, 0),
    spacing: numberOf(json.spacing, 0),
    margin: numberOf(json.margin, 0),
    tileOffset: { x: numberOf(offset.x, 0), y: numberOf(offset.y, 0) },
    image: jsonImage(json.image, json.imagewidth, json.imageheight, path),
    tiles: jsonArray(json.tiles).filter(isJson).map((tile) => ({
      id: numberOf(tile.id, 0),
      properties: jsonProperties(tile.properties),
      image: jsonImage(tile.image, tile.imagewidth, tile.imageheight, path),
      hasCollision:
        isJson(tile.objectgroup) && jsonArray(tile.objectgroup.objects).length > 0,
    })),
    properties: jsonProperties(json.properties),
    externalPath,
  };
}

function jsonObject(json: Json): TiledObject {
  return {
    id: numberOf(json.id, 0),
    name: jsonString(json.name),
    type: jsonString(json.class, jsonString(json.type)),
    x: numberOf(json.x, 0),
    y: numberOf(json.y, 0),
    width: numberOf(json.width, 0),
    height: numberOf(json.height, 0),
    gid: json.gid === undefined ? null : numberOf(json.gid, 0) >>> 0,
    point: json.point === true,
    vertices: Array.isArray(json.polygon) || Array.isArray(json.polyline)
      ? jsonArray(json.polygon ?? json.polyline).filter(isJson).map((vertex) => ({
          x: numberOf(vertex.x, 0),
          y: numberOf(vertex.y, 0),
        }))
      : null,
    properties: jsonProperties(json.properties),
  };
}

function jsonLayers(
  layers: readonly unknown[],
  group: GroupContext,
  path: string,
  options: TiledReadOptions,
  width: number,
  height: number,
): RawLayer[] {
  const out: RawLayer[] = [];
  for (const layer of layers) {
    if (!isJson(layer)) continue;
    const context = within(
      group,
      layer.visible !== false,
      numberOf(layer.opacity, 1),
      { x: numberOf(layer.offsetx, 0), y: numberOf(layer.offsety, 0) },
      jsonProperties(layer.properties),
    );
    const name = jsonString(layer.name);
    const encoding = typeof layer.encoding === "string" ? layer.encoding : undefined;
    const compression = typeof layer.compression === "string" ? layer.compression : undefined;
    const decode = (data: unknown): number[] =>
      typeof data === "string"
        ? decodeLayerData(path, data, encoding ?? "base64", compression, options)
        : decodeLayerData(path, jsonArray(data).map((gid) => numberOf(gid, 0)), encoding, compression, options);
    if (layer.type === "tilelayer") {
      const chunks: RawChunk[] = Array.isArray(layer.chunks)
        ? layer.chunks.filter(isJson).map((chunk) => ({
            x: numberOf(chunk.x, 0),
            y: numberOf(chunk.y, 0),
            width: numberOf(chunk.width, 0),
            height: numberOf(chunk.height, 0),
            gids: decode(chunk.data),
          }))
        : [{ x: 0, y: 0, width, height, gids: decode(layer.data) }];
      out.push({ kind: "tile", name, chunks, ...context });
    } else if (layer.type === "objectgroup") {
      out.push({
        kind: "object",
        name,
        objects: jsonArray(layer.objects).filter(isJson).map(jsonObject),
        visible: context.visible,
        properties: context.properties,
      });
    } else if (layer.type === "group") {
      out.push(...jsonLayers(jsonArray(layer.layers), context, path, options, width, height));
    }
  }
  return out;
}

function readTmj(text: string, options: TiledReadOptions): TiledMap {
  const path = options.path;
  const json: unknown = JSON.parse(text);
  if (!isJson(json) || json.type !== "map") fail(path, "not a Tiled JSON map");
  const width = numberOf(json.width, 0);
  const height = numberOf(json.height, 0);
  const tileWidth = numberOf(json.tilewidth, 0);
  const tileHeight = numberOf(json.tileheight, 0);
  const tilesets = jsonArray(json.tilesets).filter(isJson).map((entry) => {
    const firstGid = numberOf(entry.firstgid, 1);
    if (typeof entry.source === "string") {
      return readExternalTileset(resolveRelativePath(path, entry.source), firstGid, options);
    }
    return jsonTileset(entry, firstGid, path, null);
  });
  const raw = jsonLayers(jsonArray(json.layers), ROOT_GROUP, path, options, width, height);
  const normalized = normalizeLayers(raw, width, height, tileWidth, tileHeight, json.infinite === true);
  return {
    width: normalized.width,
    height: normalized.height,
    tileWidth,
    tileHeight,
    orientation: jsonString(json.orientation, "orthogonal"),
    tilesets,
    layers: normalized.layers,
    properties: jsonProperties(json.properties),
  };
}

// --- entry points ----------------------------------------------------------

function readExternalTileset(path: string, firstGid: number, options: TiledReadOptions): TiledTileset {
  const text = options.loadText(path);
  if (text.trimStart().startsWith("<")) {
    const root = parseXml(text);
    if (root.name !== "tileset") fail(path, "root element is not <tileset>");
    return xmlTileset(root, firstGid, path, path);
  }
  const json: unknown = JSON.parse(text);
  if (!isJson(json)) fail(path, "not a Tiled JSON tileset");
  return jsonTileset(json, firstGid, path, path);
}

/** Read a Tiled map; the format follows the text (XML or JSON). */
export function readTiledMap(text: string, options: TiledReadOptions): TiledMap {
  const map = text.trimStart().startsWith("<") ? readTmx(text, options) : readTmj(text, options);
  if (map.orientation !== "orthogonal") {
    fail(options.path, `unsupported orientation ${map.orientation}`);
  }
  return map;
}

/** The tileset holding global id `gid` (flags ignored), or null for empty. */
export function tilesetForGid(
  tilesets: readonly TiledTileset[],
  gid: number,
): TiledTileset | null {
  const id = gidWithoutFlags(gid);
  if (id === 0) return null;
  let found: TiledTileset | null = null;
  for (const tileset of tilesets) {
    if (tileset.firstGid <= id && (found === null || tileset.firstGid > found.firstGid)) {
      found = tileset;
    }
  }
  return found;
}
