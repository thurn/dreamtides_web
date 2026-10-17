// Library sheet images as map material: a sheet tileset descriptor for a
// plain PNG cut into square tiles, a preview of the whole sheet on its tile
// grid (so an author can read the tile coordinates of a house or a tree),
// and cutting a rectangle of a sheet into a catalog stamp. Sheets with no
// Tiled map (LPC Revised, the tile atlases, the decoration packs) reach the
// stamp catalog this way; sheets used by a Tiled map can also be extracted
// from the compiled map (`extractStamp`).

import type { D97StampId } from "../../types/identifiers";
import type { DreamStampLayer } from "./assets";
import type { TilePoint, TileRect } from "./definition";
import type { PreviewableMap } from "./preview";
import { defineD97Stamp, type D97CatalogStamp, type D97StampTheme } from "./stamps";
import type { TiledTileset } from "./tiled";

export interface SheetImage {
  /** Library-relative path. */
  readonly path: string;
  readonly width: number;
  readonly height: number;
}

/** The tileset of a sheet image cut into `tileSize` squares, numbered from `firstGid`. */
export function sheetTileset(image: SheetImage, tileSize: number, firstGid = 1): TiledTileset {
  const columns = Math.floor(image.width / tileSize);
  const rows = Math.floor(image.height / tileSize);
  const file = image.path.slice(image.path.lastIndexOf("/") + 1);
  return {
    firstGid,
    name: file.replace(/\.[^.]+$/u, ""),
    tileWidth: tileSize,
    tileHeight: tileSize,
    tileCount: columns * rows,
    columns,
    spacing: 0,
    margin: 0,
    tileOffset: { x: 0, y: 0 },
    image: { path: image.path, width: image.width, height: image.height },
    tiles: [],
    properties: {},
    externalPath: null,
  };
}

/** A whole sheet shaped like a map: every tile at its own sheet position. */
export function sheetPreviewMap(tileset: TiledTileset): PreviewableMap {
  const width = tileset.columns;
  const height = Math.ceil(tileset.tileCount / Math.max(1, tileset.columns));
  const cells = width * height;
  return {
    width,
    height,
    tileWidth: tileset.tileWidth,
    tileHeight: tileset.tileHeight,
    tilesets: [
      {
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
        tileImages: [],
      },
    ],
    layers: [
      {
        name: "sheet",
        gids: Array.from({ length: cells }, (_, cell) => (cell < tileset.tileCount ? tileset.firstGid + cell : 0)),
        opacity: 1,
        offset: { x: 0, y: 0 },
        above: false,
      },
    ],
    objects: [],
    walkable: "1".repeat(cells),
    abovePlayer: "0".repeat(cells),
    regions: [],
    anchors: [],
  };
}

export interface SheetCutOptions {
  readonly id: D97StampId;
  readonly name: string;
  readonly theme: D97StampTheme;
  /** The map layer the stamp's tiles go on. */
  readonly layer: string;
  /** Top rows the player walks behind: drawn above the player and left walkable. */
  readonly aboveRows: number;
  /** Named points relative to the stamp's top-left, such as a door step. */
  readonly points?: Readonly<Record<string, TilePoint>>;
  /** Shrink the rectangle to the tiles that hold any pixels. */
  readonly trim?: boolean;
}

/**
 * Cut `rect` (sheet tile coordinates, both corners included) out of a sheet
 * as a catalog stamp. The top `aboveRows` rows go on an above-player layer
 * and open (`0`); below them, cells with a tile block (`1`) and empty cells
 * leave the map as it is (`.`). `isEmpty` says whether a sheet tile is fully
 * transparent; empty tiles are left out of the stamp, and with `trim` empty
 * border rows and columns are cut away first.
 */
export function cutSheetStamp(
  tileset: TiledTileset,
  rect: TileRect,
  options: SheetCutOptions,
  isEmpty: (localId: number) => boolean,
): D97CatalogStamp {
  let x0 = Math.min(rect.from[0], rect.to[0]);
  let y0 = Math.min(rect.from[1], rect.to[1]);
  let x1 = Math.max(rect.from[0], rect.to[0]);
  let y1 = Math.max(rect.from[1], rect.to[1]);
  const rows = Math.ceil(tileset.tileCount / Math.max(1, tileset.columns));
  if (x0 < 0 || y0 < 0 || x1 >= tileset.columns || y1 >= rows) {
    throw new RangeError(`rectangle ${JSON.stringify(rect)} leaves the ${String(tileset.columns)}×${String(rows)} sheet`);
  }
  if (options.trim === true) {
    const filled: TilePoint[] = [];
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) if (!isEmpty(y * tileset.columns + x)) filled.push([x, y]);
    }
    if (filled.length === 0) throw new RangeError(`rectangle ${JSON.stringify(rect)} holds no tiles`);
    x0 = Math.min(...filled.map(([x]) => x));
    x1 = Math.max(...filled.map(([x]) => x));
    y0 = Math.min(...filled.map(([, y]) => y));
    y1 = Math.max(...filled.map(([, y]) => y));
  }
  const width = x1 - x0 + 1;
  const height = y1 - y0 + 1;
  const ground: number[] = [];
  const above: number[] = [];
  let walkability = "";
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const local = (y0 + y) * tileset.columns + x0 + x;
      const gid = isEmpty(local) ? 0 : tileset.firstGid + local;
      const lifted = y < options.aboveRows;
      ground.push(lifted ? 0 : gid);
      above.push(lifted ? gid : 0);
      walkability += lifted ? (gid === 0 ? "." : "0") : gid === 0 ? "." : "1";
    }
  }
  const layers: DreamStampLayer[] = [];
  if (ground.some((gid) => gid !== 0)) layers.push({ layer: options.layer, gids: ground });
  if (above.some((gid) => gid !== 0)) layers.push({ layer: options.layer, gids: above, above: true });
  return defineD97Stamp({
    id: options.id,
    name: options.name,
    theme: options.theme,
    width,
    height,
    tilesets: [{ ...tileset, firstGid: 1 }],
    layers: layers.map((layer) => ({
      ...layer,
      gids: layer.gids.map((gid) => (gid === 0 ? 0 : gid - tileset.firstGid + 1)),
    })),
    walkability,
    ...(options.points === undefined ? {} : { points: options.points }),
    extractedFrom: { sheet: tileset.image?.path ?? tileset.name, rect: { from: [x0, y0], to: [x1, y1] } },
  });
}
