import { ESLint } from "eslint";
import { relative } from "node:path";
import { OUTER_UI_BASELINES } from "../eslint-rules/ui-boundary-baselines.js";
import { reconcileLintBaselines } from "./lint-baselines.mjs";

const root = process.cwd();
const requestedFiles = process.argv.slice(2);
const requestedConcurrency = Number.parseInt(
  process.env.JOURNEY_ESLINT_WORKERS ?? "2",
  10,
);
const concurrency = Number.isInteger(requestedConcurrency) && requestedConcurrency > 0
  ? requestedConcurrency
  : 2;

process.env.CUMULUS_REPORT_BASELINES = "1";

const eslint = new ESLint({ cwd: root, concurrency });
const lintResults = await eslint.lintFiles(requestedFiles.length > 0
  ? requestedFiles
  : ["src/"]);
const checkedFiles = new Set(lintResults.map((result) =>
  relative(root, result.filePath).split("\\").join("/")));
const applicableBaselines = requestedFiles.length === 0
  ? OUTER_UI_BASELINES
  : OUTER_UI_BASELINES.filter(({ file }) => checkedFiles.has(file));
const { results, mismatches } = reconcileLintBaselines(
  lintResults,
  applicableBaselines,
  root,
);

const formatter = await eslint.loadFormatter("stylish");
const output = await formatter.format(results);
if (output.trim() !== "") process.stdout.write(output);

for (const mismatch of mismatches) {
  console.error(
    `Cumulus lint baseline mismatch for ${mismatch.key}: ` +
      `expected ${String(mismatch.expected)}, found ${String(mismatch.actual)}`,
  );
}

const hasLintErrors = results.some(
  (result) => result.errorCount > 0 || result.fatalErrorCount > 0,
);
if (hasLintErrors || mismatches.length > 0) process.exitCode = 1;
