#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_EXPLORATION_PATH,
  verifyEncounterWorkset,
} from "./workset-lib.mjs";

function optionValue(argv, index, option) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${option} requires a path.`);
  }
  return value;
}

export function parseVerifyArgs(argv) {
  const options = {
    worksetPath: null,
    explorationPath: DEFAULT_EXPLORATION_PATH,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else if (argument === "--workset") {
      options.worksetPath = resolve(optionValue(argv, index, argument));
      index += 1;
    } else if (argument === "--exploration") {
      options.explorationPath = resolve(optionValue(argv, index, argument));
      index += 1;
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }
  if (!options.help && options.worksetPath === null) {
    throw new Error("--workset is required.");
  }
  return options;
}

function usage() {
  return [
    "Usage: verify-workset.mjs --workset <path> [options]",
    "",
    "Verify that every staged encounter UUID has one live encounter with two",
    "runtime-complete actions. Repository checks validate effect semantics.",
    "",
    "Options:",
    "  --workset <path>       TOML produced by prepare-workset.mjs",
    "  --exploration <path>   Live Exploration TOML override",
    "  --help                  Show this help",
    "",
  ].join("\n");
}

function main() {
  const options = parseVerifyArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  const result = verifyEncounterWorkset({
    worksetSource: readFileSync(options.worksetPath, "utf8"),
    explorationSource: readFileSync(options.explorationPath, "utf8"),
  });
  process.stdout.write(
    `Verified ${String(result.verifiedEncounterCount)} encounter(s):\n${result.verifiedCardIds.map((cardId) => `  ${cardId}`).join("\n")}\n`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
