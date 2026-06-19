// CLI gate: fail (exit 1) when the committed data/tides4.jsonc is out of sync with
// a fresh `npm run bake-tides4`, printing an actionable remedy. Wire it into CI or
// a pre-commit hook; the same check also runs in the vitest suite
// (scripts/check-tides4.test.ts) so `npm test` blocks a stale commit.
//
//   node scripts/check-tides4.mjs     # or: npm run check-tides4
//
// Requires the public assets (`npm run setup-assets`) the bake reads.
import { checkTides4, formatStaleMessage, ROOT } from "./lib/tides4-check.mjs";

try {
  const result = checkTides4({ rootDir: ROOT });
  if (result.ok) {
    console.log("✓ data/tides4.jsonc is up to date with `npm run bake-tides4`.");
    process.exit(0);
  }
  process.stderr.write(formatStaleMessage(result));
  process.exit(1);
} catch (err) {
  process.stderr.write(
    `\nCould not verify data/tides4.jsonc against the bake:\n  ${err.message}\n\n` +
      `If the public/ inputs are missing, run \`npm run setup-assets\` first.\n`,
  );
  process.exit(1);
}
