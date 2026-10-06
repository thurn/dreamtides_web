import { resolve } from "node:path";
import { createVitest } from "vitest/node";
import { relatedTestRunDecision } from "./review-plan.mjs";

/**
 * Runs the Vitest files related to the given source files, unless more than
 * `--max-files` test files are related. Over the cap it logs the selection
 * size and exits successfully without running anything; the caller's broader
 * stage (the release run, for `review:gate`) runs the whole suite instead.
 *
 * Usage: node scripts/review-related-tests.mjs --max-files <n> <file>...
 */

const argv = process.argv.slice(2);
const capIndex = argv.indexOf("--max-files");
const maxFiles = capIndex === -1
  ? Number.NaN
  : Number.parseInt(argv[capIndex + 1] ?? "", 10);
if (!Number.isInteger(maxFiles) || maxFiles < 0) {
  console.error(
    "Usage: node scripts/review-related-tests.mjs --max-files <n> <file>...",
  );
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
  const specifications = await vitest.getRelevantTestSpecifications();
  const decision = relatedTestRunDecision(
    specifications.map((specification) => specification.moduleId),
    maxFiles,
  );
  if (decision.run) {
    console.log(
      `[review] ${String(decision.testFileCount)} related test file(s) ` +
      `for ${String(sources.length)} changed file(s)`,
    );
  } else {
    console.log(
      `[review] skipping related tests: ${String(decision.testFileCount)} ` +
      `related test file(s) exceed the cap of ${String(maxFiles)}; ` +
      "the release stage runs the full suite",
    );
  }
  if (decision.run && specifications.length > 0) {
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
