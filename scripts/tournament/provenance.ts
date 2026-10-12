import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parseContentHash, type ContentHash } from "../../src/types/content-hash";

export function digest(value: string | Uint8Array): ContentHash {
  return parseContentHash(createHash("sha256").update(value).digest("hex"));
}
/** Hash every relevant source byte, including pending content and harness tunables. */
export function sourceProvenance(root: string): { sourceHash: ContentHash; files: readonly { path: string; sha256: ContentHash }[] } {
  const files: { path: string; sha256: ContentHash }[] = [];
  function visit(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (/\.(?:ts|tsx|mjs|json)$/u.test(entry.name) && !/\.(?:test|spec|fixtures)\./u.test(entry.name) && entry.name !== "deck-pool.json") {
        files.push({ path: relative(root, path), sha256: digest(readFileSync(path)) });
      }
    }
  }
  // Full src includes every imported rules/catalog/generator dependency; additions are guarded too.
  visit(join(root, "src"));
  visit(join(root, "scripts/tournament"));
  for (const path of ["package.json", "package-lock.json", "tsconfig.json", "tsconfig.node.json"]) files.push({ path, sha256: digest(readFileSync(join(root, path))) });
  return { sourceHash: digest(JSON.stringify(files)), files };
}
