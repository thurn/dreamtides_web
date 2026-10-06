import { extname } from "node:path";

const LINTABLE_EXTENSIONS = new Set([".ts", ".tsx"]);

const TEST_INPUT_EXTENSIONS = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
  ".css",
  ".json",
  ".jsonc",
]);

export function reviewNeedsPreparedWorkspace(reviewPlan) {
  return reviewPlan.shouldTypecheck || reviewPlan.testInputs.length > 0;
}

function isTypecheckInput(file) {
  return (
    (file.startsWith("src/") ||
      file.startsWith("eslint-rules/") ||
      file === "package.json" ||
      file === "package-lock.json" ||
      file.startsWith("tsconfig") ||
      file === "vite.config.ts" ||
      file === "vitest.config.ts") &&
    [".ts", ".tsx", ".json"].includes(extname(file))
  );
}

function isTestInput(file) {
  return (
    (file.startsWith("src/") ||
      file.startsWith("scripts/") ||
      file.startsWith("eslint-rules/") ||
      file === "package.json" ||
      file === "package-lock.json" ||
      file === "vite.config.ts" ||
      file === "vitest.config.ts") &&
    TEST_INPUT_EXTENSIONS.has(extname(file))
  );
}

export function buildReviewPlan(files, fileExists = () => true) {
  const changedFiles = [...new Set(files)].sort();
  const existingFiles = changedFiles.filter(fileExists);
  const testInputs = existingFiles.filter(isTestInput);

  return {
    changedFiles,
    lintFiles: existingFiles.filter(
      (file) =>
        file.startsWith("src/") && LINTABLE_EXTENSIONS.has(extname(file)),
    ),
    shouldTypecheck: changedFiles.some(isTypecheckInput),
    testInputs,
  };
}

/**
 * Most related test files `review:gate` runs. A larger selection is skipped
 * because the release stage runs the whole suite on the same history.
 */
export const GATE_RELATED_TEST_FILE_CAP = 40;

/**
 * Whether a related-test selection runs under `cap`. A file selected by more
 * than one Vitest project counts once.
 */
export function relatedTestRunDecision(testFiles, cap) {
  const testFileCount = new Set(testFiles).size;
  return { run: testFileCount <= cap, testFileCount };
}

/**
 * Steps of the gate stage's `review:gate` for a plan built from the files
 * changed against `HEAD^`: prepare, then the full typecheck alongside lint of
 * the changed sources, then the capped related tests.
 */
export function gateExecutionPlan(reviewPlan) {
  const checks = [{ step: "typecheck", args: [] }];
  if (reviewPlan.lintFiles.length > 0) {
    checks.push({ step: "lint", args: reviewPlan.lintFiles });
  }
  const steps = [{ step: "prepare", args: [] }, { concurrent: checks }];
  if (reviewPlan.testInputs.length > 0) {
    steps.push({
      step: "test-related-capped",
      args: [
        "--max-files",
        String(GATE_RELATED_TEST_FILE_CAP),
        ...reviewPlan.testInputs,
      ],
    });
  }
  return steps;
}
