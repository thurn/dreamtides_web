#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

export const QUEST_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const TROX_REVISION_PATH = resolve(QUEST_ROOT, ".trox-revision");

export function pinnedTroxRevision() {
  return readFileSync(TROX_REVISION_PATH, "utf8").trim();
}

export function resolveTroxRoot(environment = process.env) {
  return resolve(environment.TROX_ROOT ?? resolve(homedir(), "trox"));
}

export function verifyTroxRevision(troxRoot, run = execFileSync) {
  let actual;
  try {
    actual = run("git", ["rev-parse", "HEAD"], {
      cwd: troxRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read the pinned Trox checkout at ${troxRoot}: ${detail}`);
  }
  const expected = pinnedTroxRevision();
  if (actual !== expected) {
    throw new Error(`Trox revision mismatch at ${troxRoot}: expected ${expected}, found ${actual}`);
  }
  return actual;
}

export function troxInvocation(
  troxRoot,
  arguments_,
  configPath = resolve(QUEST_ROOT, "trox.ron"),
) {
  return {
    command: "cargo",
    arguments: [
      "run",
      "--locked",
      "--manifest-path",
      resolve(troxRoot, "Cargo.toml"),
      "-p",
      "trox-cli",
      "--bin",
      "trox",
      "--",
      "--config",
      resolve(configPath),
      ...arguments_,
    ],
  };
}

export function runTrox(arguments_, options = {}) {
  const troxRoot = options.troxRoot ?? resolveTroxRoot(options.environment);
  const run = options.run ?? execFileSync;
  verifyTroxRevision(troxRoot, run);
  const invocation = troxInvocation(troxRoot, arguments_, options.configPath);
  run(invocation.command, invocation.arguments, {
    cwd: options.cwd ?? QUEST_ROOT,
    env: options.environment ?? process.env,
    stdio: "inherit",
  });
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runTrox(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
