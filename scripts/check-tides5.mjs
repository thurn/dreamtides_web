// CLI gate: fail (exit 1) when the committed data/tides5.jsonc is out of sync with
// a fresh `npm run bake-tides5`, printing an actionable remedy.
//
//   node scripts/check-tides5.mjs     # or: npm run check-tides5
//
// Requires the public assets (`npm run setup-assets`) the bake reads.
import { checkTides5, formatStaleMessage, ROOT } from "./lib/tides5-check.mjs";

try {
  const result = checkTides5({ rootDir: ROOT });
  if (result.ok) {
    console.log("✓ data/tides5.jsonc is up to date with `npm run bake-tides5`.");
    process.exit(0);
  }
  process.stderr.write(formatStaleMessage(result));
  process.exit(1);
} catch (err) {
  process.stderr.write(
    `\nCould not verify data/tides5.jsonc against the bake:\n  ${err.message}\n\n` +
      `If the public/ inputs are missing, run \`npm run setup-assets\` first.\n`,
  );
  process.exit(1);
}
