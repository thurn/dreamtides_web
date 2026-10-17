// Compiles every D97 dream map module (src/content/d97/maps/) against the
// local LPC library into gitignored `public/d97/maps/<map-id>.json`, at
// workspace preparation and on demand (`npm run d97:maps`). A missing library
// or source file warns and skips that map, so a checkout without the library
// still prepares; a map that fails to compile (a stale source hash, a broken
// recipe) prints its errors and is skipped, and `--strict` makes either a
// failure. Compiled files of maps no longer in the catalog are removed.

import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { D97_DREAM_MAPS } from "../../src/content/d97/maps/index.ts";
import { compileFromLibrary, describeCompileError, REPO_ROOT } from "./map-library.ts";

function main(): number {
  const strict = process.argv.includes("--strict");
  const outDir = join(REPO_ROOT, "public", "d97", "maps");
  mkdirSync(outDir, { recursive: true });

  const written = new Set<string>();
  let failures = 0;
  for (const definition of D97_DREAM_MAPS) {
    const result = compileFromLibrary(definition);
    if (!result.ok && "missingSource" in result) {
      console.warn(`  Warning: D97 map ${definition.id}: no source at ${result.missingSource}; skipped`);
      if (strict) failures += 1;
      continue;
    }
    if (!result.ok) {
      failures += 1;
      console.warn(`  Warning: D97 map ${definition.id} did not compile; skipped`);
      for (const error of result.errors) console.warn(`    ${describeCompileError(error)}`);
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
