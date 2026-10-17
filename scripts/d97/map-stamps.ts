// `npm run d97:map -- stamps ...`: the stamp catalog listing, the per-theme
// preview sheets, extraction from a compiled map, and cutting from a library
// sheet image. Extraction and cutting write a new stamp module and its
// preview sheet.

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { TileRect } from "../../src/d97/map/definition.ts";
import { cutSheetStamp, sheetTileset } from "../../src/d97/map/sheets.ts";
import {
  D97_STAMP_THEMES,
  extractStamp,
  stampAbovePlayerMask,
  stampModuleSource,
  type D97CatalogStamp,
  type D97StampTheme,
} from "../../src/d97/map/stamps.ts";
import { parseD97StampId } from "../../src/types/identifiers.ts";
import type { LoadedMap } from "./map-load.ts";
import { writeStampSheet, writeThemeSheet, type WrittenPreview } from "./map-preview.ts";
import { libraryImageLoader, readPng } from "./png.ts";

/** The alpha at or below which a sheet pixel counts as empty when cutting (faint edge haze). */
const EMPTY_ALPHA = 8;

const count = (mask: string, flag: string) => [...mask].filter((cell) => cell === flag).length;

function originText(stamp: D97CatalogStamp): string {
  const { rect } = stamp.extractedFrom;
  const where = "sheet" in stamp.extractedFrom ? `sheet ${stamp.extractedFrom.sheet}` : stamp.extractedFrom.map;
  return `${where} ${rect.from.join(",")}–${rect.to.join(",")}`;
}

/** The `stamps list` report, optionally one theme's stamps. */
export function stampListReport(stamps: readonly D97CatalogStamp[], theme?: D97StampTheme): string {
  const shown = stamps.filter((stamp) => theme === undefined || stamp.theme === theme);
  if (shown.length === 0) {
    return theme === undefined
      ? "The stamp catalog (src/content/d97/stamps/) is empty.\n"
      : `The stamp catalog has no ${theme} stamps.\n`;
  }
  const lines = [`Stamps (${String(shown.length)})`];
  for (const group of D97_STAMP_THEMES) {
    const members = shown.filter((stamp) => stamp.theme === group);
    if (members.length === 0) continue;
    lines.push(`${group} (${String(members.length)})`);
    for (const stamp of members) {
      const walkability = stamp.walkability ?? "";
      const points = Object.entries(stamp.points ?? {})
        .map(([name, [x, y]]) => `${name}@${String(x)},${String(y)}`)
        .join(" ");
      lines.push(
        `  ${stamp.id}  ${stamp.name}  ${String(stamp.width)}×${String(stamp.height)}  ` +
          `layers ${String(stamp.layers.length)}  blocked ${String(count(walkability, "1"))}  ` +
          `above ${String(count(stampAbovePlayerMask(stamp), "1"))}  points ${points || "none"}  ` +
          `from ${originText(stamp)}`,
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

interface StampWriteTarget {
  /** Directory the stamp module is written to. */
  readonly moduleDir: string;
  /** Directory the preview sheet is written to. */
  readonly previewDir: string;
}

export interface StampExtractRequest extends StampWriteTarget {
  readonly loaded: LoadedMap;
  readonly rect: TileRect;
  readonly name: string;
  readonly theme: D97StampTheme;
  /** Keep only these layers. */
  readonly layers?: readonly string[];
  /** Mark these layers as drawn above the player. */
  readonly above?: readonly string[];
}

export interface StampWriteResult {
  readonly stamp: D97CatalogStamp;
  readonly modulePath: string;
  readonly sheet: WrittenPreview;
}

export interface StampExtractResult extends StampWriteResult {
  readonly omittedObjects: number;
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "") || "stamp";
}

function writeStampFiles(stamp: D97CatalogStamp, target: StampWriteTarget, library: string): StampWriteResult {
  const base = `${slugify(stamp.name)}-${stamp.id.slice(0, 8)}`;
  mkdirSync(target.moduleDir, { recursive: true });
  const modulePath = join(target.moduleDir, `${base}.ts`);
  if (existsSync(modulePath)) throw new Error(`${modulePath} already exists`);
  writeFileSync(modulePath, stampModuleSource(stamp));
  const sheet = writeStampSheet(stamp, join(target.previewDir, `${base}.png`), libraryImageLoader(library));
  return { stamp, modulePath, sheet };
}

/** Extract a stamp from a loaded map, writing its module and preview sheet. */
export function extractStampFiles(request: StampExtractRequest): StampExtractResult {
  const id = parseD97StampId(randomUUID());
  const { stamp, omittedObjects } = extractStamp(request.loaded.map, request.rect, {
    id,
    name: request.name,
    theme: request.theme,
    origin: request.loaded.argument,
  }, {
    ...(request.layers === undefined ? {} : { layers: request.layers }),
    ...(request.above === undefined ? {} : { above: request.above }),
  });
  return { ...writeStampFiles(stamp, request, request.loaded.library), omittedObjects };
}

export interface StampCutRequest extends StampWriteTarget {
  readonly library: string;
  /** Library-relative sheet image. */
  readonly image: string;
  readonly tileSize: number;
  /** The cut, in sheet tile coordinates. */
  readonly rect: TileRect;
  readonly name: string;
  readonly theme: D97StampTheme;
  readonly layer: string;
  readonly aboveRows: number;
  /** Shrink the rectangle to the tiles that hold pixels. */
  readonly trim: boolean;
}

/** Cut a stamp out of a library sheet image, writing its module and preview sheet. */
export function cutStampFiles(request: StampCutRequest): StampWriteResult {
  const file = join(request.library, request.image);
  if (!existsSync(file)) throw new Error(`no sheet at ${file}`);
  const png = readPng(file);
  const tileset = sheetTileset({ path: request.image, width: png.width, height: png.height }, request.tileSize);
  const isEmpty = (local: number) => {
    const column = local % tileset.columns;
    const row = Math.floor(local / tileset.columns);
    for (let y = row * request.tileSize; y < (row + 1) * request.tileSize; y += 1) {
      for (let x = column * request.tileSize; x < (column + 1) * request.tileSize; x += 1) {
        if (png.data[(y * png.width + x) * 4 + 3] > EMPTY_ALPHA) return false;
      }
    }
    return true;
  };
  const stamp = cutSheetStamp(
    tileset,
    request.rect,
    {
      id: parseD97StampId(randomUUID()),
      name: request.name,
      theme: request.theme,
      layer: request.layer,
      aboveRows: request.aboveRows,
      trim: request.trim,
    },
    isEmpty,
  );
  return writeStampFiles(stamp, request, request.library);
}

/**
 * Write one preview sheet per theme (or only `theme`) to `previewDir`:
 * `<theme>.png` stacks each stamp's tiles and masks under its name, and
 * `<theme>.txt` lists them with their point letters.
 */
export function writeThemeSheets(
  stamps: readonly D97CatalogStamp[],
  previewDir: string,
  library: string,
  theme?: D97StampTheme,
): WrittenPreview[] {
  const images = libraryImageLoader(library);
  const written: WrittenPreview[] = [];
  for (const group of D97_STAMP_THEMES) {
    if (theme !== undefined && group !== theme) continue;
    const members = stamps.filter((stamp) => stamp.theme === group);
    if (members.length === 0) continue;
    written.push(writeThemeSheet(members, join(previewDir, `${group}.png`), join(previewDir, `${group}.txt`), images));
  }
  return written;
}

/** The import line that adds a new stamp module to the catalog index. */
export function catalogImportLine(modulePath: string, indexDir: string): string {
  const specifier = `./${relative(indexDir, modulePath).replace(/\.ts$/u, "")}`;
  const binding = specifier
    .split("/")
    .at(-1)
    ?.replace(/-([a-z0-9])/gu, (_, char: string) => char.toUpperCase())
    .replace(/^[^a-z]+/u, "");
  return `import ${binding ?? "stamp"} from "${specifier}";`;
}
