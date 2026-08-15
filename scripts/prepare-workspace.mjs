#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const WORKSPACE_GENERATORS = [
  {
    label: "runtime data and local art",
    script: "scripts/setup-assets.mjs",
  },
  {
    label: "typed Cumulus tokens",
    script: "scripts/generate-cumulus-tokens.mjs",
  },
  {
    label: "Cumulus documentation metadata",
    script: "scripts/generate-cumulus-metadata.mjs",
  },
  {
    label: "localized runtime adapters",
    script: "scripts/generate-localized-runtime-templates.mjs",
  },
];

export const DISPOSABLE_WORKSPACE_FILES = [
  "public/affiliations-data.json",
  "public/apollyon-incarnations-data.json",
  "public/atlas-data.json",
  "public/augury-data.json",
  "public/avatars-v2-data.json",
  "public/card-data.json",
  "public/cards_v2-data.json",
  "public/draft-data.json",
  "public/dream-guides-data.json",
  "public/dreamscapes-data.json",
  "public/dreamsign-data.json",
  "public/dreamwell-data.json",
  "public/economy-data.json",
  "public/exploration-data.json",
  "public/figments-data.json",
  "public/gamble-data.json",
  "public/opponents-data.json",
  "public/resonance-data.json",
  "public/sites-data.json",
  "public/tides4-data.json",
  "public/transfiguration-data.json",
  "public/tutorial-data.json",
  "src/cumulus/metadata/cumulus-metadata.json",
  "src/cumulus/primitives/tokens.ts",
  "src/generated/config/augury-data.json",
  "src/generated/config/card-role-data.json",
  "src/generated/config/draft-data.json",
  "src/generated/config/gamble-data.json",
  "src/generated/config/resonance-data.json",
  "src/generated/config/sites-data.json",
  "src/generated/config/tides4-data.json",
  "src/generated/config/transfiguration-data.json",
  "src/runtime/localization/runtime-templates.generated.ts",
];

/**
 * Materialize every disposable file needed by development, tests, typechecking,
 * and production builds. Canonical sources remain the only versioned inputs;
 * each consumer invokes this entry point before reading generated files.
 */
export function prepareWorkspace({ root = ROOT, run = execFileSync } = {}) {
  for (const { label, script } of WORKSPACE_GENERATORS) {
    console.log(`\n[prepare] ${label}`);
    run(process.execPath, [join(root, script)], {
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
