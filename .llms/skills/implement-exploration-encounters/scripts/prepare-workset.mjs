#!/usr/bin/env node

import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildEncounterWorkset,
  DEFAULT_CANDIDATES_PATH,
  DEFAULT_EXPLORATION_PATH,
  DEFAULT_TEMPLATES_PATH,
  readSources,
} from "./workset-lib.mjs";

function optionValue(argv, index, option) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${option} requires a value.`);
  }
  return value;
}

export function parsePrepareArgs(argv) {
  const options = {
    candidatesPath: DEFAULT_CANDIDATES_PATH,
    explorationPath: DEFAULT_EXPLORATION_PATH,
    templatesPath: DEFAULT_TEMPLATES_PATH,
    outputPath: null,
    requestedCardIds: [],
    format: "text",
    force: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else if (argument === "--force") {
      options.force = true;
    } else if (argument === "--candidates") {
      options.candidatesPath = resolve(optionValue(argv, index, argument));
      index += 1;
    } else if (argument === "--exploration") {
      options.explorationPath = resolve(optionValue(argv, index, argument));
      index += 1;
    } else if (argument === "--templates") {
      options.templatesPath = resolve(optionValue(argv, index, argument));
      index += 1;
    } else if (argument === "--out") {
      options.outputPath = resolve(optionValue(argv, index, argument));
      index += 1;
    } else if (argument === "--card-id") {
      options.requestedCardIds.push(optionValue(argv, index, argument));
      index += 1;
    } else if (argument === "--format") {
      options.format = optionValue(argv, index, argument);
      index += 1;
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }
  if (options.format !== "text" && options.format !== "json") {
    throw new Error("--format must be text or json.");
  }
  return options;
}

function usage() {
  return [
    "Usage: prepare-workset.mjs [options]",
    "",
    "Identify candidate encounter UUIDs absent from live exploration.toml and",
    "optionally write their selected prose/actions as an authoring TOML workset.",
    "",
    "Options:",
    "  --card-id <uuid>       Include one unimplemented UUID; repeat for a subset",
    "  --out <path>           Write the selected TOML workset",
    "  --force                Allow --out to replace an existing workset",
    "  --format <text|json>   Report format (default: text)",
    "  --candidates <path>    Candidate JSON override",
    "  --exploration <path>   Live Exploration TOML override",
    "  --templates <path>     Encounter templates JSON override",
    "  --help                  Show this help",
    "",
  ].join("\n");
}

function textReport(report) {
  return [
    `Candidates: ${String(report.candidateCount)}`,
    `Live encounters: ${String(report.liveEncounterCount)}`,
    `Represented candidates: ${String(report.representedCandidateCount)}`,
    `Unimplemented candidates: ${String(report.unimplementedCount)}`,
    ...report.unimplementedCardIds.map((cardId) => `  ${cardId}`),
    `Selected for workset: ${String(report.selectedCount)}`,
    ...report.selectedCardIds.map((cardId) => `  ${cardId}`),
  ].join("\n");
}

function main() {
  const options = parsePrepareArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  if (
    options.outputPath === options.explorationPath ||
    options.outputPath === options.candidatesPath ||
    options.outputPath === options.templatesPath
  ) {
    throw new Error("--out must not overwrite a source catalog.");
  }
  const result = buildEncounterWorkset({
    ...readSources(options),
    requestedCardIds: options.requestedCardIds,
  });
  process.stdout.write(
    options.format === "json"
      ? `${JSON.stringify(result.report, null, 2)}\n`
      : `${textReport(result.report)}\n`,
  );
  if (options.outputPath !== null) {
    if (result.selectedToml === null) {
      process.stderr.write("No unimplemented encounters were selected; no workset was written.\n");
      return;
    }
    if (existsSync(options.outputPath) && !options.force) {
      throw new Error(`${options.outputPath} already exists; pass --force to replace it.`);
    }
    writeFileSync(options.outputPath, result.selectedToml, "utf8");
    process.stderr.write(`Wrote ${options.outputPath}\n`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
