// `npm run d97:map -- stamps ...`: the stamp catalog listing and stamp
// extraction, which writes a new stamp module and its preview sheet.

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { TileRect } from "../../src/d97/map/definition.ts";
import { extractStamp, stampAbovePlayerMask, stampModuleSource, type D97CatalogStamp } from "../../src/d97/map/stamps.ts";
import { parseD97StampId } from "../../src/types/identifiers.ts";
import type { LoadedMap } from "./map-load.ts";
import { writeStampSheet, type WrittenPreview } from "./map-preview.ts";
import { libraryImageLoader } from "./png.ts";

const count = (mask: string, flag: string) => [...mask].filter((cell) => cell === flag).length;

/** The `stamps list` report. */
export function stampListReport(stamps: readonly D97CatalogStamp[]): string {
  if (stamps.length === 0) return "The stamp catalog (src/content/d97/stamps/) is empty.\n";
  const lines = [`Stamps (${String(stamps.length)})`];
  for (const stamp of stamps) {
    const walkability = stamp.walkability ?? "";
    const points = Object.entries(stamp.points ?? {})
      .map(([name, [x, y]]) => `${name}@${String(x)},${String(y)}`)
      .join(" ");
    const { rect } = stamp.extractedFrom;
    lines.push(
      `  ${stamp.id}  ${stamp.name}  ${String(stamp.width)}×${String(stamp.height)}  ` +
        `layers ${String(stamp.layers.length)}  blocked ${String(count(walkability, "1"))}  ` +
        `above ${String(count(stampAbovePlayerMask(stamp), "1"))}  points ${points || "none"}  ` +
        `from ${stamp.extractedFrom.map} ${rect.from.join(",")}–${rect.to.join(",")}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

export interface StampExtractRequest {
  readonly loaded: LoadedMap;
  readonly rect: TileRect;
  readonly name: string;
  /** Directory the stamp module is written to. */
  readonly moduleDir: string;
  /** Directory the preview sheet is written to. */
  readonly previewDir: string;
}

export interface StampExtractResult {
  readonly stamp: D97CatalogStamp;
  readonly modulePath: string;
  readonly sheet: WrittenPreview;
  readonly omittedObjects: number;
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "") || "stamp";
}

/** Extract a stamp from a loaded map, writing its module and preview sheet. */
export function extractStampFiles(request: StampExtractRequest): StampExtractResult {
  const id = parseD97StampId(randomUUID());
  const { stamp, omittedObjects } = extractStamp(request.loaded.map, request.rect, {
    id,
    name: request.name,
    origin: request.loaded.argument,
  });
  const base = `${slugify(request.name)}-${id.slice(0, 8)}`;
  mkdirSync(request.moduleDir, { recursive: true });
  const modulePath = join(request.moduleDir, `${base}.ts`);
  if (existsSync(modulePath)) throw new Error(`${modulePath} already exists`);
  writeFileSync(modulePath, stampModuleSource(stamp));
  const sheet = writeStampSheet(stamp, join(request.previewDir, `${base}.png`), libraryImageLoader(request.loaded.library));
  return { stamp, modulePath, sheet, omittedObjects };
}

/** The import line that adds an extracted stamp module to the catalog index. */
export function catalogImportLine(modulePath: string, indexDir: string): string {
  const specifier = `./${relative(indexDir, modulePath).replace(/\.ts$/u, "")}`;
  const binding = specifier
    .split("/")
    .at(-1)
    ?.replace(/-([a-z0-9])/gu, (_, char: string) => char.toUpperCase())
    .replace(/^[^a-z]+/u, "");
  return `import ${binding ?? "stamp"} from "${specifier}";`;
}
