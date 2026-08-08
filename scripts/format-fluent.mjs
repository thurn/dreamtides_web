import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { formatFluent } from "./fluent-format.mjs";
import { loadEnglishLocalizationResources } from "./localization-catalog.mjs";

const DEFAULT_FILES = loadEnglishLocalizationResources().map(({ path }) => path);

export function runFluentFormatter(args, root = process.cwd()) {
  const check = args.includes("--check");
  const help = args.includes("--help") || args.includes("-h");
  const unsupportedOptions = args.filter(
    (arg) => arg.startsWith("-") && !["--check", "--help", "-h"].includes(arg),
  );
  if (unsupportedOptions.length > 0) {
    throw new Error(`Unknown option: ${unsupportedOptions[0]}`);
  }

  if (help) {
    console.log("Usage: node scripts/format-fluent.mjs [--check] [files...]");
    return;
  }

  const requestedFiles = args.filter((arg) => !arg.startsWith("-"));
  const files = requestedFiles.length > 0 ? requestedFiles : DEFAULT_FILES;
  const changes = files
    .map((file) => {
      const path = resolve(root, file);
      const source = readFileSync(path, "utf8");
      return { file, path, source, formatted: formatFluent(source, file) };
    })
    .filter(({ source, formatted }) => source !== formatted);

  if (check) {
    if (changes.length === 0) {
      console.log(
        `Fluent formatting is current (${String(files.length)} files checked).`,
      );
      return;
    }

    console.error("Fluent formatting is required:");
    for (const { file } of changes) console.error(`  ${file}`);
    console.error("Run `npm run format:fluent` to update these files.");
    process.exitCode = 1;
    return;
  }

  for (const { path, formatted } of changes) writeFileSync(path, formatted);
  console.log(
    `Formatted ${String(changes.length)} of ${String(files.length)} Fluent files.`,
  );
}

if (
  process.argv[1] !== undefined &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    runFluentFormatter(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
