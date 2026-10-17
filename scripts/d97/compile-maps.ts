// Compiles every D97 dream map module (src/content/d97/maps/) against the
// local LPC library into gitignored `public/d97/maps/<map-id>.json`, at
// workspace preparation and on demand (`npm run d97:maps`). A missing library
// or source file warns and skips that map, so a checkout without the library
// still prepares; a map that fails to compile (a stale source hash, a broken
// recipe) prints its errors and is skipped, and `--strict` makes either a
// failure. Compiled files of maps no longer in the catalog are removed.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { gunzipSync, inflateSync } from "node:zlib";
import * as zlib from "node:zlib";
import { compileDreamMap, type DreamMapCompileError } from "../../src/d97/map/compile.ts";
import type { TiledCompression } from "../../src/d97/map/tiled.ts";
import {
  D97_DREAM_MAPS,
  D97_MAP_STAMPS,
  D97_MAP_TERRAINS,
} from "../../src/content/d97/maps/index.ts";
import { defaultArtPaths } from "../setup-assets.ts";

function decompress(bytes: Uint8Array, compression: TiledCompression): Uint8Array {
  if (compression === "gzip") return new Uint8Array(gunzipSync(bytes));
  if (compression === "zlib") return new Uint8Array(inflateSync(bytes));
  const zstd = (zlib as { zstdDecompressSync?: (input: Uint8Array) => Buffer }).zstdDecompressSync;
  if (zstd === undefined) throw new Error("this Node has no zstd decompressor");
  return new Uint8Array(zstd(bytes));
}

function describe(error: DreamMapCompileError): string {
  switch (error.kind) {
    case "source-hash-mismatch":
      return `source hash mismatch: the module pins ${error.expected}, the library has ${error.actual}`;
    case "recipe":
      return `recipe operation ${String(error.index)}: ${error.message}`;
    case "anchor":
      return `anchor ${error.anchorId}: ${error.message}`;
    default:
      return error.message;
  }
}

function main(): number {
  const strict = process.argv.includes("--strict");
  const root = resolve(import.meta.dirname, "../..");
  const home = resolve(process.env.DREAMTIDES_LOCAL_ASSET_HOME ?? homedir());
  const library = defaultArtPaths(root, home).d97ArtLibraryDir;
  const outDir = join(root, "public", "d97", "maps");
  mkdirSync(outDir, { recursive: true });

  const written = new Set<string>();
  let failures = 0;
  for (const definition of D97_DREAM_MAPS) {
    let source = null;
    if (definition.source.kind === "tiled") {
      const path = join(library, definition.source.path);
      if (!existsSync(path)) {
        console.warn(`  Warning: D97 map ${definition.id}: no source at ${path}; skipped`);
        if (strict) failures += 1;
        continue;
      }
      source = {
        text: readFileSync(path, "utf8"),
        loadText: (relative: string) => readFileSync(join(library, relative), "utf8"),
        decompress,
      };
    }
    const result = compileDreamMap(definition, {
      source,
      stamps: D97_MAP_STAMPS,
      terrains: D97_MAP_TERRAINS,
    });
    if (!result.ok) {
      failures += 1;
      console.warn(`  Warning: D97 map ${definition.id} did not compile; skipped`);
      for (const error of result.errors) console.warn(`    ${describe(error)}`);
      continue;
    }
    const file = `${definition.id}.json`;
    const temporary = join(outDir, `.${file}.tmp`);
    writeFileSync(temporary, `${JSON.stringify(result.map)}\n`);
    renameSync(temporary, join(outDir, file));
    written.add(file);
  }
  for (const entry of readdirSync(outDir)) {
    if (!written.has(entry)) rmSync(join(outDir, entry), { force: true, recursive: true });
  }
  console.log(`Compiled ${String(written.size)} of ${String(D97_DREAM_MAPS.length)} D97 maps`);
  return strict && failures > 0 ? 1 : 0;
}

process.exitCode = main();
