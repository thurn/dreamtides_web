// Writes D97 map and stamp preview PNGs (`npm run d97:map -- preview`, and
// the sheet of `stamps extract`), plus a legend text file beside them.
//
// A map preview directory holds:
// - `map.png`: the whole map, downscaled to fit `WHOLE_MAP_MAX_PIXELS`, with
//   region outlines, anchors and the main route;
// - `region-<n>-<name>.png`: each region (or the one `--region` names) at
//   native tile size, capped to `ZOOM_MAX_PIXELS`, with the coordinate grid;
// - `rect-<x>-<y>-<w>-<h>.png` for a `--rect` view;
// - `legend.txt`: the letters, region numbers and colours, and anchors.
//
// `--scale` multiplies the native tile size (32 px for LPC) in every view.
// Stamp placements are outlined and numbered in every view.

import { join } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import type { CompiledDreamMap } from "../../src/d97/map/compiled.ts";
import type { TilePoint, TileRect } from "../../src/d97/map/definition.ts";
import {
  ANCHOR_LETTERS,
  composeCaptioned,
  composeSideBySide,
  REGION_COLORS,
  renderMapPreview,
  type MapPreview,
  type PreviewImageLoader,
} from "../../src/d97/map/preview.ts";
import { sheetPreviewMap } from "../../src/d97/map/sheets.ts";
import { stampPreviewMap, type D97CatalogStamp } from "../../src/d97/map/stamps.ts";
import type { TiledTileset } from "../../src/d97/map/tiled.ts";
import { writePng } from "./png.ts";

const WHOLE_MAP_MAX_PIXELS = 1600;
const ZOOM_MAX_PIXELS = 2400;
/** Pixels between the panels of a stamp preview sheet. */
export const STAMP_SHEET_GAP = 16;

export interface WrittenPreview {
  readonly path: string;
  readonly width: number;
  readonly height: number;
  readonly mode: MapPreview["mode"];
  readonly missingImages: readonly string[];
}

export interface MapPreviewRequest {
  readonly outDir: string;
  readonly images: PreviewImageLoader | null;
  /** Render only this region's zoom (and the whole map). */
  readonly region?: string;
  /** An extra zoomed view. */
  readonly rect?: TileRect;
  /** Multiplies the native tile size in every view. */
  readonly scale?: number;
  /** Traced on the whole-map view. */
  readonly route?: readonly TilePoint[];
  /** Numbered footprints outlined in every view, such as stamp placements; listed in the legend. */
  readonly outlines?: readonly { readonly rect: TileRect; readonly label: string; readonly note: string }[];
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "") || "region";
}

function tilePixelsFor(map: CompiledDreamMap, rect: TileRect, maxPixels: number, scale: number | undefined): number {
  if (scale !== undefined) return Math.max(1, Math.round(map.tileWidth * scale));
  const side = Math.max(Math.abs(rect.to[0] - rect.from[0]) + 1, Math.abs(rect.to[1] - rect.from[1]) + 1);
  return Math.max(1, Math.min(map.tileWidth, Math.floor(maxPixels / side)));
}

function write(path: string, preview: MapPreview): WrittenPreview {
  writePng(path, preview.image);
  return {
    path,
    width: preview.image.width,
    height: preview.image.height,
    mode: preview.mode,
    missingImages: preview.missingImages,
  };
}

function legendText(map: CompiledDreamMap, outlines: MapPreviewRequest["outlines"] = []): string {
  const lines = [
    `Map ${map.id}: ${String(map.width)}×${String(map.height)} tiles`,
    "",
    "Anchor letters (a dot of the same colour marks a door's entry tile):",
    ...Object.entries(ANCHOR_LETTERS).map(([kind, letter]) => `  ${letter} ${kind}`),
    "Yellow dots trace the main route on map.png. In grid views, red-tinted cells are blocked;",
    "in walkability rendering (no library), green is walkable, brown blocked, blue above-player.",
    "",
    "Regions (outline colour, number drawn at the top-left corner):",
    ...map.regions.map((region, index) => {
      const color = REGION_COLORS[index % REGION_COLORS.length].name;
      return `  ${String(index + 1)} ${region.name}: ${region.from.join(",")}–${region.to.join(",")} (${color})`;
    }),
    "",
    ...(outlines.length === 0
      ? []
      : [
          "Stamp placements (white outline, number at the top-left corner):",
          ...outlines.map((outline) => `  ${outline.label} ${outline.note}: ${outline.rect.from.join(",")}–${outline.rect.to.join(",")}`),
          "",
        ]),
    "Anchors:",
    ...map.anchors.map(
      (anchor) =>
        `  ${ANCHOR_LETTERS[anchor.kind]} ${anchor.kind} ${anchor.id} at ${anchor.at.join(",")}` +
        (anchor.entry === undefined ? "" : ` entry ${anchor.entry.join(",")}`),
    ),
    "",
  ];
  return lines.join("\n");
}

/** Render and write a map's previews; returns the images written and the legend path. */
export function writeMapPreviews(
  map: CompiledDreamMap,
  request: MapPreviewRequest,
): { readonly images: readonly WrittenPreview[]; readonly legend: string } {
  mkdirSync(request.outDir, { recursive: true });
  const images: WrittenPreview[] = [];
  const whole: TileRect = { from: [0, 0], to: [map.width - 1, map.height - 1] };
  images.push(
    write(
      join(request.outDir, "map.png"),
      renderMapPreview(map, {
        rect: whole,
        tilePixels: tilePixelsFor(map, whole, WHOLE_MAP_MAX_PIXELS, request.scale),
        grid: false,
        images: request.images,
        ...(request.route === undefined ? {} : { route: request.route }),
        ...(request.outlines === undefined ? {} : { outlines: request.outlines }),
      }),
    ),
  );
  const zooms: { readonly file: string; readonly rect: TileRect }[] = [];
  map.regions.forEach((region, index) => {
    if (request.region !== undefined && region.name !== request.region) return;
    zooms.push({ file: `region-${String(index + 1)}-${slugify(region.name)}.png`, rect: region });
  });
  if (request.region !== undefined && zooms.length === 0) {
    throw new Error(`the map has no region named ${request.region}`);
  }
  if (request.rect !== undefined) {
    const { from, to } = request.rect;
    zooms.push({
      file: `rect-${String(from[0])}-${String(from[1])}-${String(to[0] - from[0] + 1)}-${String(to[1] - from[1] + 1)}.png`,
      rect: request.rect,
    });
  }
  for (const zoom of zooms) {
    images.push(
      write(
        join(request.outDir, zoom.file),
        renderMapPreview(map, {
          rect: zoom.rect,
          tilePixels: tilePixelsFor(map, zoom.rect, ZOOM_MAX_PIXELS, request.scale),
          grid: true,
          images: request.images,
          ...(request.route === undefined ? {} : { route: request.route }),
          ...(request.outlines === undefined ? {} : { outlines: request.outlines }),
        }),
      ),
    );
  }
  const legend = join(request.outDir, "legend.txt");
  writeFileSync(legend, legendText(map, request.outlines));
  return { images, legend };
}

/**
 * Write a stamp's preview sheet: its tiles on the coordinate grid with blocked
 * cells tinted, beside its walkability and above-player masks.
 */
export function writeStampSheet(
  stamp: D97CatalogStamp,
  path: string,
  images: PreviewImageLoader | null,
): WrittenPreview {
  const panel = stampPanel(stamp, images);
  writePng(path, panel.image);
  return { path, width: panel.image.width, height: panel.image.height, mode: panel.mode, missingImages: panel.missingImages };
}

/** The letter a stamp point is marked with: its name's first letter. */
function pointLetter(name: string): string {
  return (name.match(/[a-z0-9]/iu)?.[0] ?? "P").toUpperCase();
}

function stampPanel(stamp: D97CatalogStamp, images: PreviewImageLoader | null): MapPreview {
  const shaped = stampPreviewMap(stamp);
  const rect: TileRect = { from: [0, 0], to: [stamp.width - 1, stamp.height - 1] };
  const tilePixels = Math.max(8, shaped.tileWidth);
  const marks = Object.entries(stamp.points ?? {}).map(([name, at]) => ({ at, letter: pointLetter(name) }));
  const tiles = renderMapPreview(shaped, { rect, tilePixels, grid: true, images, marks });
  const masks = renderMapPreview(shaped, { rect, tilePixels, grid: true, images: null, marks });
  return { ...tiles, image: composeSideBySide([tiles.image, masks.image], STAMP_SHEET_GAP) };
}

/**
 * Write one theme's stamps as a preview sheet (each stamp's tiles beside its
 * walkability and above-player masks, under a caption with its number, name
 * and footprint) and a text legend naming each stamp's id and points.
 */
export function writeThemeSheet(
  stamps: readonly D97CatalogStamp[],
  path: string,
  legendPath: string,
  images: PreviewImageLoader | null,
): WrittenPreview {
  const panels = stamps.map((stamp) => stampPanel(stamp, images));
  const sheet = composeCaptioned(
    stamps.map((stamp, index) => ({
      caption: `${String(index + 1)} ${stamp.name} ${String(stamp.width)}x${String(stamp.height)}`,
      image: panels[index].image,
    })),
    STAMP_SHEET_GAP,
  );
  writePng(path, sheet);
  const legend = [
    "Left: tiles over the grid, blocked cells tinted red. Right: walkability (green open, brown blocked,",
    "blue above the player). Blue lettered boxes mark named points.",
    "",
    ...stamps.map((stamp, index) => {
      const points = Object.entries(stamp.points ?? {})
        .map(([name, [x, y]]) => `${pointLetter(name)} ${name} ${String(x)},${String(y)}`)
        .join("; ");
      return `${String(index + 1)} ${stamp.name} ${stamp.id} ${String(stamp.width)}×${String(stamp.height)}${points === "" ? "" : `: ${points}`}`;
    }),
    "",
  ];
  writeFileSync(legendPath, legend.join("\n"));
  const missing = [...new Set(panels.flatMap((panel) => panel.missingImages))].sort();
  return {
    path,
    width: sheet.width,
    height: sheet.height,
    mode: panels.some((panel) => panel.mode === "tiles") ? "tiles" : "walkability",
    missingImages: missing,
  };
}

/**
 * Write a library sheet on its tile grid (`sheet <image>`), so stamp
 * rectangles for `stamps cut` can be read off it. `rect` limits the view.
 */
export function writeSheetGrid(
  tileset: TiledTileset,
  path: string,
  images: PreviewImageLoader | null,
  options: { readonly rect?: TileRect; readonly scale?: number } = {},
): WrittenPreview {
  const map = sheetPreviewMap(tileset);
  const rect = options.rect ?? { from: [0, 0], to: [map.width - 1, map.height - 1] };
  const tilePixels = Math.max(8, Math.round(tileset.tileWidth * (options.scale ?? 1)));
  const preview = renderMapPreview(map, { rect, tilePixels, grid: true, images });
  return write(path, preview);
}
