// Compiles every D97 dream map module (src/content/d97/maps/) against the
// local LPC library into gitignored `public/d97/maps/<map-id>.json`, at
// workspace preparation and on demand (`npm run d97:maps`). A missing library
// or source file warns and skips that map, so a checkout without the library
// still prepares; a map that fails to compile (a stale source hash, a broken
// recipe) prints its errors and is skipped, keeping its last compiled file,
// and `--strict` makes either a failure. A file that is not a catalog map's
// is removed.

import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { D97_DREAM_MAPS } from "../../src/content/d97/maps/index.ts";
import type { DreamMapDefinition } from "../../src/d97/map/definition.ts";
import { defaultArtPaths } from "../setup-assets.ts";
import { compileFromLibrary, describeCompileError, REPO_ROOT, type LibraryCompileResult } from "./map-library.ts";

/** What one compile pass did, for its report and exit code. */
export interface CompileMapsResult {
  readonly compiled: number;
  readonly failures: number;
}

/**
 * Compile `definitions` into `outDir`, one `<map-id>.json` each. A map that
 * is skipped (no source, or a failed compile) keeps its last compiled file;
 * only files that are not a catalog map's are removed. `strict` counts a
 * missing source as a failure.
 */
export function compileMaps(
  outDir: string,
  definitions: readonly DreamMapDefinition[],
  compile: (definition: DreamMapDefinition) => LibraryCompileResult,
  strict: boolean,
): CompileMapsResult {
  mkdirSync(outDir, { recursive: true });
  let compiled = 0;
  let failures = 0;
  for (const definition of definitions) {
    const result = compile(definition);
    if (!result.ok && "missingSource" in result) {
      console.warn(`  Warning: D97 map ${definition.id}: no source at ${result.missingSource}; skipped, keeping its last compiled file`);
      if (strict) failures += 1;
      continue;
    }
    if (!result.ok) {
      failures += 1;
      console.warn(`  Warning: D97 map ${definition.id} did not compile; skipped, keeping its last compiled file`);
      for (const error of result.errors) console.warn(`    ${describeCompileError(error)}`);
      continue;
    }
    const file = `${definition.id}.json`;
    const temporary = join(outDir, `.${file}.tmp`);
    writeFileSync(temporary, `${JSON.stringify(result.map)}\n`);
    renameSync(temporary, join(outDir, file));
    compiled += 1;
  }
  const catalogFiles = new Set(definitions.map((definition) => `${definition.id}.json`));
  for (const entry of readdirSync(outDir)) {
    if (!catalogFiles.has(entry)) rmSync(join(outDir, entry), { force: true, recursive: true });
  }
  return { compiled, failures };
}

function main(): number {
  const strict = process.argv.includes("--strict");
  const outDir = defaultArtPaths(REPO_ROOT, homedir()).d97MapsDir;
  const { compiled, failures } = compileMaps(outDir, D97_DREAM_MAPS, (definition) => compileFromLibrary(definition), strict);
  console.log(`Compiled ${String(compiled)} of ${String(D97_DREAM_MAPS.length)} D97 maps`);
  return strict && failures > 0 ? 1 : 0;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
