// Resolves the `<map>` argument of `npm run d97:map` and compiles it:
//
// - a catalog map id (a UUID from `src/content/d97/maps/`: a dream map or an
//   example map);
// - a map module path (`.ts`/`.mts`/`.js`/`.mjs`), whose default export, or
//   else first export shaped like a map definition, is compiled;
// - a Tiled map path (`.tmx`/`.tmj`), relative to the LPC library or
//   absolute, compiled as an ad-hoc module with no recipe, regions or
//   anchors, so any library map can be inspected and previewed.

import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { D97_DREAM_MAPS, D97_EXAMPLE_MAPS } from "../../src/content/d97/maps/index.ts";
import type { CompiledDreamMap } from "../../src/d97/map/compiled.ts";
import { dreamMapSourceHash } from "../../src/d97/map/compile.ts";
import { defineDreamMap, type DreamMapDefinition } from "../../src/d97/map/definition.ts";
import { parseDreamMapId } from "../../src/types/identifiers.ts";
import { compileFromLibrary, d97LibraryDir, describeCompileError } from "./map-library.ts";

/** The id an ad-hoc Tiled map compiles under. */
const AD_HOC_MAP_ID = parseDreamMapId("00000000-0000-4000-8000-000000000000");

export interface LoadedMap {
  /** How the map was named on the command line. */
  readonly argument: string;
  /** A filesystem-safe name for its preview directory. */
  readonly slug: string;
  /** The library root its tileset images resolve against. */
  readonly library: string;
  readonly definition: DreamMapDefinition;
  readonly map: CompiledDreamMap;
  /** Tilesets the compiler left out because no drawn tile uses them. */
  readonly droppedTilesets: readonly { readonly name: string; readonly image: string | null }[];
}

export type MapLoadResult =
  | { readonly ok: true; readonly loaded: LoadedMap }
  | { readonly ok: false; readonly errors: readonly string[] };

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-+|-+$/gu, "") || "map"
  );
}

function isDefinition(value: unknown): value is DreamMapDefinition {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "source" in value &&
    "recipe" in value &&
    "anchors" in value
  );
}

async function moduleDefinition(path: string): Promise<DreamMapDefinition | null> {
  const loaded = (await import(pathToFileURL(path).href)) as Record<string, unknown>;
  if (isDefinition(loaded.default)) return loaded.default;
  return Object.values(loaded).find(isDefinition) ?? null;
}

/** Resolve and compile a `<map>` argument. */
export async function loadMap(argument: string, cwd: string = process.cwd()): Promise<MapLoadResult> {
  let library = d97LibraryDir();
  let definition: DreamMapDefinition | null = null;
  let slug: string;
  const extension = extname(argument).toLowerCase();

  if (extension === ".tmx" || extension === ".tmj") {
    const inLibrary = resolve(library, argument);
    const absolute = isAbsolute(argument) ? argument : existsSync(inLibrary) ? inLibrary : resolve(cwd, argument);
    if (!existsSync(absolute)) return { ok: false, errors: [`no Tiled map at ${absolute}`] };
    const insideLibrary = !relative(library, absolute).startsWith("..");
    if (!insideLibrary) library = dirname(absolute);
    const path = relative(library, absolute);
    definition = defineDreamMap({
      id: AD_HOC_MAP_ID,
      source: { kind: "tiled", path, sha256: dreamMapSourceHash(readFileSync(absolute, "utf8")) },
      recipe: [],
      regions: [],
      landmarks: [],
      anchors: [],
    });
    slug = slugify(path.replace(/\.[^.]+$/u, ""));
  } else if ([".ts", ".mts", ".js", ".mjs"].includes(extension)) {
    const path = resolve(cwd, argument);
    if (!existsSync(path)) return { ok: false, errors: [`no map module at ${path}`] };
    definition = await moduleDefinition(path);
    if (definition === null) return { ok: false, errors: [`${path} exports no map definition`] };
    slug = `${slugify(basename(path, extension))}`;
  } else {
    let id;
    try {
      id = parseDreamMapId(argument);
    } catch {
      return { ok: false, errors: [`${argument} is neither a catalog map id nor a map module or Tiled path`] };
    }
    definition = [...D97_DREAM_MAPS, ...D97_EXAMPLE_MAPS].find((candidate) => candidate.id === id) ?? null;
    if (definition === null) return { ok: false, errors: [`no catalog map ${id}`] };
    slug = id;
  }

  const result = compileFromLibrary(definition, library);
  if (!result.ok) {
    return {
      ok: false,
      errors:
        "missingSource" in result
          ? [`no source at ${result.missingSource} (is the LPC library at ${library}?)`]
          : result.errors.map(describeCompileError),
    };
  }
  return {
    ok: true,
    loaded: { argument, slug, library, definition, map: result.map, droppedTilesets: result.droppedTilesets },
  };
}
