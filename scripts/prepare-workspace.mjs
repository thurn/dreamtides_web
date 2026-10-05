#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const WORKSPACE_GENERATORS = [
  {
    label: "local art",
    script: "scripts/setup-assets.ts",
    nodeArgs: ["--import", "tsx"],
  },
  {
    label: "typed Cumulus tokens",
    script: "scripts/generate-cumulus-tokens.mjs",
    nodeArgs: [],
  },
];

export const DISPOSABLE_WORKSPACE_FILES = ["src/cumulus/primitives/tokens.ts"];

/**
 * Materialize every disposable file needed by development, tests, typechecking,
 * and production builds. Canonical sources remain the only versioned inputs;
 * each consumer invokes this entry point before reading generated files.
 */
export function prepareWorkspace({ root = ROOT, run = execFileSync } = {}) {
  for (const { label, script, nodeArgs } of WORKSPACE_GENERATORS) {
    console.log(`\n[prepare] ${label}`);
    run(process.execPath, [...nodeArgs, join(root, script)], {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    });
  }
  console.log(
    `\n[prepare] workspace materializations are current in ${relative(process.cwd(), root) || "."}`,
  );
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  prepareWorkspace();
}
