// The D97 map inspector (decision P12): `npm run d97:map -- <command>`.
//
//   inspect <map>                        stamp placements, terrain edits and
//                                        tilesets, region walkability and
//                                        reachability, landmarks, anchors,
//                                        the town, reach times from it and
//                                        narrow passages, crossing times
//   preview <map> [--region <name>] [--rect x,y,w,h] [--scale <factor>] [--out <dir>]
//                                        PNG previews with a walkability
//                                        overlay, and a legend
//   validate <map> | --all               validator findings; exits 1 on errors
//   stamps list [--theme <t>]            the stamp catalog
//   stamps sheet [--theme <t>]           one preview sheet per theme
//   stamps extract --from <map> --rect x,y,w,h --name <name> --theme <t>
//         [--layers a,b] [--above a,b] [--out <dir>]
//                                        a stamp module cut from a map
//   stamps cut --sheet <image> --rect x,y,w,h --name <name> --theme <t>
//         [--layer <name>] [--above <rows>] [--tile <px>] [--no-trim] [--out <dir>]
//                                        a stamp module cut from a library sheet
//   sheet <image> [--rect x,y,w,h] [--scale <factor>] [--tile <px>] [--out <file>]
//                                        a library sheet on its tile grid
//   terrains                             the terrain catalog
//   compose --out <file> --size <w>x<h> --theme <t>
//                                        a blank-canvas map module scaffold
//
// `<map>` is a catalog map id, a map module path or a Tiled map path (see
// map-load.ts). A map's town comes from the dream that plays it
// (map-town.ts). Previews go to the gitignored `artifacts/d97/previews/`.

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { parseDreamAnchorId, parseDreamMapId } from "../../src/types/identifiers.ts";
import { composeMapSource } from "./map-compose.ts";
import { sheetTileset } from "../../src/d97/map/sheets.ts";
import { D97_DIALOGUE_CONTENT } from "../../src/content/d97/dialogue/index.ts";
import { D97_DREAMS } from "../../src/content/d97/dreams/index.ts";
import { D97_MAP_TUNING } from "../../src/content/d97/map-tuning.ts";
import { D97_DREAM_MAPS, D97_EXAMPLE_MAPS } from "../../src/content/d97/maps/index.ts";
import { D97_TERRAINS } from "../../src/content/d97/terrains/index.ts";
import { D97_MAP_THEMES } from "../../src/content/d97/terrains/themes.ts";
import { recipePlacements } from "../../src/d97/map/recipe-summary.ts";
import { D97_STAMPS } from "../../src/content/d97/stamps/index.ts";
import type { TileRect } from "../../src/d97/map/definition.ts";
import { D97_STAMP_THEMES, isD97StampTheme, type D97StampTheme } from "../../src/d97/map/stamps.ts";
import { narrowCells, townLayout, widthExemptCells, type DreamMapTown } from "../../src/d97/map/layout.ts";
import type { TilePoint } from "../../src/d97/map/definition.ts";
import { isRoomMap } from "../../src/d97/map/routes.ts";
import { validateDreamMap } from "../../src/d97/map/validate.ts";
import { d97LibraryDir, REPO_ROOT, servedArtPrefixes } from "./map-library.ts";
import { loadMap, type LoadedMap } from "./map-load.ts";
import { catalogMapTown } from "./map-town.ts";
import { writeMapPreviews, writeSheetGrid } from "./map-preview.ts";
import { formatFinding, inspectReport } from "./map-report.ts";
import {
  catalogImportLine,
  cutStampFiles,
  extractStampFiles,
  stampListReport,
  writeThemeSheets,
  type StampWriteResult,
} from "./map-stamps.ts";
import { libraryImageLoader, readPng } from "./png.ts";

const PREVIEW_ROOT = join(REPO_ROOT, "artifacts", "d97", "previews");
const STAMP_DIR = join(REPO_ROOT, "src", "content", "d97", "stamps");

const USAGE = `Usage: npm run d97:map -- <command>
  inspect <map>
  preview <map> [--region <name>] [--rect x,y,w,h] [--scale <factor>] [--out <dir>]
  validate <map> | --all
  stamps list [--theme <theme>]
  stamps sheet [--theme <theme>]
  stamps extract --from <map> --rect x,y,w,h --name <name> --theme <theme> [--layers a,b] [--above a,b] [--out <dir>]
  stamps cut --sheet <image> --rect x,y,w,h --name <name> --theme <theme> [--layer <name>] [--above <rows>] [--tile <px>] [--no-trim] [--out <dir>]
  sheet <image> [--rect x,y,w,h] [--scale <factor>] [--tile <px>] [--out <file>]
  terrains
  compose --out <file> --size <w>x<h> --theme <theme>
Themes: ${D97_STAMP_THEMES.join(", ")}.
<map> is a catalog map id, a map module path (.ts) or a Tiled map path (.tmx/.tmj,
relative to the LPC library or absolute).`;

class UsageError extends Error {}

interface Parsed {
  readonly positional: readonly string[];
  readonly options: ReadonlyMap<string, string | true>;
}

function parseArgs(argv: readonly string[]): Parsed {
  const positional: string[] = [];
  const options = new Map<string, string | true>();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const name = arg.slice(2);
    const next = argv[index + 1] as string | undefined;
    if (next === undefined || next.startsWith("--")) options.set(name, true);
    else {
      options.set(name, next);
      index += 1;
    }
  }
  return { positional, options };
}

function option(parsed: Parsed, name: string): string | undefined {
  const value = parsed.options.get(name);
  if (value === true) throw new UsageError(`--${name} needs a value`);
  return value;
}

/** `x,y,w,h` as a rectangle. */
function parseRect(text: string): TileRect {
  const parts = text.split(",").map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part)) || parts[2] < 1 || parts[3] < 1) {
    throw new UsageError(`--rect wants x,y,w,h with whole numbers and a positive size, not ${text}`);
  }
  const [x, y, w, h] = parts;
  return { from: [x, y], to: [x + w - 1, y + h - 1] };
}

async function load(argument: string | undefined): Promise<LoadedMap | null> {
  if (argument === undefined) throw new UsageError("name a map");
  const result = await loadMap(argument);
  if (result.ok) return result.loaded;
  console.error(`${argument}: cannot load`);
  for (const error of result.errors) console.error(`  ${error}`);
  return null;
}

const display = (path: string) => relative(process.cwd(), path) || path;

/** The loaded map's town from the dream that plays it (see `catalogMapTown`). */
function mapTown(loaded: LoadedMap): DreamMapTown | null | undefined {
  return catalogMapTown(loaded.definition.id, {
    dreams: D97_DREAMS,
    maps: [...D97_DREAM_MAPS, ...D97_EXAMPLE_MAPS],
    quests: D97_DIALOGUE_CONTENT.quests,
  });
}

async function inspect(parsed: Parsed): Promise<number> {
  const loaded = await load(parsed.positional[1]);
  if (loaded === null) return 1;
  process.stdout.write(
    inspectReport(loaded, D97_MAP_TUNING, {
      stamps: new Map(D97_STAMPS.map((stamp) => [stamp.id, stamp])),
      terrains: new Map(D97_TERRAINS.map((terrain) => [terrain.id, terrain])),
      served: servedArtPrefixes(),
      town: mapTown(loaded),
    }),
  );
  return 0;
}

async function preview(parsed: Parsed): Promise<number> {
  const loaded = await load(parsed.positional[1]);
  if (loaded === null) return 1;
  const scaleText = option(parsed, "scale");
  const scale = scaleText === undefined ? undefined : Number(scaleText);
  if (scale !== undefined && !(scale > 0)) throw new UsageError(`--scale wants a positive factor, not ${String(scaleText)}`);
  const rectText = option(parsed, "rect");
  const region = option(parsed, "region");
  const outDir = option(parsed, "out") ?? join(PREVIEW_ROOT, loaded.slug);
  const town = mapTown(loaded);
  const crossings = loaded.definition.narrowCrossings ?? [];
  const layout = town === undefined || town === null ? null : townLayout(loaded.map, D97_MAP_TUNING, town, crossings);
  const route = layout?.routes.filter((entry) => entry.main).flatMap((entry) => entry.path);
  const narrowMask = narrowCells(loaded.map, D97_MAP_TUNING.minPathWidthTiles, widthExemptCells(loaded.map, crossings));
  const narrow: TilePoint[] = [];
  narrowMask.forEach((cell, index) => {
    if (cell === 1) narrow.push([index % loaded.map.width, Math.floor(index / loaded.map.width)]);
  });
  const overlay = { narrow, flagged: layout?.routes.flatMap((entry) => entry.narrowCells) ?? [] };
  const images = libraryImageLoader(loaded.library);
  const catalog = new Map(D97_STAMPS.map((stamp) => [stamp.id, stamp]));
  const outlines = recipePlacements(loaded.definition, catalog)
    .flatMap((entry) => (entry.kind === "stamp" && entry.rect !== null ? [{ entry, rect: entry.rect }] : []))
    .map(({ entry, rect }, number) => ({ rect, label: String(number + 1), note: catalog.get(entry.stamp)?.name ?? entry.stamp }));
  const written = writeMapPreviews(loaded.map, {
    outlines,
    outDir,
    images,
    ...(region === undefined ? {} : { region }),
    ...(rectText === undefined ? {} : { rect: parseRect(rectText) }),
    ...(scale === undefined ? {} : { scale }),
    ...(route === undefined ? {} : { route }),
    overlay,
  });
  for (const image of written.images) {
    console.log(`${display(image.path)}  ${String(image.width)}×${String(image.height)} px  (${image.mode})`);
  }
  console.log(`${display(written.legend)}  legend`);
  const missing = [...new Set(written.images.flatMap((image) => image.missingImages))];
  if (images === null) console.log(`No LPC library at ${loaded.library}: drew walkability colours.`);
  else if (missing.length > 0) console.log(`Missing tileset images: ${missing.join(", ")}`);
  return 0;
}

async function validate(parsed: Parsed): Promise<number> {
  const targets = parsed.options.has("all")
    ? [...D97_DREAM_MAPS, ...D97_EXAMPLE_MAPS].map((definition) => definition.id)
    : [parsed.positional[1]];
  if (targets.length === 0) {
    console.log("The map catalog (src/content/d97/maps/) is empty.");
    return 0;
  }
  let errors = 0;
  for (const target of targets) {
    const loaded = await load(target);
    if (loaded === null) {
      errors += 1;
      continue;
    }
    const town = mapTown(loaded);
    const size = D97_DREAMS.find((dream) => dream.mapId === loaded.definition.id)?.size;
    const findings = validateDreamMap(loaded.map, D97_MAP_TUNING, {
      served: servedArtPrefixes(),
      ...(town === undefined ? {} : { town }),
      narrowCrossings: loaded.definition.narrowCrossings ?? [],
      ...(size === undefined ? {} : { size }),
    });
    const errorCount = findings.filter((finding) => finding.severity === "error").length;
    errors += errorCount;
    console.log(`${loaded.argument}: ${String(errorCount)} errors, ${String(findings.length - errorCount)} warnings`);
    if (town === undefined) {
      console.log(
        `  ${isRoomMap(loaded.map) ? "a room" : "no dream plays this map"}: no town, so the town, path-width, detour and reach rules do not run`,
      );
    }
    for (const finding of findings) console.log(`  ${formatFinding(finding)}`);
  }
  return errors > 0 ? 1 : 0;
}

function themeOption(parsed: Parsed, required: boolean): D97StampTheme | undefined {
  const theme = option(parsed, "theme");
  if (theme === undefined) {
    if (required) throw new UsageError(`--theme is required: one of ${D97_STAMP_THEMES.join(", ")}`);
    return undefined;
  }
  if (!isD97StampTheme(theme)) throw new UsageError(`--theme wants one of ${D97_STAMP_THEMES.join(", ")}, not ${theme}`);
  return theme;
}

function integerOption(parsed: Parsed, name: string, fallback: number, minimum: number): number {
  const text = option(parsed, name);
  if (text === undefined) return fallback;
  const value = Number(text);
  if (!Number.isInteger(value) || value < minimum) throw new UsageError(`--${name} wants a whole number of at least ${String(minimum)}, not ${text}`);
  return value;
}

function reportWrittenStamp(result: StampWriteResult, moduleDir: string): void {
  const { stamp } = result;
  console.log(`Stamp ${stamp.id} (${stamp.name}, ${stamp.theme}), ${String(stamp.width)}×${String(stamp.height)} tiles`);
  console.log(`${display(result.modulePath)}  module`);
  console.log(`${display(result.sheet.path)}  ${String(result.sheet.width)}×${String(result.sheet.height)} px  (${result.sheet.mode})`);
  if (moduleDir === STAMP_DIR) {
    console.log(`Add it to src/content/d97/stamps/index.ts:\n  ${catalogImportLine(result.modulePath, STAMP_DIR)}`);
  } else {
    console.log("Move it into src/content/d97/stamps/ and list it in that directory's index.ts to add it to the catalog.");
  }
}

async function stamps(parsed: Parsed): Promise<number> {
  const action = parsed.positional[1];
  const previewDir = join(PREVIEW_ROOT, "stamps");
  if (action === "list") {
    process.stdout.write(stampListReport(D97_STAMPS, themeOption(parsed, false)));
    return 0;
  }
  if (action === "sheet") {
    const written = writeThemeSheets(D97_STAMPS, previewDir, d97LibraryDir(), themeOption(parsed, false));
    if (written.length === 0) console.log("No stamps to draw.");
    for (const sheet of written) {
      console.log(`${display(sheet.path)}  ${String(sheet.width)}×${String(sheet.height)} px  (${sheet.mode})`);
      if (sheet.missingImages.length > 0) console.log(`  Missing tileset images: ${sheet.missingImages.join(", ")}`);
    }
    return 0;
  }
  if (action === "cut") {
    const image = option(parsed, "sheet");
    const rectText = option(parsed, "rect");
    const name = option(parsed, "name");
    if (image === undefined || rectText === undefined || name === undefined) {
      throw new UsageError("stamps cut needs --sheet, --rect, --name and --theme");
    }
    const moduleDir = option(parsed, "out") ?? STAMP_DIR;
    reportWrittenStamp(
      cutStampFiles({
        library: d97LibraryDir(),
        image,
        tileSize: integerOption(parsed, "tile", 32, 1),
        rect: parseRect(rectText),
        name,
        theme: themeOption(parsed, true)!,
        layer: option(parsed, "layer") ?? "Objects",
        aboveRows: integerOption(parsed, "above", 0, 0),
        trim: !parsed.options.has("no-trim"),
        moduleDir,
        previewDir,
      }),
      moduleDir,
    );
    return 0;
  }
  if (action !== "extract") throw new UsageError("stamps wants list, sheet, extract or cut");
  const from = option(parsed, "from");
  const rectText = option(parsed, "rect");
  const name = option(parsed, "name");
  if (from === undefined || rectText === undefined || name === undefined) {
    throw new UsageError("stamps extract needs --from, --rect, --name and --theme");
  }
  const theme = themeOption(parsed, true)!;
  const loaded = await load(from);
  if (loaded === null) return 1;
  const moduleDir = option(parsed, "out") ?? STAMP_DIR;
  const list = (name: string) => option(parsed, name)?.split(",").map((entry) => entry.trim()).filter((entry) => entry !== "");
  const layers = list("layers");
  const above = list("above");
  const result = extractStampFiles({
    loaded,
    rect: parseRect(rectText),
    name,
    theme,
    moduleDir,
    previewDir,
    ...(layers === undefined ? {} : { layers }),
    ...(above === undefined ? {} : { above }),
  });
  reportWrittenStamp(result, moduleDir);
  if (result.omittedObjects > 0) {
    console.log(`Omitted ${String(result.omittedObjects)} tile objects inside the rectangle (stamps carry tile layers only).`);
  }
  return 0;
}

function sheet(parsed: Parsed): number {
  const image = parsed.positional[1];
  if (image === undefined) throw new UsageError("sheet needs a library image path");
  const library = d97LibraryDir();
  const file = join(library, image);
  if (!existsSync(file)) {
    console.error(`no image at ${file}`);
    return 1;
  }
  const png = readPng(file);
  const tileText = option(parsed, "tile");
  const tileSize = tileText === undefined ? 32 : Number(tileText);
  if (!Number.isInteger(tileSize) || tileSize < 1) throw new UsageError(`--tile wants a whole tile size, not ${String(tileText)}`);
  const scaleText = option(parsed, "scale");
  const scale = scaleText === undefined ? undefined : Number(scaleText);
  if (scale !== undefined && !(scale > 0)) throw new UsageError(`--scale wants a positive factor, not ${String(scaleText)}`);
  const rectText = option(parsed, "rect");
  const tileset = sheetTileset({ path: image, width: png.width, height: png.height }, tileSize);
  const out = option(parsed, "out") ?? join(PREVIEW_ROOT, "sheets", `${image.replace(/[^A-Za-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "")}.png`);
  const written = writeSheetGrid(tileset, out, libraryImageLoader(library), {
    ...(rectText === undefined ? {} : { rect: parseRect(rectText) }),
    ...(scale === undefined ? {} : { scale }),
  });
  console.log(`${image}: ${String(tileset.columns)}×${String(tileset.tileCount / tileset.columns)} tiles of ${String(tileSize)} px`);
  console.log(`${display(written.path)}  ${String(written.width)}×${String(written.height)} px`);
  return 0;
}

function terrains(): number {
  const rows = D97_TERRAINS.map((terrain) =>
    [terrain.id, terrain.name, terrain.family, terrain.layer, terrain.blocksMovement ? "blocks" : "open", terrain.tileset.image?.path ?? "-"].join("  "),
  );
  console.log(`Terrains (${String(D97_TERRAINS.length)}): id, name, family, default layer, walkability, sheet`);
  for (const row of rows) console.log(`  ${row}`);
  return 0;
}

function compose(parsed: Parsed): number {
  const out = option(parsed, "out");
  const size = option(parsed, "size");
  if (out === undefined || size === undefined) throw new UsageError("compose needs --out, --size and --theme");
  const match = /^(\d+)x(\d+)$/u.exec(size);
  if (match === null) throw new UsageError(`--size wants <width>x<height>, not ${size}`);
  const themeName = themeOption(parsed, true)!;
  const theme = D97_MAP_THEMES.find((entry) => entry.theme === themeName);
  if (theme === undefined) throw new UsageError(`no map theme for ${themeName}`);
  const path = resolve(process.cwd(), out);
  if (existsSync(path)) throw new Error(`${path} already exists`);
  const specifier = (target: string) => {
    const text = relative(dirname(path), join(REPO_ROOT, target)).split(sep).join("/");
    return text.startsWith(".") ? text : `./${text}`;
  };
  const terrainNames = new Map(D97_TERRAINS.map((terrain) => [terrain.id, terrain.name]));
  const source = composeMapSource({
    id: parseDreamMapId(randomUUID()),
    anchors: {
      westDoor: parseDreamAnchorId(randomUUID()),
      eastDoor: parseDreamAnchorId(randomUUID()),
      waypoint: parseDreamAnchorId(randomUUID()),
    },
    width: Number(match[1]),
    height: Number(match[2]),
    theme,
    stamps: D97_STAMPS.filter((stamp) => stamp.theme === themeName),
    terrainName: (id) => terrainNames.get(id) ?? id,
    imports: { definition: specifier("src/d97/map/definition"), identifiers: specifier("src/types/identifiers") },
  });
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, source);
  console.log(`${display(path)}  ${themeName} scaffold, ${size} tiles`);
  console.log(`Next: npm run d97:map -- validate ${display(path)} (and inspect, preview).`);
  return 0;
}

async function main(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv);
  try {
    switch (parsed.positional[0]) {
      case "inspect":
        return await inspect(parsed);
      case "preview":
        return await preview(parsed);
      case "validate":
        return await validate(parsed);
      case "stamps":
        return await stamps(parsed);
      case "sheet":
        return sheet(parsed);
      case "terrains":
        return terrains();
      case "compose":
        return compose(parsed);
      default:
        console.log(USAGE);
        return parsed.positional[0] === undefined || parsed.positional[0] === "help" ? 0 : 2;
    }
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`${error.message}\n\n${USAGE}`);
      return 2;
    }
    if (error instanceof Error) {
      console.error(error.message);
      return 1;
    }
    throw error;
  }
}

process.exitCode = await main(process.argv.slice(2));
