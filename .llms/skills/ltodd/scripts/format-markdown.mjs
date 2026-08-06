#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateBook } from "./ltodd-markdown-lib.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../../../..");

function usage() {
  return [
    "Usage: format-markdown.mjs (--write | --check) [--book <directory>]",
    "",
    "Formats and validates the part-organized LToDD Markdown corpus.",
  ].join("\n");
}

function parseArguments(argumentsList) {
  let mode;
  let bookDirectory = path.join(repositoryRoot, "ltodd");

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--write" || argument === "--check") {
      if (mode) {
        throw new Error("choose exactly one of --write or --check");
      }
      mode = argument;
      continue;
    }
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

  if (!mode) {
    throw new Error("choose exactly one of --write or --check");
  }
  return { bookDirectory, mode };
}

function runTool(binaryName, argumentsList) {
  const binary = path.join(
    repositoryRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? `${binaryName}.cmd` : binaryName,
  );
  const result = spawnSync(binary, argumentsList, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });

  if (result.error) {
    process.stderr.write(
      `Unable to run ${binaryName}. Run npm install in the repository root.\n`,
    );
    return false;
  }
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  return result.status === 0;
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
  let validation = await validateBook(options.bookDirectory);
  if (validation.files.length === 0) {
    for (const error of validation.errors) {
      process.stderr.write(`error: ${error}\n`);
    }
    process.exitCode = 1;
  } else {
    const prettierMode = options.mode === "--write" ? "--write" : "--check";
    const prettierPassed = runTool("prettier", [
      prettierMode,
      "--print-width",
      "80",
      "--prose-wrap",
      "always",
      ...validation.files,
    ]);

    if (options.mode === "--write") {
      validation = await validateBook(options.bookDirectory);
    }

    const markdownlintPassed = runTool("markdownlint-cli2", [
      "--config",
      path.join(scriptDirectory, ".markdownlint-cli2.jsonc"),
      ...validation.files,
    ]);

    for (const warning of validation.warnings) {
      process.stderr.write(`warning: ${warning}\n`);
    }
    for (const error of validation.errors) {
      process.stderr.write(`error: ${error}\n`);
    }

    if (
      !prettierPassed ||
      !markdownlintPassed ||
      validation.errors.length > 0
    ) {
      process.exitCode = 1;
    } else {
      process.stdout.write(
        `LToDD Markdown ${options.mode === "--write" ? "formatted" : "checked"}.\n`,
      );
    }
  }
}
