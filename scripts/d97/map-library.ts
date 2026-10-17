// Shared plumbing for the D97 map scripts: where the LPC library is, how
// Tiled layer data decompresses, and how a map module compiles against the
// library and the catalog's stamps and terrains.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { gunzipSync, inflateSync } from "node:zlib";
import * as zlib from "node:zlib";
import {
  compileDreamMap,
  type DreamMapCompileError,
  type DreamMapCompileResult,
} from "../../src/d97/map/compile.ts";
import type { DreamMapDefinition } from "../../src/d97/map/definition.ts";
import type { TiledCompression } from "../../src/d97/map/tiled.ts";
import { D97_MAP_STAMPS, D97_MAP_TERRAINS } from "../../src/content/d97/maps/index.ts";
import { defaultArtPaths } from "../setup-assets.ts";

/** The repository checkout these scripts run from. */
export const REPO_ROOT = resolve(import.meta.dirname, "../..");

/** The local LPC art library (`~/Documents/lpc/`, or under `DREAMTIDES_LOCAL_ASSET_HOME`). */
export function d97LibraryDir(): string {
  const home = resolve(process.env.DREAMTIDES_LOCAL_ASSET_HOME ?? homedir());
  return defaultArtPaths(REPO_ROOT, home).d97ArtLibraryDir;
}

export function decompressTiled(bytes: Uint8Array, compression: TiledCompression): Uint8Array {
  if (compression === "gzip") return new Uint8Array(gunzipSync(bytes));
  if (compression === "zlib") return new Uint8Array(inflateSync(bytes));
  const zstd = (zlib as { zstdDecompressSync?: (input: Uint8Array) => Buffer }).zstdDecompressSync;
  if (zstd === undefined) throw new Error("this Node has no zstd decompressor");
  return new Uint8Array(zstd(bytes));
}

export function describeCompileError(error: DreamMapCompileError): string {
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

export type LibraryCompileResult =
  | DreamMapCompileResult
  | { readonly ok: false; readonly missingSource: string };

/**
 * Compile a map module against the library at `library` (default: the local
 * library) and the catalog's stamps and terrains.
 */
export function compileFromLibrary(
  definition: DreamMapDefinition,
  library: string = d97LibraryDir(),
): LibraryCompileResult {
  let source = null;
  if (definition.source.kind === "tiled") {
    const path = join(library, definition.source.path);
    if (!existsSync(path)) return { ok: false, missingSource: path };
    source = {
      text: readFileSync(path, "utf8"),
      loadText: (relative: string) => readFileSync(join(library, relative), "utf8"),
      decompress: decompressTiled,
    };
  }
  return compileDreamMap(definition, { source, stamps: D97_MAP_STAMPS, terrains: D97_MAP_TERRAINS });
}
