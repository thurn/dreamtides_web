import { ESLint } from "eslint";

const requestedFiles = process.argv.slice(2);
const requestedConcurrency = Number.parseInt(
  process.env.JOURNEY_ESLINT_WORKERS ?? "2",
  10,
);
const concurrency = Number.isInteger(requestedConcurrency) && requestedConcurrency > 0
  ? requestedConcurrency
  : 2;

const eslint = new ESLint({ cwd: process.cwd(), concurrency });
const results = await eslint.lintFiles(requestedFiles.length > 0
  ? requestedFiles
  : ["src/", "scripts/"]);

const formatter = await eslint.loadFormatter("stylish");
const output = await formatter.format(results);
if (output.trim() !== "") process.stdout.write(output);

if (results.some((result) => result.errorCount > 0 || result.fatalErrorCount > 0)) {
  process.exitCode = 1;
}
