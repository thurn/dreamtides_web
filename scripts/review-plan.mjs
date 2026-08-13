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
  ".ron",
  ".toml",
]);

const SOURCE_TREE_CONTRACT_TESTS = [
  "scripts/cumulus-generated-docs-drift.test.mjs",
  "scripts/cumulus-ui-boundary.test.mjs",
];

const LOCALIZATION_CONTRACT_INPUTS = new Set([
  ".trox-revision",
  "trox.ron",
  "scripts/bump-trox.mjs",
  "scripts/trox.mjs",
  "scripts/sync-trox-runtime.mjs",
  "scripts/trox-generated-check.mjs",
]);
const LOCALIZATION_CONTRACT_TESTS = [
  "scripts/bump-trox.test.mjs",
  "scripts/trox.test.mjs",
  "scripts/trox-csv-sync.test.mjs",
  "scripts/trox-generated-check.test.mjs",
];

function isLocalizationCatalogInput(file) {
  return (
    file.startsWith("localization/") ||
    file.startsWith("src/generated/localization/") ||
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

function isValidationInput(file) {
  return (
    file.startsWith("data/") ||
    file.startsWith("tools/game-data/") ||
    file === "rust-toolchain.toml" ||
    file.startsWith("docs/draft_records_adapted/") ||
    file === "scripts/setup-assets.mjs" ||
    file.startsWith("scripts/generate-") ||
    file.startsWith("scripts/parse-")
  );
}

function isTestInput(file) {
  return (
    (file.startsWith("src/") ||
      file.startsWith("scripts/") ||
      file.startsWith("eslint-rules/") ||
      file.startsWith("data/") ||
      file === "package.json" ||
      file === "package-lock.json" ||
      file === "vite.config.ts" ||
      file === "vitest.config.ts") &&
    TEST_INPUT_EXTENSIONS.has(extname(file))
  );
}

function isRonFormattingInput(file) {
  return (
    extname(file) === ".ron" ||
    file === ".ronfmt.json" ||
    file === "scripts/format-ron.mjs" ||
    file === "scripts/ron-format.mjs"
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
    shouldValidate: changedFiles.some(isValidationInput),
    shouldCheckRonFormatting: changedFiles.some(isRonFormattingInput),
    shouldTestGameData: changedFiles.some(
      (file) =>
        file.endsWith(".ron") ||
        file.startsWith("tools/game-data/") ||
        file === "rust-toolchain.toml" ||
        file === "scripts/game-data-pipeline.mjs",
    ),
    testInputs: [...new Set(testInputs)].sort(),
  };
}
