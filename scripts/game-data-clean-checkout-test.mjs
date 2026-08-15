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
import { DISPOSABLE_WORKSPACE_FILES } from "./prepare-workspace.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cleanRoot = realpathSync(mkdtempSync(join(tmpdir(), "dreamtides-clean-game-data-")));
try {
  const manifest = listGameData({ rootDir: root });
  const generated = new Set(
    [
      ...manifest.datasets.map((dataset) => dataset.output),
      ...DISPOSABLE_WORKSPACE_FILES,
    ].map((output) => resolve(root, output)),
  );
  for (const entry of ["data", "docs", "scripts", "src", "tools"]) {
    cpSync(join(root, entry), join(cleanRoot, entry), {
      recursive: true,
      dereference: false,
      filter: (source) => !generated.has(resolve(source)) &&
        !source.includes(`${join("tools", "game-data", "target")}/`),
    });
  }
  for (const entry of [
    "package.json",
    "package-lock.json",
    "rust-toolchain.toml",
    "tsconfig.json",
    "tsconfig.node.json",
  ]) {
    cpSync(join(root, entry), join(cleanRoot, entry));
  }
  symlinkSync(join(root, "node_modules"), join(cleanRoot, "node_modules"), "dir");
  mkdirSync(join(cleanRoot, "public"), { recursive: true });
  mkdirSync(join(cleanRoot, "src", "generated", "config"), { recursive: true });
  const output = execFileSync(
    process.execPath,
    [join(cleanRoot, "scripts", "prepare-workspace.mjs")],
    { cwd: cleanRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const missing = [
    ...manifest.datasets.map((dataset) => dataset.output),
    ...DISPOSABLE_WORKSPACE_FILES,
  ]
    .filter((output) => !existsSync(join(cleanRoot, output)));
  if (missing.length > 0) {
    throw new Error(
      `clean preparation did not materialize: ${missing.join(", ")}\n${output}`,
    );
  }
  execFileSync(
    process.execPath,
    [join(cleanRoot, "node_modules", "typescript", "bin", "tsc"), "--noEmit"],
    { cwd: cleanRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  console.log(
    `Clean-checkout preparation materialized ${manifest.datasets.length} datasets and ${DISPOSABLE_WORKSPACE_FILES.length} runtime/code artifacts, then passed typechecking.`,
  );
} finally {
  rmSync(cleanRoot, { recursive: true, force: true });
}
