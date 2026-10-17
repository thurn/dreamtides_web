// The D97 map inspector (decision P12): `npm run d97:map -- <command>`.
//
//   inspect <map>                        region walkability and reachability,
//                                        landmarks, anchors, crossing times
//   preview <map> [--region <name>] [--rect x,y,w,h] [--scale <factor>] [--out <dir>]
//                                        PNG previews and a legend
//   validate <map> | --all               validator findings; exits 1 on errors
//   stamps list                          the stamp catalog
//   stamps extract --from <map> --rect x,y,w,h --name <name> [--out <dir>]
//                                        a new stamp module and its preview sheet
//
// `<map>` is a catalog map id, a map module path or a Tiled map path (see
// map-load.ts). Previews go to the gitignored `artifacts/d97/previews/`.

import { join, relative } from "node:path";
import { D97_MAP_TUNING } from "../../src/content/d97/map-tuning.ts";
import { D97_DREAM_MAPS } from "../../src/content/d97/maps/index.ts";
import { D97_STAMPS } from "../../src/content/d97/stamps/index.ts";
import type { TileRect } from "../../src/d97/map/definition.ts";
import { mainRoute } from "../../src/d97/map/routes.ts";
import { validateDreamMap } from "../../src/d97/map/validate.ts";
import { REPO_ROOT } from "./map-library.ts";
import { loadMap, type LoadedMap } from "./map-load.ts";
import { writeMapPreviews } from "./map-preview.ts";
import { formatFinding, inspectReport } from "./map-report.ts";
import { catalogImportLine, extractStampFiles, stampListReport } from "./map-stamps.ts";
import { libraryImageLoader } from "./png.ts";

const PREVIEW_ROOT = join(REPO_ROOT, "artifacts", "d97", "previews");
const STAMP_DIR = join(REPO_ROOT, "src", "content", "d97", "stamps");

const USAGE = `Usage: npm run d97:map -- <command>
  inspect <map>
  preview <map> [--region <name>] [--rect x,y,w,h] [--scale <factor>] [--out <dir>]
  validate <map> | --all
  stamps list
  stamps extract --from <map> --rect x,y,w,h --name <name> [--out <dir>]
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

async function inspect(parsed: Parsed): Promise<number> {
  const loaded = await load(parsed.positional[1]);
  if (loaded === null) return 1;
  process.stdout.write(inspectReport(loaded, D97_MAP_TUNING));
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
  const route = mainRoute(loaded.map, D97_MAP_TUNING.walkingSpeedTilesPerSecond);
  const images = libraryImageLoader(loaded.library);
  const written = writeMapPreviews(loaded.map, {
    outDir,
    images,
    ...(region === undefined ? {} : { region }),
    ...(rectText === undefined ? {} : { rect: parseRect(rectText) }),
    ...(scale === undefined ? {} : { scale }),
    ...(route === null ? {} : { route: route.path }),
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
  const targets = parsed.options.has("all") ? D97_DREAM_MAPS.map((definition) => definition.id) : [parsed.positional[1]];
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
    const findings = validateDreamMap(loaded.map, D97_MAP_TUNING);
    const errorCount = findings.filter((finding) => finding.severity === "error").length;
    errors += errorCount;
    console.log(
      `${loaded.argument}: ${String(errorCount)} errors, ${String(findings.length - errorCount)} warnings`,
    );
    for (const finding of findings) console.log(`  ${formatFinding(finding)}`);
  }
  return errors > 0 ? 1 : 0;
}

async function stamps(parsed: Parsed): Promise<number> {
  const action = parsed.positional[1];
  if (action === "list") {
    process.stdout.write(stampListReport(D97_STAMPS));
    return 0;
  }
  if (action !== "extract") throw new UsageError("stamps wants list or extract");
  const from = option(parsed, "from");
  const rectText = option(parsed, "rect");
  const name = option(parsed, "name");
  if (from === undefined || rectText === undefined || name === undefined) {
    throw new UsageError("stamps extract needs --from, --rect and --name");
  }
  const loaded = await load(from);
  if (loaded === null) return 1;
  const moduleDir = option(parsed, "out") ?? STAMP_DIR;
  const result = extractStampFiles({
    loaded,
    rect: parseRect(rectText),
    name,
    moduleDir,
    previewDir: join(PREVIEW_ROOT, "stamps"),
  });
  console.log(`Stamp ${result.stamp.id} (${result.stamp.name}), ${String(result.stamp.width)}×${String(result.stamp.height)} tiles`);
  console.log(`${display(result.modulePath)}  module`);
  console.log(`${display(result.sheet.path)}  ${String(result.sheet.width)}×${String(result.sheet.height)} px  (${result.sheet.mode})`);
  if (result.omittedObjects > 0) {
    console.log(`Omitted ${String(result.omittedObjects)} tile objects inside the rectangle (stamps carry tile layers only).`);
  }
  if (moduleDir === STAMP_DIR) {
    console.log(`Add it to src/content/d97/stamps/index.ts:\n  ${catalogImportLine(result.modulePath, STAMP_DIR)}`);
  } else {
    console.log("Move it into src/content/d97/stamps/ and list it in that directory's index.ts to add it to the catalog.");
  }
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
