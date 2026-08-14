#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { syncTroxRuntime } from "./sync-trox-runtime.mjs";
import { resolveTroxRoot, runTrox } from "./trox.mjs";

export const QUEST_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const TROX_REVISION_PATH = resolve(QUEST_ROOT, ".trox-revision");
export const GAME_DATA_MANIFEST_PATH = resolve(QUEST_ROOT, "tools/game-data/Cargo.toml");

const REVISION_PATTERN = /^[0-9a-f]{40}$/u;

function output(command, arguments_, cwd, run) {
  return run(command, arguments_, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export function assertCleanCheckout(root, label, run = execFileSync) {
  const status = output("git", ["status", "--porcelain"], root, run);
  if (status !== "") {
    throw new Error(`${label} checkout at ${root} must be clean before bumping Trox.`);
  }
}

export function checkoutRevision(troxRoot, run = execFileSync) {
  const revision = output("git", ["rev-parse", "HEAD"], troxRoot, run);
  if (!REVISION_PATTERN.test(revision)) {
    throw new Error(`Trox HEAD is not a full lowercase Git revision: ${revision}`);
  }
  return revision;
}

export function assertForwardRevision({
  previousRevision,
  nextRevision,
  troxRoot,
  run = execFileSync,
}) {
  try {
    run("git", ["merge-base", "--is-ancestor", previousRevision, nextRevision], {
      cwd: troxRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    throw new Error(
      `Trox HEAD ${nextRevision} does not descend from Quest's pinned revision ${previousRevision}. `
      + `Update the Trox checkout at ${troxRoot} before bumping.`,
    );
  }
}

export function updateTroxPins({
  questRoot = QUEST_ROOT,
  previousRevision,
  nextRevision,
}) {
  if (!REVISION_PATTERN.test(previousRevision) || !REVISION_PATTERN.test(nextRevision)) {
    throw new Error("Trox revisions must be full lowercase Git revisions.");
  }

  const revisionPath = resolve(questRoot, ".trox-revision");
  const actualRevision = readFileSync(revisionPath, "utf8").trim();
  if (actualRevision !== previousRevision) {
    throw new Error(`Expected .trox-revision to contain ${previousRevision}, found ${actualRevision}.`);
  }

  const manifestPath = resolve(questRoot, "tools/game-data/Cargo.toml");
  const manifest = readFileSync(manifestPath, "utf8");
  const expected = `trox = { git = "https://github.com/thurn/trox.git", rev = "${previousRevision}" }`;
  const replacement = `trox = { git = "https://github.com/thurn/trox.git", rev = "${nextRevision}" }`;
  if (manifest.split(expected).length !== 2) {
    throw new Error(`Expected exactly one pinned Trox dependency at ${manifestPath}.`);
  }

  writeFileSync(revisionPath, `${nextRevision}\n`);
  writeFileSync(manifestPath, manifest.replace(expected, replacement));
}

export function bumpTrox(options = {}) {
  const questRoot = resolve(options.questRoot ?? QUEST_ROOT);
  const environment = options.environment ?? process.env;
  const troxRoot = resolve(options.troxRoot ?? resolveTroxRoot(environment));
  const run = options.run ?? execFileSync;
  const syncRuntime = options.syncRuntime ?? syncTroxRuntime;
  const runTroxCommand = options.runTroxCommand ?? runTrox;

  assertCleanCheckout(questRoot, "Quest", run);
  assertCleanCheckout(troxRoot, "Trox", run);

  const previousRevision = readFileSync(resolve(questRoot, ".trox-revision"), "utf8").trim();
  const nextRevision = checkoutRevision(troxRoot, run);
  if (nextRevision === previousRevision) {
    throw new Error(`Quest already vendors Trox revision ${nextRevision}.`);
  }
  assertForwardRevision({ previousRevision, nextRevision, troxRoot, run });

  updateTroxPins({ questRoot, previousRevision, nextRevision });

  run("cargo", [
    "update",
    "--manifest-path",
    resolve(questRoot, "tools/game-data/Cargo.toml"),
    "-p",
    "trox",
  ], { cwd: questRoot, stdio: "inherit" });

  syncRuntime({
    environment,
    troxRoot,
    verifyRevision: true,
  });

  run("npm", [
    "install",
    "--package-lock-only",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
  ], { cwd: questRoot, env: environment, stdio: "inherit" });

  for (const arguments_ of [
    ["extract"],
    ["check"],
    ["bundle", "--allow-missing"],
  ]) {
    runTroxCommand(arguments_, {
      cwd: questRoot,
      environment,
      troxRoot,
      verifyRevision: true,
    });
  }

  console.log(`Bumped Trox from ${previousRevision} to ${nextRevision}.`);
  return { previousRevision, nextRevision };
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    bumpTrox();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
