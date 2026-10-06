import { basename, dirname, extname, posix } from "node:path";

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

/** Extensions of files whose imports can name a deleted module. */
export const IMPORTER_EXTENSIONS = [...TEST_INPUT_EXTENSIONS].filter(
  (extension) => extension !== ".json" && extension !== ".jsonc",
);

const RESOLVED_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
];

/** TypeScript resolves an ESM `.js`-style specifier to its typed source. */
const TYPED_SOURCE_EXTENSIONS = {
  ".js": [".ts", ".tsx"],
  ".jsx": [".tsx"],
  ".mjs": [".mts"],
  ".cjs": [".cts"],
};

/**
 * Relative module specifiers in static, side-effect, dynamic, `require`, CSS
 * `@import` and Vitest `mock`-family positions.
 */
const RELATIVE_SPECIFIER_PATTERN =
  /\b(?:from|import|require|mock|doMock|unmock|importActual|importMock)\s*\(?\s*(["'`])(\.{1,2}\/[^"'`\n]*)\1/g;

function resolutionCandidates(importer, specifier) {
  const target = posix.normalize(posix.join(posix.dirname(importer), specifier));
  const candidates = [target];
  for (const extension of RESOLVED_EXTENSIONS) {
    candidates.push(`${target}${extension}`, `${target}/index${extension}`);
  }
  const typedExtensions = TYPED_SOURCE_EXTENSIONS[extname(target)] ?? [];
  for (const extension of typedExtensions) {
    candidates.push(`${target.slice(0, -extname(target).length)}${extension}`);
  }
  return candidates;
}

/**
 * Text that every relative specifier resolving to one of `targets` contains:
 * the file stem, or the directory name for an `index` module.
 */
export function importSearchNeedles(targets) {
  return [
    ...new Set(
      targets.map((target) => {
        const stem = basename(target, extname(target));
        return stem === "index" ? basename(dirname(target)) : stem;
      }),
    ),
  ].sort();
}

/**
 * Paths of the `sources` (`{ path, source }` records) with a relative import
 * that resolves to one of `targets`.
 */
export function importersOf(targets, sources) {
  const targetSet = new Set(targets);
  const importers = new Set();
  for (const { path, source } of sources) {
    for (const match of source.matchAll(RELATIVE_SPECIFIER_PATTERN)) {
      const specifier = match[2];
      if (
        specifier !== undefined &&
        resolutionCandidates(path, specifier).some((candidate) =>
          targetSet.has(candidate)
        )
      ) {
        importers.add(path);
        break;
      }
    }
  }
  return [...importers].sort();
}

/**
 * Plans the bounded checks for `files` changed against the review base. A
 * changed path that no longer exists is a deletion: a deleted module never
 * reaches lint or Vitest itself, so `findImporters(deletedModules)` names the
 * surviving files that still import it, and those join the lint and
 * related-test selections in its place.
 */
export function buildReviewPlan(
  files,
  fileExists = () => true,
  findImporters = () => [],
) {
  const changedFiles = [...new Set(files)].sort();
  const existingFiles = changedFiles.filter(fileExists);
  const deletedModules = changedFiles.filter(
    (file) => !fileExists(file) && TEST_INPUT_EXTENSIONS.has(extname(file)),
  );
  const importerFiles = deletedModules.length === 0
    ? []
    : [...new Set(findImporters(deletedModules))].filter(fileExists).sort();
  const checkedFiles = [...new Set([...existingFiles, ...importerFiles])].sort();

  return {
    changedFiles,
    importerFiles,
    lintFiles: checkedFiles.filter(
      (file) =>
        file.startsWith("src/") && LINTABLE_EXTENSIONS.has(extname(file)),
    ),
    shouldTypecheck: changedFiles.some(isTypecheckInput),
    testInputs: checkedFiles.filter(isTestInput),
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
