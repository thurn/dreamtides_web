import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { listGameData } from "./game-data-pipeline.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cleanRoot = realpathSync(mkdtempSync(join(tmpdir(), "dreamtides-clean-game-data-")));
try {
  const manifest = listGameData({ rootDir: root });
  const generated = new Set(manifest.datasets.map((dataset) =>
    resolve(root, dataset.output)));
  for (const entry of ["data", "docs", "scripts", "src", "tools"]) {
    cpSync(join(root, entry), join(cleanRoot, entry), {
      recursive: true,
      dereference: false,
      filter: (source) => !generated.has(resolve(source)) &&
        !source.includes(`${join("tools", "game-data", "target")}/`),
    });
  }
  for (const entry of ["package.json", "package-lock.json", "rust-toolchain.toml"]) {
    cpSync(join(root, entry), join(cleanRoot, entry));
  }
  symlinkSync(join(root, "node_modules"), join(cleanRoot, "node_modules"), "dir");
  mkdirSync(join(cleanRoot, "public"), { recursive: true });
  mkdirSync(join(cleanRoot, "src", "generated", "config"), { recursive: true });
  const output = execFileSync(process.execPath, [
    join(cleanRoot, "scripts", "game-data-pipeline.mjs"),
    "compile",
    "--root",
    cleanRoot,
  ], { cwd: cleanRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const missing = manifest.datasets
    .map((dataset) => dataset.output)
    .filter((output) => !existsSync(join(cleanRoot, output)));
  if (missing.length > 0) {
    throw new Error(`clean generation did not materialize: ${missing.join(", ")}\n${output}`);
  }
  console.log(`Clean-checkout generation materialized ${manifest.datasets.length} datasets.`);
} finally {
  rmSync(cleanRoot, { recursive: true, force: true });
}
