import { resolve } from "node:path";
import { createVitest } from "vitest/node";
import { gateTestScope } from "./review-plan.mjs";

/**
 * Runs the gate's tests for the given changed source files: the Vitest files
 * related to them when at most `--max-related-files` test files are related,
 * and the whole suite otherwise.
 *
 * Usage:
 *   node scripts/review-related-tests.mjs --max-related-files <n> <file>...
 */

const usage =
  "Usage: node scripts/review-related-tests.mjs --max-related-files <n> <file>...";
const argv = process.argv.slice(2);
const capIndex = argv.indexOf("--max-related-files");
const maxRelatedFiles = capIndex === -1
  ? Number.NaN
  : Number.parseInt(argv[capIndex + 1] ?? "", 10);
if (!Number.isInteger(maxRelatedFiles) || maxRelatedFiles < 0) {
  console.error(usage);
  process.exit(2);
}
const sources = argv
  .filter((_, index) => index !== capIndex && index !== capIndex + 1)
  .map((file) => resolve(file));

process.env.TEST = "true";
process.env.VITEST = "true";
process.env.NODE_ENV ??= "test";

const vitest = await createVitest("test", {
  related: sources,
  run: true,
  watch: false,
  passWithNoTests: true,
});
try {
  const related = await vitest.getRelevantTestSpecifications();
  const decision = gateTestScope(
    related.map((specification) => specification.moduleId),
    maxRelatedFiles,
  );
  const specifications = decision.scope === "related"
    ? related
    : await vitest.globTestSpecifications();
  const selected =
    `[review] ${String(decision.relatedFileCount)} related test file(s) ` +
    `for ${String(sources.length)} changed file(s)`;
  console.log(
    decision.scope === "related"
      ? selected
      : `${selected} exceed ${String(maxRelatedFiles)}; running the whole ` +
        `suite (${String(specifications.length)} test file(s))`,
  );
  if (specifications.length > 0) {
    await vitest.init();
    await vitest.runTestSpecifications(specifications);
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await vitest.close();
}
process.exit(process.exitCode ?? 0);
