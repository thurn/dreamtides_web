// The frame rectangles of one tileset image. Tilesets that omit their
// `columns` and `tilecount` (older Tiled files, such as Source of Tales'
// terrain sheet) take their grid from the image and tile sizes, as the map
// tools do; an image size the tileset leaves out comes from the loaded image.

import type { CompiledTileset } from "../map/compiled";
import { tilesetGrid } from "../map/stamps";

/** One tile's frame within its tileset image, keyed by gid without flags. */
export interface TileFrame {
  readonly gid: number;
  readonly x: number;
  readonly y: number;
}

/** The frames of `tileset` that fit inside a `width`×`height` image. */
export function tileFrames(
  tileset: CompiledTileset,
  width: number,
  height: number,
): TileFrame[] {
  const { columns, tileCount } = tilesetGrid({
    ...tileset,
    imageWidth: tileset.imageWidth > 0 ? tileset.imageWidth : width,
    imageHeight: tileset.imageHeight > 0 ? tileset.imageHeight : height,
  });
  const across = Math.max(1, columns);
  const out: TileFrame[] = [];
  for (let local = 0; local < tileCount; local += 1) {
    const x = tileset.margin + (local % across) * (tileset.tileWidth + tileset.spacing);
    const y = tileset.margin + Math.floor(local / across) * (tileset.tileHeight + tileset.spacing);
    if (x + tileset.tileWidth > width || y + tileset.tileHeight > height) continue;
    out.push({ gid: tileset.firstGid + local, x, y });
  }
  return out;
}
