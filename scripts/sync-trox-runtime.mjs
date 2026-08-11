#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pinnedTroxRevision, resolveTroxRoot, verifyTroxRevision } from "./trox.mjs";

const QUEST_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DESTINATION = resolve(QUEST_ROOT, "vendor/trox-runtime");

function run(command, arguments_, cwd) {
  execFileSync(command, arguments_, { cwd, stdio: "inherit" });
}

export function distributableFiles(directory) {
  const files = [];
  function walk(path) {
    for (const name of readdirSync(path).sort()) {
      if (name === "node_modules") continue;
      const child = join(path, name);
      if (statSync(child).isDirectory()) walk(child);
      else files.push(relative(directory, child));
    }
  }
  walk(directory);
  return files;
}

export function assertDirectoriesEqual(left, right) {
  const leftFiles = distributableFiles(left);
  const rightFiles = distributableFiles(right);
  if (JSON.stringify(leftFiles) !== JSON.stringify(rightFiles)) {
    throw new Error("Trox runtime distributable file set differs from the pinned build.");
  }
  for (const file of leftFiles) {
    if (!readFileSync(join(left, file)).equals(readFileSync(join(right, file)))) {
      throw new Error(`Trox runtime sync was not byte-identical for ${file}.`);
    }
  }
}

export function copyDistributable(troxRoot, destination) {
  const packageRoot = resolve(troxRoot, "packages/trox");
  const packageMetadata = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8"));
  if (packageMetadata.name !== "@trox/runtime") throw new Error("Unexpected Trox runtime package metadata.");
  mkdirSync(resolve(destination, "dist"), { recursive: true });
  for (const name of readdirSync(resolve(packageRoot, "dist")).sort()) {
    if (!/\.(?:js|d\.ts)$/u.test(name)) continue;
    cpSync(resolve(packageRoot, "dist", name), resolve(destination, "dist", name));
  }
  cpSync(resolve(packageRoot, "package.json"), resolve(destination, "package.json"));
  cpSync(resolve(troxRoot, "README.md"), resolve(destination, "README.md"));
  cpSync(resolve(troxRoot, "LICENSE.txt"), resolve(destination, "LICENSE.txt"));
  writeFileSync(resolve(destination, "UPSTREAM_REVISION"), `${pinnedTroxRevision()}\n`);
}

export function syncTroxRuntime(options = {}) {
  const troxRoot = options.troxRoot ?? resolveTroxRoot(options.environment);
  const destination = options.destination ?? DESTINATION;
  verifyTroxRevision(troxRoot);
  const commands = options.commands ?? [
    ["npm", ["ci"]],
    ["npm", ["run", "typecheck"]],
    ["npm", ["test"]],
    ["npm", ["run", "build"]],
  ];
  for (const [command, arguments_] of commands) run(command, arguments_, troxRoot);

  const temporaryRoot = mkdtempSync(join(tmpdir(), "quest-trox-runtime-"));
  const first = resolve(temporaryRoot, "first");
  const second = resolve(temporaryRoot, "second");
  try {
    copyDistributable(troxRoot, first);
    copyDistributable(troxRoot, second);
    assertDirectoriesEqual(first, second);
    if (options.checkOnly === true) {
      assertDirectoriesEqual(first, destination);
    } else {
      rmSync(destination, { recursive: true, force: true });
      mkdirSync(dirname(destination), { recursive: true });
      cpSync(first, destination, { recursive: true });
    }
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
  const action = options.checkOnly === true ? "Verified" : "Synced";
  console.log(`${action} @trox/runtime ${pinnedTroxRevision()} at ${relative(QUEST_ROOT, destination)}.`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    syncTroxRuntime({ checkOnly: process.argv.includes("--check") });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
