#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CHAPTER_CHARACTER_LIMIT,
  CHAPTER_CHARACTER_REFERENCE,
  countUnicodeCharacters,
} from "./ltodd-markdown-lib.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../../../..");

function usage() {
  return [
    "Usage: measure-chapters.mjs [--book <directory>]",
    "",
    "Reports Unicode code-point, word, and wrapped-line counts for LToDD chapters.",
  ].join("\n");
}

function parseArguments(argumentsList) {
  let bookDirectory = path.join(repositoryRoot, "ltodd");

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--book") {
      const value = argumentsList[index + 1];
      if (!value) {
        throw new Error("--book requires a directory");
      }
      bookDirectory = path.resolve(value);
      index += 1;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      return { help: true };
    }
    throw new Error(`unknown argument: ${argument}`);
  }

  return { bookDirectory };
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

async function collectMeasurements(bookDirectory) {
  const measurements = [];
  const rootEntries = await readdir(bookDirectory, { withFileTypes: true });

  for (const rootEntry of rootEntries) {
    if (!rootEntry.isDirectory()) {
      continue;
    }
    const partDirectory = path.join(bookDirectory, rootEntry.name);
    const partEntries = await readdir(partDirectory, { withFileTypes: true });
    for (const partEntry of partEntries) {
      if (!partEntry.isFile() || !partEntry.name.endsWith(".md")) {
        continue;
      }
      const source = await readFile(
        path.join(partDirectory, partEntry.name),
        "utf8",
      );
      measurements.push({
        characters: countUnicodeCharacters(source),
        chapter: `${rootEntry.name}/${partEntry.name}`,
        lines: countLines(source),
        role:
          partEntry.name === `${rootEntry.name}.md` ? "primary" : "supplement",
        words: countWords(source),
      });
    }
  }

  return measurements.sort((left, right) =>
    left.chapter.localeCompare(right.chapter, "en"),
  );
}

function printMeasurements(measurements) {
  if (measurements.length === 0) {
    process.stdout.write("LToDD has no populated parts to measure.\n");
    return;
  }

  const chapterWidth = Math.max(
    "Chapter".length,
    ...measurements.map((measurement) => measurement.chapter.length),
  );
  const format = new Intl.NumberFormat("en-US");
  process.stdout.write(
    `${"Chapter".padEnd(chapterWidth)}  Role        Characters   Words   Lines\n`,
  );

  for (const measurement of measurements) {
    process.stdout.write(
      `${measurement.chapter.padEnd(chapterWidth)}  ${measurement.role.padEnd(10)}  ${format.format(measurement.characters).padStart(10)}  ${format.format(measurement.words).padStart(6)}  ${format.format(measurement.lines).padStart(6)}\n`,
    );
  }

  process.stdout.write(
    `\nLoose planning reference: ${format.format(CHAPTER_CHARACTER_REFERENCE)} characters; hard limit: ${format.format(CHAPTER_CHARACTER_LIMIT)}. Shorter chapters are expected.\n`,
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
    const measurements = await collectMeasurements(options.bookDirectory);
    printMeasurements(measurements);
    if (
      measurements.some(
        (measurement) => measurement.characters > CHAPTER_CHARACTER_LIMIT,
      )
    ) {
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
