import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatRon } from "./ron-format.mjs";

const root = process.cwd();
const args = process.argv.slice(2);
const check = args.includes("--check");
const help = args.includes("--help") || args.includes("-h");
const requestedFiles = args.filter((arg) => !arg.startsWith("--"));

if (help) {
  console.log("Usage: node scripts/format-ron.mjs [--check] [files...]");
  process.exit(0);
}

const config = JSON.parse(readFileSync(resolve(root, ".ronfmt.json"), "utf8"));
const files =
  requestedFiles.length > 0
    ? requestedFiles
    : execFileSync(
        "git",
        [
          "ls-files",
          "--cached",
          "--others",
          "--exclude-standard",
          "-z",
          "--",
          "*.ron",
        ],
        { cwd: root, encoding: "utf8" },
      )
        .split("\0")
        .filter(Boolean)
        .sort();

const changes = files
  .map((file) => {
    const path = resolve(root, file);
    const source = readFileSync(path, "utf8");
    return { file, path, source, formatted: formatRon(source, config) };
  })
  .filter(({ source, formatted }) => source !== formatted);

if (check) {
  if (changes.length === 0) {
    console.log(
      `RON formatting is current (${String(files.length)} files checked).`,
    );
  } else {
    console.error("RON formatting is required:");
    for (const { file } of changes) console.error(`  ${file}`);
    console.error("Run `npm run format:ron` to update these files.");
    process.exitCode = 1;
  }
} else {
  for (const { path, formatted } of changes) writeFileSync(path, formatted);
  console.log(
    `Formatted ${String(changes.length)} of ${String(files.length)} RON files.`,
  );
}
