import { basename, dirname, extname, posix } from "node:path";

/**
 * The checks `review.mjs` selects for the files changed against its base.
 *
 * @typedef {{
 *   changedFiles: string[],
 *   importerFiles: string[],
 *   lintFiles: string[],
 *   shouldTypecheck: boolean,
 *   testInputs: string[],
 * }} ReviewPlan
 */

/**
 * One `review.mjs` step, or a group of independent steps run concurrently.
 *
 * @typedef {{ step: string, args: string[] }} ReviewStep
 * @typedef {ReviewStep | { concurrent: ReviewStep[] }} ReviewPlanEntry
 */

/**
 * Typed sources and the extensions their TypeScript project checks:
 * `tsconfig.json` owns src/, and `tsconfig.node.json` owns scripts/.
 */
const TYPED_SOURCE_ROOTS = [
  { prefix: "src/", extensions: new Set([".ts", ".tsx"]) },
  { prefix: "scripts/", extensions: new Set([".ts", ".mjs"]) },
];

/**
 * The typecheck runs both TypeScript projects concurrently: the application
 * in `tsconfig.json` and the build configs and scripts in
 * `tsconfig.node.json`.
 *
 * @type {ReviewStep[]}
 */
export const TYPECHECK_STEPS = [
  { step: "typecheck", args: [] },
  { step: "typecheck-node", args: [] },
];

/**
 * The import-cycle check (scripts/import-cycles.mjs) reads the whole
 * application module graph, like the typecheck, and runs beside it.
 *
 * @type {ReviewStep}
 */
const IMPORT_CYCLE_STEP = { step: "import-cycles", args: [] };

/**
 * The whole-program checks: both typechecks and the import-cycle check.
 *
 * @type {ReviewStep[]}
 */
export const STATIC_CHECK_STEPS = [...TYPECHECK_STEPS, IMPORT_CYCLE_STEP];

/**
 * The unused-code check (knip, configured by knip.jsonc): orphaned files,
 * exports, and dependencies. It resolves imports of the prepared workspace's
 * generated files, so it runs after `prepare`.
 *
 * @type {ReviewStep}
 */
export const KNIP_STEP = { step: "knip", args: [] };

/**
 * Steps of `review:full`: prepare, then lint, the whole-program checks, and
 * knip together, then the whole test suite and the production bundle
 * assertion (P7: no development-only module ships).
 *
 * @returns {ReviewPlanEntry[]}
 */
export function fullExecutionPlan() {
  return [
    { step: "prepare", args: [] },
    {
      concurrent: [{ step: "lint", args: [] }, ...STATIC_CHECK_STEPS, KNIP_STEP],
    },
    { step: "test", args: [] },
    { step: "bundle", args: [] },
  ];
}

/** @param {string} file */
function isTypedSource(file) {
  return TYPED_SOURCE_ROOTS.some(
    ({ prefix, extensions }) =>
      file.startsWith(prefix) && extensions.has(extname(file)),
  );
}

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

/** @param {ReviewPlan} reviewPlan */
export function reviewNeedsPreparedWorkspace(reviewPlan) {
  return reviewPlan.shouldTypecheck || reviewPlan.testInputs.length > 0;
}

/** @param {string} file */
function isTypecheckInput(file) {
  return isTypedSource(file) || (
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

/** @param {string} file */
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

/**
 * TypeScript resolves an ESM `.js`-style specifier to its typed source.
 *
 * @type {Partial<Record<string, string[]>>}
 */
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

/**
 * @param {string} importer
 * @param {string} specifier
 */
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
 *
 * @param {string[]} targets
 * @returns {string[]}
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
 *
 * @param {string[]} targets
 * @param {Array<{ path: string, source: string }>} sources
 * @returns {string[]}
 */
export function importersOf(targets, sources) {
  const targetSet = new Set(targets);
  /** @type {Set<string>} */
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
 *
 * @param {string[]} files
 * @param {(file: string) => boolean} [fileExists]
 * @param {(targets: string[]) => string[]} [findImporters]
 * @returns {ReviewPlan}
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
    lintFiles: checkedFiles.filter(isTypedSource),
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
 *
 * @param {string[]} testFiles
 * @param {number} cap
 * @returns {{ run: boolean, testFileCount: number }}
 */
export function relatedTestRunDecision(testFiles, cap) {
  const testFileCount = new Set(testFiles).size;
  return { run: testFileCount <= cap, testFileCount };
}

/**
 * Steps of the gate stage's `review:gate` for a plan built from the files
 * changed against `HEAD^`: prepare, then the full typecheck and the
 * import-cycle check alongside lint of the changed sources, then the capped
 * related tests.
 *
 * @param {ReviewPlan} reviewPlan
 * @returns {ReviewPlanEntry[]}
 */
export function gateExecutionPlan(reviewPlan) {
  const checks = [...STATIC_CHECK_STEPS];
  if (reviewPlan.lintFiles.length > 0) {
    checks.push({ step: "lint", args: reviewPlan.lintFiles });
  }
  /** @type {ReviewPlanEntry[]} */
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
