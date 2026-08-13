import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const tabulaRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(tabulaRoot, "..");
const fixtureRoot = mkdtempSync(join(tmpdir(), "tabula-native-e2e-"));
const artifacts = join(tabulaRoot, "e2e", "artifacts");

function copyFixture() {
  for (const directory of ["data", "scripts", "src"]) {
    cpSync(join(repositoryRoot, directory), join(fixtureRoot, directory), {
      recursive: true,
      dereference: false,
    });
  }
  mkdirSync(join(fixtureRoot, "public"), { recursive: true });
  copyFileSync(
    join(repositoryRoot, "public", "tides4-data.json"),
    join(fixtureRoot, "public", "tides4-data.json"),
  );
  for (const directory of ["docs", "tools", "node_modules"]) {
    const source = join(repositoryRoot, directory);
    if (!existsSync(source)) throw new Error(`Native E2E prerequisite is missing: ${source}`);
    symlinkSync(source, join(fixtureRoot, directory), "dir");
  }
  for (const file of ["package.json", "package-lock.json", ".ronfmt.json"]) {
    copyFileSync(join(repositoryRoot, file), join(fixtureRoot, file));
  }
}

function run(command, args) {
  execFileSync(command, args, { cwd: tabulaRoot, stdio: "inherit" });
}

try {
  rmSync(artifacts, { recursive: true, force: true });
  mkdirSync(artifacts, { recursive: true });
  copyFixture();
  run("npm", ["run", "build", "--", "--mode", "e2e"]);
  run("cargo", [
    "build",
    "--manifest-path",
    "src-tauri/Cargo.toml",
    "--features",
    "e2e,tauri/custom-protocol",
  ]);
  execFileSync(resolve("node_modules/.bin/wdio"), ["run", "wdio.conf.ts"], {
    cwd: tabulaRoot,
    env: {
      ...process.env,
      TABULA_E2E_REPOSITORY_ROOT: fixtureRoot,
      TABULA_E2E_ARTIFACTS: artifacts,
      TAURI_WEBDRIVER_PORT: "4465",
    },
    stdio: "inherit",
  });
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}
