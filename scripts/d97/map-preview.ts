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

import { join } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import type { CompiledDreamMap } from "../../src/d97/map/compiled.ts";
import type { TilePoint, TileRect } from "../../src/d97/map/definition.ts";
import {
  ANCHOR_LETTERS,
  composeSideBySide,
  REGION_COLORS,
  renderMapPreview,
  type MapPreview,
  type PreviewImageLoader,
} from "../../src/d97/map/preview.ts";
import { stampPreviewMap, type D97CatalogStamp } from "../../src/d97/map/stamps.ts";
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

function legendText(map: CompiledDreamMap): string {
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
        }),
      ),
    );
  }
  const legend = join(request.outDir, "legend.txt");
  writeFileSync(legend, legendText(map));
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
  const shaped = stampPreviewMap(stamp);
  const rect: TileRect = { from: [0, 0], to: [stamp.width - 1, stamp.height - 1] };
  const tilePixels = Math.max(8, shaped.tileWidth);
  const tiles = renderMapPreview(shaped, { rect, tilePixels, grid: true, images });
  const masks = renderMapPreview(shaped, { rect, tilePixels, grid: true, images: null });
  const sheet = composeSideBySide([tiles.image, masks.image], STAMP_SHEET_GAP);
  writePng(path, sheet);
  return { path, width: sheet.width, height: sheet.height, mode: tiles.mode, missingImages: tiles.missingImages };
}
