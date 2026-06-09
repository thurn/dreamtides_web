// Parity check for the committed merchant corpus artifact.
//
//   node scripts/merchant-corpus-parity.mjs
//
// Re-derives the corpus via `computeMerchantCorpus()` (shared with
// `bake-merchant-corpus.mjs`) and deep-compares the result against the
// committed `data/merchant_corpus.json`. Exits 0 when they match; on mismatch
// prints the first 10 differing paths and exits 1.
//
// Run this in CI / before merging to confirm the committed artifact is in sync
// with its inputs. If it fails, run `npm run bake-merchant-corpus` and commit
// the regenerated file.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { computeMerchantCorpus, serializeMerchantCorpus } from "./bake-merchant-corpus.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACT_PATH = join(ROOT, "data", "merchant_corpus.json");

/**
 * Recursively collect differing paths between two JSON-compatible values.
 * Returns an array of path strings like `.cards["uuid"].quality`.
 * Stops after `limit` differences to avoid flooding the output.
 */
function collectDiffs(a, b, path = "", diffs = [], limit = 10) {
  if (diffs.length >= limit) return diffs;

  if (a === b) return diffs;

  const typeA = typeof a;
  const typeB = typeof b;

  if (typeA !== typeB || typeA !== "object" || a === null || b === null) {
    diffs.push(`${path}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
    return diffs;
  }

  // Both are non-null objects (or arrays).
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  const allKeys = new Set([...keysA, ...keysB]);

  for (const key of allKeys) {
    if (diffs.length >= limit) break;
    const childPath = Array.isArray(a) ? `${path}[${key}]` : `${path}.${key}`;
    if (!(key in a)) {
      diffs.push(`${childPath}: missing in committed artifact`);
    } else if (!(key in b)) {
      diffs.push(`${childPath}: missing in re-derived artifact`);
    } else {
      collectDiffs(a[key], b[key], childPath, diffs, limit);
    }
  }

  return diffs;
}

function main() {
  // Load the committed artifact.
  const committedText = readFileSync(ARTIFACT_PATH, "utf8");
  const committed = JSON.parse(committedText);

  // Re-derive via the shared compute function.
  console.log("Re-deriving merchant corpus for parity check…");
  const { artifact } = computeMerchantCorpus();

  // Re-serialize to the canonical format and re-parse for a value comparison
  // (this handles any floating-point round-trip issues and ensures the
  // comparison is independent of whitespace/ordering).
  const rederived = JSON.parse(serializeMerchantCorpus(artifact));

  const diffs = collectDiffs(committed, rederived);

  if (diffs.length === 0) {
    console.log("parity OK — committed artifact matches the re-derived corpus.");
    process.exit(0);
  } else {
    console.error(`parity FAIL — ${diffs.length >= 10 ? "10+" : String(diffs.length)} differing paths (first ${diffs.length}):`);
    for (const diff of diffs) {
      console.error(`  ${diff}`);
    }
    console.error("\nRun `npm run bake-merchant-corpus` and commit the updated artifact.");
    process.exit(1);
  }
}

main();
