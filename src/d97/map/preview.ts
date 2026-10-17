// The D97 map preview renderer (decision P12): draws a compiled map, or a
// rectangle of it, into an RGBA image the map inspector encodes as PNG. Pure:
// tileset sheets arrive through an image loader, and without one (no LPC
// library) the map draws as walkability colours instead.
//
// Every view outlines the map's regions (numbered in region order) and marks
// anchors with their letter (`ANCHOR_LETTERS`) and door entries with a dot,
// and may trace a route. A grid view adds a tile grid (stronger every ten
// tiles), tints blocked cells red, and labels tile coordinates in a margin
// `PREVIEW_GRID_MARGIN` pixels wide along its top and left edges. Views may
// also outline numbered footprints (stamp placements) and mark named points
// (a stamp's door step). Every label draws on a dark outline, and letters
// never shrink below `MIN_MARK_SCALE`, so they stay legible at small scales.

import type { CompiledDreamMap, CompiledTileset } from "./compiled";
import type { DreamAnchorKind, TilePoint, TileRect } from "./definition";
import { compiledTilesetForGid, tilesetGrid } from "./stamps";
import { gidWithoutFlags } from "./tiled";

export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  /** Row-major RGBA bytes, `width × height × 4`. */
  readonly data: Uint8Array;
}

/** Loads a library-relative image, or returns null when it is unavailable. */
export type PreviewImageLoader = (path: string) => RgbaImage | null;

type Rgb = readonly [number, number, number];

/** What a preview draws: a compiled map, or a stamp shaped like one. */
export type PreviewableMap = Pick<
  CompiledDreamMap,
  | "width"
  | "height"
  | "tileWidth"
  | "tileHeight"
  | "tilesets"
  | "layers"
  | "objects"
  | "walkable"
  | "abovePlayer"
  | "regions"
  | "anchors"
>;

export interface MapPreviewOptions {
  /** The tiles shown, both corners included. */
  readonly rect: TileRect;
  /** Output pixels per tile. */
  readonly tilePixels: number;
  /** Draw the coordinate grid, its margin labels and blocked-cell tint. */
  readonly grid: boolean;
  /** Tileset images; null draws walkability colours. */
  readonly images: PreviewImageLoader | null;
  /** Tiles to trace, such as the main route. */
  readonly route?: readonly TilePoint[];
  /** Footprints to outline with a numbered label, such as stamp placements. */
  readonly outlines?: readonly { readonly rect: TileRect; readonly label: string }[];
  /** Points to mark with a letter, such as a stamp's named points. */
  readonly marks?: readonly { readonly at: TilePoint; readonly letter: string }[];
}

export interface MapPreview {
  readonly image: RgbaImage;
  /** `tiles` when at least one tileset image loaded, else `walkability`. */
  readonly mode: "tiles" | "walkability";
  /** Tileset images the loader could not supply. */
  readonly missingImages: readonly string[];
}

/** The labelled margin of a grid view, in pixels, along its top and left edges. */
export const PREVIEW_GRID_MARGIN = 28;

/** The letter marking each anchor kind in previews. */
export const ANCHOR_LETTERS: Readonly<Record<DreamAnchorKind, string>> = {
  door: "D",
  waypoint: "W",
  shop: "S",
  guardian: "G",
  challenger: "C",
  friendly: "F",
  chest: "H",
  object: "O",
  townsfolk: "N",
};

const ANCHOR_COLORS: Readonly<Record<DreamAnchorKind, Rgb>> = {
  door: [150, 80, 220],
  waypoint: [40, 170, 220],
  shop: [215, 165, 30],
  guardian: [210, 45, 45],
  challenger: [230, 115, 25],
  friendly: [50, 160, 70],
  chest: [140, 95, 40],
  object: [215, 85, 165],
  townsfolk: [120, 120, 120],
};

/** Region outline colours, cycled in region order. */
export const REGION_COLORS: readonly { readonly name: string; readonly rgb: Rgb }[] = [
  { name: "yellow", rgb: [255, 230, 40] },
  { name: "cyan", rgb: [40, 230, 255] },
  { name: "magenta", rgb: [255, 60, 220] },
  { name: "lime", rgb: [120, 255, 60] },
  { name: "orange", rgb: [255, 150, 30] },
  { name: "white", rgb: [255, 255, 255] },
];

const BACKGROUND: Rgb = [24, 24, 28];
const WALKABLE: Rgb = [150, 196, 120];
const BLOCKED: Rgb = [70, 58, 52];
const ABOVE_TINT: Rgb = [70, 110, 230];
const BLOCKED_TINT: Rgb = [230, 30, 30];
const GRID_LINE: Rgb = [0, 0, 0];
const LABEL: Rgb = [230, 230, 230];
const ROUTE: Rgb = [255, 240, 60];
const LETTER: Rgb = [255, 255, 255];
const OUTLINE: Rgb = [245, 245, 245];
const MARK: Rgb = [20, 120, 200];
const SHADOW: Rgb = [0, 0, 0];
const LABEL_SCALE = 2;
/** The smallest scale anchor letters, region numbers and marks draw at. */
const MIN_MARK_SCALE = 2;

/** A 3×5 bitmap font: rows top to bottom, `1` lit. */
const FONT: Readonly<Record<string, readonly string[]>> = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "001", "001", "001"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
  "-": ["000", "000", "111", "000", "000"],
  A: ["010", "101", "111", "101", "101"],
  B: ["110", "101", "110", "101", "110"],
  C: ["011", "100", "100", "100", "011"],
  D: ["110", "101", "101", "101", "110"],
  E: ["111", "100", "110", "100", "111"],
  F: ["111", "100", "110", "100", "100"],
  G: ["011", "100", "101", "101", "011"],
  H: ["101", "101", "111", "101", "101"],
  I: ["111", "010", "010", "010", "111"],
  J: ["001", "001", "001", "101", "010"],
  K: ["101", "101", "110", "101", "101"],
  L: ["100", "100", "100", "100", "111"],
  M: ["101", "111", "111", "101", "101"],
  N: ["110", "101", "101", "101", "101"],
  O: ["010", "101", "101", "101", "010"],
  P: ["110", "101", "110", "100", "100"],
  Q: ["010", "101", "101", "110", "011"],
  R: ["110", "101", "110", "101", "101"],
  S: ["011", "100", "010", "001", "110"],
  T: ["111", "010", "010", "010", "010"],
  U: ["101", "101", "101", "101", "111"],
  V: ["101", "101", "101", "101", "010"],
  W: ["101", "101", "111", "111", "101"],
  X: ["101", "101", "010", "101", "101"],
  Y: ["101", "101", "010", "010", "010"],
  Z: ["111", "001", "010", "100", "111"],
};

class Canvas {
  readonly data: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
    fill: Rgb,
  ) {
    this.data = new Uint8Array(width * height * 4);
    for (let index = 0; index < width * height; index += 1) {
      this.data.set([fill[0], fill[1], fill[2], 255], index * 4);
    }
  }

  blend(x: number, y: number, [r, g, b]: Rgb, alpha: number): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height || alpha <= 0) return;
    const at = (y * this.width + x) * 4;
    const a = Math.min(alpha, 1);
    this.data[at] = Math.round(this.data[at] * (1 - a) + r * a);
    this.data[at + 1] = Math.round(this.data[at + 1] * (1 - a) + g * a);
    this.data[at + 2] = Math.round(this.data[at + 2] * (1 - a) + b * a);
  }

  fill(x: number, y: number, width: number, height: number, color: Rgb, alpha = 1): void {
    for (let row = y; row < y + height; row += 1) {
      for (let column = x; column < x + width; column += 1) this.blend(column, row, color, alpha);
    }
  }

  stroke(x: number, y: number, width: number, height: number, color: Rgb, thickness: number): void {
    this.fill(x, y, width, thickness, color);
    this.fill(x, y + height - thickness, width, thickness, color);
    this.fill(x, y, thickness, height, color);
    this.fill(x + width - thickness, y, thickness, height, color);
  }

  /** Text on a one-unit dark outline, legible over any tiles. */
  outlinedText(text: string, x: number, y: number, scale: number, color: Rgb): void {
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]] as const) {
      this.text(text, x + dx * Math.max(1, scale / 2), y + dy * Math.max(1, scale / 2), scale, SHADOW);
    }
    this.text(text, x, y, scale, color);
  }

  text(text: string, x: number, y: number, scale: number, color: Rgb): void {
    let left = x;
    for (const char of text.toUpperCase()) {
      const glyph = FONT[char];
      if (glyph !== undefined) {
        glyph.forEach((row, rowIndex) => {
          for (let column = 0; column < row.length; column += 1) {
            if (row[column] === "1") this.fill(left + column * scale, y + rowIndex * scale, scale, scale, color);
          }
        });
      }
      left += 4 * scale;
    }
  }
}

/** Pixel width of `text` in the bitmap font at `scale`. */
function textWidth(text: string, scale: number): number {
  return text.length === 0 ? 0 : (text.length * 4 - 1) * scale;
}

function normalizedRect({ from, to }: TileRect) {
  const x0 = Math.min(from[0], to[0]);
  const y0 = Math.min(from[1], to[1]);
  const x1 = Math.max(from[0], to[0]);
  const y1 = Math.max(from[1], to[1]);
  return { x0, y0, x1, y1, columns: x1 - x0 + 1, rows: y1 - y0 + 1 };
}

/** The pixel size of a preview of `rect` at `tilePixels` per tile. */
export function previewDimensions(
  rect: TileRect,
  tilePixels: number,
  grid: boolean,
): { readonly width: number; readonly height: number } {
  const { columns, rows } = normalizedRect(rect);
  const margin = grid ? PREVIEW_GRID_MARGIN : 0;
  return { width: margin + columns * tilePixels, height: margin + rows * tilePixels };
}

const FLIP_H = 0x80000000;
const FLIP_V = 0x40000000;
const FLIP_D = 0x20000000;

interface SourceTile {
  readonly image: RgbaImage;
  readonly sx: number;
  readonly sy: number;
  readonly width: number;
  readonly height: number;
  readonly tileset: CompiledTileset;
}

/** Draw a source tile scaled into a destination box, averaging when shrinking. */
function drawTile(
  canvas: Canvas,
  tile: SourceTile,
  gid: number,
  box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  clip: { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number },
  opacity: number,
): void {
  const { image, sx, sy, width: sw, height: sh } = tile;
  const flipH = (gid & FLIP_H) !== 0;
  const flipV = (gid & FLIP_V) !== 0;
  const flipD = (gid & FLIP_D) !== 0;
  for (let j = 0; j < box.height; j += 1) {
    const y = box.y + j;
    if (y < clip.y0 || y >= clip.y1) continue;
    const v0 = Math.floor((j * sh) / box.height);
    const v1 = Math.max(v0 + 1, Math.floor(((j + 1) * sh) / box.height));
    for (let i = 0; i < box.width; i += 1) {
      const x = box.x + i;
      if (x < clip.x0 || x >= clip.x1) continue;
      const u0 = Math.floor((i * sw) / box.width);
      const u1 = Math.max(u0 + 1, Math.floor(((i + 1) * sw) / box.width));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;
      for (let v = v0; v < v1; v += 1) {
        for (let u = u0; u < u1; u += 1) {
          let lu = u;
          let lv = v;
          if (flipV) lv = sh - 1 - lv;
          if (flipH) lu = sw - 1 - lu;
          if (flipD) [lu, lv] = [lv, lu];
          const px = sx + lu;
          const py = sy + lv;
          count += 1;
          if (px < 0 || py < 0 || px >= image.width || py >= image.height) continue;
          const at = (py * image.width + px) * 4;
          const alpha = image.data[at + 3];
          r += image.data[at] * alpha;
          g += image.data[at + 1] * alpha;
          b += image.data[at + 2] * alpha;
          a += alpha;
        }
      }
      if (a === 0) continue;
      canvas.blend(x, y, [r / a, g / a, b / a], (a / count / 255) * opacity);
    }
  }
}

/** Render a preview of a compiled map. */
export function renderMapPreview(map: PreviewableMap, options: MapPreviewOptions): MapPreview {
  const { x0, y0, x1, y1, columns, rows } = normalizedRect(options.rect);
  if (x0 < 0 || y0 < 0 || x1 >= map.width || y1 >= map.height) {
    throw new RangeError(`preview rectangle ${JSON.stringify(options.rect)} leaves the map`);
  }
  const tilePixels = Math.max(1, Math.floor(options.tilePixels));
  const margin = options.grid ? PREVIEW_GRID_MARGIN : 0;
  const canvas = new Canvas(margin + columns * tilePixels, margin + rows * tilePixels, BACKGROUND);
  const scale = tilePixels / map.tileWidth;
  const scaleY = tilePixels / map.tileHeight;
  const clip = { x0: margin, y0: margin, x1: canvas.width, y1: canvas.height };
  const cellX = (x: number) => margin + (x - x0) * tilePixels;
  const cellY = (y: number) => margin + (y - y0) * tilePixels;
  const mapPixelX = (px: number) => margin + (px - x0 * map.tileWidth) * scale;
  const mapPixelY = (py: number) => margin + (py - y0 * map.tileHeight) * scaleY;

  // Tile images.
  const missing = new Set<string>();
  const sheets = new Map<string, RgbaImage | null>();
  const load = (path: string): RgbaImage | null => {
    if (options.images === null) return null;
    if (!sheets.has(path)) {
      const image = options.images(path);
      sheets.set(path, image);
      if (image === null) missing.add(path);
    }
    return sheets.get(path) ?? null;
  };
  const sourceTile = (gid: number): SourceTile | null => {
    const id = gidWithoutFlags(gid);
    const tileset = compiledTilesetForGid(map.tilesets, id);
    if (tileset === null) return null;
    const local = id - tileset.firstGid;
    if (tileset.image === null) {
      const entry = tileset.tileImages.find((tile) => tile.id === local);
      const image = entry === undefined ? null : load(entry.image);
      return entry === undefined || image === null
        ? null
        : { image, sx: 0, sy: 0, width: entry.width, height: entry.height, tileset };
    }
    const image = load(tileset.image);
    const { columns } = tilesetGrid(tileset);
    if (image === null || columns <= 0) return null;
    const column = local % columns;
    const row = Math.floor(local / columns);
    return {
      image,
      sx: tileset.margin + column * (tileset.tileWidth + tileset.spacing),
      sy: tileset.margin + row * (tileset.tileHeight + tileset.spacing),
      width: tileset.tileWidth,
      height: tileset.tileHeight,
      tileset,
    };
  };

  let drewTile = false;
  if (options.images !== null) {
    const maxTileWidth = Math.max(map.tileWidth, ...map.tilesets.map((tileset) => tileset.tileWidth));
    const maxTileHeight = Math.max(map.tileHeight, ...map.tilesets.map((tileset) => tileset.tileHeight));
    const spillX = Math.ceil(maxTileWidth / map.tileWidth);
    const spillY = Math.ceil(maxTileHeight / map.tileHeight);
    const drawLayers = (above: boolean) => {
      for (const layer of map.layers) {
        if (layer.above !== above) continue;
        for (let y = y0; y <= Math.min(map.height - 1, y1 + spillY); y += 1) {
          for (let x = Math.max(0, x0 - spillX); x <= x1; x += 1) {
            const gid = layer.gids[y * map.width + x];
            if (gidWithoutFlags(gid) === 0) continue;
            const tile = sourceTile(gid);
            if (tile === null) continue;
            const left = x * map.tileWidth + tile.tileset.tileOffset.x + layer.offset.x;
            const bottom = (y + 1) * map.tileHeight + tile.tileset.tileOffset.y + layer.offset.y;
            const bx = Math.floor(mapPixelX(left));
            const by = Math.floor(mapPixelY(bottom - tile.height));
            const box = {
              x: bx,
              y: by,
              width: Math.floor(mapPixelX(left + tile.width)) - bx,
              height: Math.floor(mapPixelY(bottom)) - by,
            };
            if (box.width <= 0 || box.height <= 0) continue;
            if (box.x >= clip.x1 || box.y >= clip.y1 || box.x + box.width <= clip.x0 || box.y + box.height <= clip.y0) {
              continue;
            }
            drawTile(canvas, tile, gid, box, clip, layer.opacity);
            drewTile = true;
          }
        }
      }
      const objects = map.objects.filter((object) => object.above === above).sort((a, b) => a.y - b.y);
      for (const object of objects) {
        const tile = sourceTile(object.gid);
        if (tile === null) continue;
        const bx = Math.floor(mapPixelX(object.x));
        const by = Math.floor(mapPixelY(object.y - object.height));
        const box = {
          x: bx,
          y: by,
          width: Math.floor(mapPixelX(object.x + object.width)) - bx,
          height: Math.floor(mapPixelY(object.y)) - by,
        };
        if (box.width <= 0 || box.height <= 0) continue;
        drawTile(canvas, tile, object.gid, box, clip, 1);
        drewTile = true;
      }
    };
    drawLayers(false);
    drawLayers(true);
  }
  const mode = drewTile ? "tiles" : "walkability";

  // Walkability colours, or the blocked tint of a grid view.
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const cell = y * map.width + x;
      const walkable = map.walkable[cell] === "1";
      if (mode === "walkability") {
        canvas.fill(cellX(x), cellY(y), tilePixels, tilePixels, walkable ? WALKABLE : BLOCKED);
        if (map.abovePlayer[cell] === "1") canvas.fill(cellX(x), cellY(y), tilePixels, tilePixels, ABOVE_TINT, 0.35);
      } else if (options.grid && !walkable) {
        canvas.fill(cellX(x), cellY(y), tilePixels, tilePixels, BLOCKED_TINT, 0.3);
      }
    }
  }

  // The coordinate grid and its margin labels.
  if (options.grid) {
    for (let x = x0; x <= x1 + 1; x += 1) {
      const strong = x % 10 === 0;
      if (!strong && tilePixels < 6) continue;
      canvas.fill(cellX(x) - (x > x1 ? 1 : 0), margin, 1, rows * tilePixels, GRID_LINE, strong ? 0.6 : 0.2);
    }
    for (let y = y0; y <= y1 + 1; y += 1) {
      const strong = y % 10 === 0;
      if (!strong && tilePixels < 6) continue;
      canvas.fill(margin, cellY(y) - (y > y1 ? 1 : 0), columns * tilePixels, 1, GRID_LINE, strong ? 0.6 : 0.2);
    }
    const labelWidth = textWidth("000", LABEL_SCALE) + 4;
    const step = [1, 2, 5, 10, 20, 50, 100].find((candidate) => candidate * tilePixels >= labelWidth) ?? 100;
    for (let x = x0; x <= x1; x += 1) {
      if (x % step !== 0) continue;
      const label = String(x);
      const left = cellX(x) + Math.floor((tilePixels - textWidth(label, LABEL_SCALE)) / 2);
      canvas.outlinedText(label, Math.max(0, left), 8, LABEL_SCALE, LABEL);
    }
    for (let y = y0; y <= y1; y += 1) {
      if (y % step !== 0) continue;
      const label = String(y);
      const top = cellY(y) + Math.floor((tilePixels - 5 * LABEL_SCALE) / 2);
      canvas.outlinedText(label, margin - 4 - textWidth(label, LABEL_SCALE), Math.max(0, top), LABEL_SCALE, LABEL);
    }
  }

  // Region outlines, numbered in region order.
  map.regions.forEach((region, index) => {
    const r = normalizedRect(region);
    const left = Math.max(r.x0, x0);
    const top = Math.max(r.y0, y0);
    const right = Math.min(r.x1, x1);
    const bottom = Math.min(r.y1, y1);
    if (left > right || top > bottom) return;
    const color = REGION_COLORS[index % REGION_COLORS.length].rgb;
    const thickness = tilePixels >= 8 ? 2 : 1;
    canvas.stroke(cellX(left), cellY(top), (right - left + 1) * tilePixels, (bottom - top + 1) * tilePixels, color, thickness);
    const scale = Math.max(MIN_MARK_SCALE, Math.floor(tilePixels / 16));
    canvas.outlinedText(String(index + 1), cellX(left) + thickness + 2, cellY(top) + thickness + 2, scale, color);
  });

  // Footprint outlines, labelled at their top-left.
  for (const outline of options.outlines ?? []) {
    const r = normalizedRect(outline.rect);
    const left = Math.max(r.x0, x0);
    const top = Math.max(r.y0, y0);
    const right = Math.min(r.x1, x1);
    const bottom = Math.min(r.y1, y1);
    if (left > right || top > bottom) continue;
    canvas.stroke(cellX(left), cellY(top), (right - left + 1) * tilePixels, (bottom - top + 1) * tilePixels, OUTLINE, 1);
    canvas.outlinedText(outline.label, cellX(left) + 2, cellY(top) + 2, MIN_MARK_SCALE, OUTLINE);
  }

  // The route.
  const inView = ([x, y]: TilePoint) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const dot = Math.max(2, Math.floor(tilePixels / 4));
  for (const tile of options.route ?? []) {
    if (!inView(tile)) continue;
    const offset = Math.floor((tilePixels - dot) / 2);
    canvas.fill(cellX(tile[0]) + offset, cellY(tile[1]) + offset, dot, dot, ROUTE, 0.85);
  }

  // Anchors and marks: a lettered box on the tile, a dot on a door's entry.
  const letterScale = Math.max(MIN_MARK_SCALE, Math.floor(tilePixels / 10));
  const box = Math.max(tilePixels, 5 * letterScale + 4);
  const letterBox = (at: TilePoint, letter: string, color: Rgb) => {
    const left = cellX(at[0]) + Math.floor((tilePixels - box) / 2);
    const top = cellY(at[1]) + Math.floor((tilePixels - box) / 2);
    canvas.fill(left - 1, top - 1, box + 2, box + 2, SHADOW, 0.8);
    canvas.fill(left, top, box, box, color, 0.95);
    canvas.text(
      letter,
      left + Math.floor((box - textWidth(letter, letterScale)) / 2),
      top + Math.floor((box - 5 * letterScale) / 2),
      letterScale,
      LETTER,
    );
  };
  for (const anchor of map.anchors) {
    const color = ANCHOR_COLORS[anchor.kind];
    if (anchor.entry !== undefined && inView(anchor.entry)) {
      const offset = Math.floor((tilePixels - dot) / 2);
      canvas.fill(cellX(anchor.entry[0]) + offset - 1, cellY(anchor.entry[1]) + offset - 1, dot + 2, dot + 2, SHADOW, 0.8);
      canvas.fill(cellX(anchor.entry[0]) + offset, cellY(anchor.entry[1]) + offset, dot, dot, color);
    }
    if (inView(anchor.at)) letterBox(anchor.at, ANCHOR_LETTERS[anchor.kind], color);
  }
  for (const mark of options.marks ?? []) {
    if (inView(mark.at)) letterBox(mark.at, mark.letter, MARK);
  }

  return {
    image: { width: canvas.width, height: canvas.height, data: canvas.data },
    mode,
    missingImages: [...missing].sort(),
  };
}

/** Images placed left to right on the preview background, `gap` pixels apart, top-aligned. */
export function composeSideBySide(images: readonly RgbaImage[], gap: number): RgbaImage {
  const width = images.reduce((sum, image) => sum + image.width, 0) + gap * Math.max(0, images.length - 1);
  const height = Math.max(0, ...images.map((image) => image.height));
  const canvas = new Canvas(width, height, BACKGROUND);
  let left = 0;
  for (const image of images) {
    for (let y = 0; y < image.height; y += 1) {
      const row = image.data.subarray(y * image.width * 4, (y + 1) * image.width * 4);
      canvas.data.set(row, (y * width + left) * 4);
    }
    left += image.width + gap;
  }
  return { width, height, data: canvas.data };
}

/** Pixel height of the caption strip above each panel of `composeCaptioned`. */
const CAPTION_HEIGHT = 18;

/**
 * Panels stacked top to bottom on the preview background, `gap` pixels
 * apart, each under a caption strip with its label in the bitmap font
 * (letters, digits and `-`; other characters leave a space).
 */
export function composeCaptioned(
  panels: readonly { readonly caption: string; readonly image: RgbaImage }[],
  gap: number,
): RgbaImage {
  const width = Math.max(0, ...panels.map((panel) => Math.max(panel.image.width, textWidth(panel.caption, LABEL_SCALE) + 8)));
  const height =
    panels.reduce((sum, panel) => sum + CAPTION_HEIGHT + panel.image.height, 0) + gap * Math.max(0, panels.length - 1);
  const canvas = new Canvas(width, height, BACKGROUND);
  let top = 0;
  for (const panel of panels) {
    canvas.text(panel.caption, 4, top + Math.floor((CAPTION_HEIGHT - 5 * LABEL_SCALE) / 2), LABEL_SCALE, LABEL);
    top += CAPTION_HEIGHT;
    const { image } = panel;
    for (let y = 0; y < image.height; y += 1) {
      canvas.data.set(image.data.subarray(y * image.width * 4, (y + 1) * image.width * 4), ((top + y) * width) * 4);
    }
    top += image.height + gap;
  }
  return { width, height, data: canvas.data };
}
