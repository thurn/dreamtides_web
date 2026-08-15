#!/usr/bin/env node

import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runTrox } from "./trox.mjs";
import { assertCanonicalLocalizationContract } from "./canonical-localization-audit.mjs";

const QUEST_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GENERATED_PATH = join(".generated", "localization", "bundles");

function filesUnder(directory) {
  if (!existsSync(directory)) return [];
  const files = [];
  function walk(path) {
    for (const name of readdirSync(path).sort()) {
      const child = join(path, name);
      if (statSync(child).isDirectory()) walk(child);
      else files.push(relative(directory, child));
    }
  }
  walk(directory);
  return files;
}

export function assertGeneratedBundlesEqual(expected, actual) {
  const expectedFiles = filesUnder(expected);
  const actualFiles = filesUnder(actual);
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error(
      `Generated Trox bundle file set is stale: expected ${expectedFiles.join(", ")}; ` +
        `generated ${actualFiles.join(", ")}.`,
    );
  }
  for (const file of expectedFiles) {
    if (
      !readFileSync(join(expected, file)).equals(
        readFileSync(join(actual, file)),
      )
    ) {
      throw new Error(
        `Generated Trox bundle is stale: ${join(GENERATED_PATH, file)}.`,
      );
    }
  }
}

export function checkGeneratedTroxBundles(options = {}) {
  const root = resolve(options.root ?? QUEST_ROOT);
  const cleanRoot = mkdtempSync(join(tmpdir(), "quest-clean-trox-bundles-"));
  try {
    cpSync(join(root, "src"), join(cleanRoot, "src"), { recursive: true });
    cpSync(join(root, "data"), join(cleanRoot, "data"), { recursive: true });
    cpSync(join(root, "localization"), join(cleanRoot, "localization"), {
      recursive: true,
    });
    cpSync(join(root, "trox.ron"), join(cleanRoot, "trox.ron"));
    mkdirSync(join(cleanRoot, GENERATED_PATH), { recursive: true });

    const generate =
      options.generate ??
      ((stagingRoot) =>
        {
          const troxOptions = {
            configPath: join(stagingRoot, "trox.ron"),
            cwd: stagingRoot,
          };
          runTrox(["extract"], troxOptions);
          runTrox(["check", "--deny", "warnings"], troxOptions);
          runTrox(["bundle", "--allow-missing"], troxOptions);
        });
    generate(cleanRoot);
    assertGeneratedBundlesEqual(
      join(root, GENERATED_PATH),
      join(cleanRoot, GENERATED_PATH),
    );
  } finally {
    rmSync(cleanRoot, { recursive: true, force: true });
  }
  console.log("Release Trox bundles match clean regeneration.");
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    checkGeneratedTroxBundles();
    const result = assertCanonicalLocalizationContract(QUEST_ROOT);
    console.log(
      `Canonical localization audit checked ${String(result.compositeValueCount)} composed values, ${String(result.runtimeTemplateCount)} runtime templates, and ${String(result.projectionTemplateCount)} glossary projections.`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
