import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  formatLocalizationDiagnostics,
  validateLocalizationSource,
} from "./validate-localization-source.mjs";
import { loadEnglishLocalizationResources } from "./localization-catalog.mjs";

const requestedPath = process.argv[2];
const readsStdin = requestedPath === "-";
const resources = readsStdin
  ? [{ path: "<stdin>", source: readFileSync(0, "utf8") }]
  : requestedPath === undefined
    ? loadEnglishLocalizationResources()
    : [
        {
          path: resolve(requestedPath),
          source: readFileSync(resolve(requestedPath), "utf8"),
        },
      ];
const failures = resources
  .map(({ path, source }) =>
    formatLocalizationDiagnostics(validateLocalizationSource(source), path),
  )
  .filter(Boolean);

if (failures.length > 0) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
}
