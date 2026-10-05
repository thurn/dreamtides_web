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

const SOURCE_TREE_CONTRACT_TESTS = [
  "scripts/cumulus-ui-boundary.test.mjs",
  "scripts/domain-string-audit.test.mjs",
];

const LOCALIZATION_CONTRACT_INPUTS = new Set([
  ".trox-revision",
  "trox.ron",
  "scripts/bump-trox.mjs",
  "scripts/trox.mjs",
  "scripts/sync-trox-runtime.mjs",
  "scripts/trox-generated-check.mjs",
  "scripts/trox-source-workspace.mjs",
]);

export function reviewNeedsPreparedWorkspace(reviewPlan) {
  return (
    reviewPlan.shouldCheckTrox ||
    reviewPlan.shouldTypecheck ||
    reviewPlan.testInputs.length > 0
  );
}

const LOCALIZATION_CONTRACT_TESTS = [
  "scripts/bump-trox.test.mjs",
  "scripts/trox.test.mjs",
  "scripts/trox-csv-sync.test.mjs",
  "scripts/trox-generated-check.test.mjs",
  "scripts/trox-source-workspace.test.mjs",
];

function isLocalizationCatalogInput(file) {
  return (
    file.startsWith("localization/") ||
    file.startsWith("src/runtime/localization/") ||
    file.startsWith("vendor/trox-runtime/")
  );
}

function isProductionSourceInput(file) {
  return (
    file.startsWith("src/") &&
    [".ts", ".tsx", ".css"].includes(extname(file)) &&
    !/\.(test|spec)\.(ts|tsx|css)$/.test(file)
  );
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
  if (changedFiles.some(isProductionSourceInput)) {
    testInputs.push(...SOURCE_TREE_CONTRACT_TESTS);
  }
  if (
    changedFiles.some(
      (file) =>
        isLocalizationCatalogInput(file) ||
        LOCALIZATION_CONTRACT_INPUTS.has(file),
    )
  ) {
    testInputs.push(...LOCALIZATION_CONTRACT_TESTS);
  }

  return {
    changedFiles,
    lintFiles: existingFiles.filter(
      (file) =>
        file.startsWith("src/") && LINTABLE_EXTENSIONS.has(extname(file)),
    ),
    shouldCheckTrox: changedFiles.some(
      (file) =>
        isLocalizationCatalogInput(file) ||
        LOCALIZATION_CONTRACT_INPUTS.has(file) ||
        ((file.endsWith(".ts") || file.endsWith(".tsx")) &&
          file.startsWith("src/")),
    ),
    shouldTypecheck: changedFiles.some(isTypecheckInput),
    testInputs: [...new Set(testInputs)].sort(),
  };
}
