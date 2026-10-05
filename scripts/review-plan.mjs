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
