#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  countUnicodeCharacters,
  ESSAY_CHARACTER_LIMIT,
  ESSAY_CHARACTER_REFERENCE,
} from "./dda-markdown-lib.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../../../..");

function usage() {
  return [
    "Usage: measure-essays.mjs [--anthology <directory>]",
    "",
    "Reports Unicode code-point, word, and wrapped-line counts for DDA essays.",
  ].join("\n");
}

function parseArguments(argumentsList) {
  let anthologyDirectory = path.join(repositoryRoot, "dda");

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--anthology") {
      const value = argumentsList[index + 1];
      if (!value) {
        throw new Error("--anthology requires a directory");
      }
      anthologyDirectory = path.resolve(value);
      index += 1;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      return { help: true };
    }
    throw new Error(`unknown argument: ${argument}`);
  }

  return { anthologyDirectory };
}

function countWords(source) {
  return source.match(/\p{L}[\p{L}\p{N}'’_-]*/gu)?.length ?? 0;
}

function countLines(source) {
  const normalized = source.replaceAll("\r\n", "\n");
  if (normalized.length === 0) {
    return 0;
  }
  return normalized.endsWith("\n")
    ? normalized.split("\n").length - 1
    : normalized.split("\n").length;
}

async function collectMeasurements(anthologyDirectory) {
  const measurements = [];
  const entries = await readdir(anthologyDirectory, { withFileTypes: true });
  for (const entry of entries) {
    if (
      !entry.isFile() ||
      !entry.name.endsWith(".md") ||
      entry.name === "index.md"
    ) {
      continue;
    }
    const source = await readFile(
      path.join(anthologyDirectory, entry.name),
      "utf8",
    );
    measurements.push({
      characters: countUnicodeCharacters(source),
      essay: entry.name,
      lines: countLines(source),
      words: countWords(source),
    });
  }
  return measurements.sort((left, right) =>
    left.essay.localeCompare(right.essay, "en"),
  );
}

function printMeasurements(measurements) {
  if (measurements.length === 0) {
    process.stdout.write("DDA has no essays to measure.\n");
    return;
  }

  const essayWidth = Math.max(
    "Essay".length,
    ...measurements.map((measurement) => measurement.essay.length),
  );
  const format = new Intl.NumberFormat("en-US");
  process.stdout.write(
    `${"Essay".padEnd(essayWidth)}  Characters   Words   Lines\n`,
  );
  for (const measurement of measurements) {
    process.stdout.write(
      `${measurement.essay.padEnd(essayWidth)}  ${format.format(measurement.characters).padStart(10)}  ${format.format(measurement.words).padStart(6)}  ${format.format(measurement.lines).padStart(6)}\n`,
    );
  }
  process.stdout.write(
    `\nLoose planning reference: ${format.format(ESSAY_CHARACTER_REFERENCE)} characters; hard limit: ${format.format(ESSAY_CHARACTER_LIMIT)}. Shorter essays are expected.\n`,
  );
}

let options;
try {
  options = parseArguments(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error.message}\n\n${usage()}\n`);
  process.exitCode = 2;
}

if (options?.help) {
  process.stdout.write(`${usage()}\n`);
} else if (options) {
  try {
    const measurements = await collectMeasurements(options.anthologyDirectory);
    printMeasurements(measurements);
    if (
      measurements.some(
        (measurement) => measurement.characters > ESSAY_CHARACTER_LIMIT,
      )
    ) {
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
