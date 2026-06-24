// CLI gate: fail (exit 1) when a tide's player-facing label no longer matches its
// deck contents — a swapped tribe, a claimed mechanic the deck dropped, or a
// duplicate displayName. Complements the freshness gates (check-tides4 /
// check-tides5), which only prove the artifact matches a fresh bake and so cannot
// see a label that reproduces perfectly but describes the wrong deck.
//
//   node scripts/check-tide-annotations.mjs   # or: npm run check-tide-annotations
//
// The same check runs in the vitest suite (scripts/check-tide-annotations.test.ts)
// so `npm test` blocks a drifted label.
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  checkArtifactAnnotations,
  formatAnnotationFailures,
} from "./lib/tide-annotation-check.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// tides4 is the authoritative pool: every tide carries `claims`. tides5 inherits
// its labels from tides4 by name, so it is checked for displayName uniqueness only
// (claims are not authored on it).
const ARTIFACTS = [
  { rel: "data/tides4.jsonc", requireClaims: true },
  { rel: "data/tides5.jsonc", requireClaims: false },
];

let failed = false;
for (const { rel, requireClaims } of ARTIFACTS) {
  const artifactPath = resolve(ROOT, rel);
  let result;
  try {
    result = checkArtifactAnnotations({ artifactPath, requireClaims });
  } catch (err) {
    process.stderr.write(`\nCould not check ${rel}:\n  ${err.message}\n`);
    failed = true;
    continue;
  }
  if (result.ok) {
    console.log(`✓ ${rel}: tide labels match their deck contents.`);
  } else {
    process.stderr.write(formatAnnotationFailures(result));
    failed = true;
  }
}

process.exit(failed ? 1 : 0);
