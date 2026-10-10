// The production bundle assertion (P7), a step of `npm run review:full`:
// builds the app and its policy worker into a temporary directory, which
// fails when a chunk renders a development-only module (`devOnlyModulesPlugin`
// in vite.config.ts), then removes the build.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const outDir = mkdtempSync(join(tmpdir(), "dreamtides-bundle-"));
try {
  await build({ root, logLevel: "error", build: { outDir, emptyOutDir: true } });
  console.log("The production bundle holds no development-only module.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
