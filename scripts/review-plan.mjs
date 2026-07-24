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
  ".toml",
]);

function isTypecheckInput(file) {
  return (
    file.startsWith("src/") ||
    file.startsWith("eslint-rules/") ||
    file === "package.json" ||
    file === "package-lock.json" ||
    file.startsWith("tsconfig") ||
    file === "vite.config.ts" ||
    file === "vitest.config.ts"
  ) && [".ts", ".tsx", ".json"].includes(extname(file));
}

function isValidationInput(file) {
  return (
    file.startsWith("data/") ||
    file.startsWith("docs/draft_records_adapted/") ||
    file === "scripts/setup-assets.mjs" ||
    file.startsWith("scripts/generate-") ||
    file.startsWith("scripts/parse-")
  );
}

function isTestInput(file) {
  return (
    file.startsWith("src/") ||
    file.startsWith("scripts/") ||
    file.startsWith("eslint-rules/") ||
    file.startsWith("data/") ||
    file === "package.json" ||
    file === "package-lock.json" ||
    file === "vite.config.ts" ||
    file === "vitest.config.ts"
  ) && TEST_INPUT_EXTENSIONS.has(extname(file));
}

export function buildReviewPlan(files, fileExists = () => true) {
  const changedFiles = [...new Set(files)].sort();
  const existingFiles = changedFiles.filter(fileExists);

  return {
    changedFiles,
    lintFiles: existingFiles.filter((file) =>
      file.startsWith("src/") && LINTABLE_EXTENSIONS.has(extname(file))),
    shouldTypecheck: changedFiles.some(isTypecheckInput),
    shouldValidate: changedFiles.some(isValidationInput),
    testInputs: existingFiles.filter(isTestInput),
  };
}
