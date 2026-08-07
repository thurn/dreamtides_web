import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatLocalizationDiagnostics,
  validateLocalizationSource,
} from "./validate-localization-source.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_PATH = resolve(ROOT, "data/strings.ftl");
const requestedPath = process.argv[2];
const readsStdin = requestedPath === "-";
const sourcePath = readsStdin
  ? "<stdin>"
  : requestedPath === undefined
    ? SOURCE_PATH
    : resolve(requestedPath);
const diagnostics = validateLocalizationSource(
  readFileSync(readsStdin ? 0 : sourcePath, "utf8"),
);

if (diagnostics.length > 0) {
  process.stderr.write(
    `${formatLocalizationDiagnostics(diagnostics, sourcePath)}\n`,
  );
  process.exitCode = 1;
}
