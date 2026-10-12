import { defineConfig } from "vitest/config";
import { availableParallelism } from "node:os";
import { globSync, readFileSync } from "node:fs";

const requestedWorkers = Number.parseInt(
  process.env.JOURNEY_TEST_WORKERS ?? "2",
  10,
);
const maxWorkers = Number.isInteger(requestedWorkers) && requestedWorkers > 0
  ? requestedWorkers
  : 2;
const requestedTimeout = Number.parseInt(
  process.env.JOURNEY_TEST_TIMEOUT_MS ?? "15000",
  10,
);
const testTimeout = Number.isInteger(requestedTimeout) && requestedTimeout > 0
  ? requestedTimeout
  : 15_000;

const TEST_FILES = [
  "src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}",
  "scripts/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}",
  "eslint-rules/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}",
];

const EXCLUDED_FILES = [
  "**/node_modules/**",
  "**/dist/**",
  "**/.git/**",
  "**/.cache/**",
  "**/.output/**",
  "**/.temp/**",
  "**/.claude/worktrees/**",
];

/**
 * Vitest's module mocks are not safe to share between test files in one
 * module runner: a module fetched while mocked keeps that mock in its cached
 * metadata. Every file that calls `vi.mock` or `vi.doMock` therefore runs in
 * the isolated project, and the shared projects never register a mock.
 */
const MODULE_MOCK_CALL = /\bvi\.(?:do)?[mM]ock\(/;
const testFileSources = globSync(TEST_FILES).map(
  (file) => [file, readFileSync(file, "utf8")] as const,
);
const moduleMockingFiles = testFileSources
  .filter(([, source]) => MODULE_MOCK_CALL.test(source))
  .map(([file]) => file);

/**
 * A worker thread is reused only while the next queued file belongs to the
 * same project and environment; otherwise Vitest terminates it and starts a
 * fresh worker, which re-imports its dependencies and builds a new jsdom
 * window. Splitting the shared files by their environment pragma into two
 * projects keeps each environment's files contiguous in the run order. The
 * pragma still selects each file's environment.
 */
const DOM_ENVIRONMENT_PRAGMA = /@vitest-environment\s+jsdom\b/;
const sharedDomFiles = testFileSources
  .filter(
    ([file, source]) =>
      DOM_ENVIRONMENT_PRAGMA.test(source) &&
      !moduleMockingFiles.includes(file),
  )
  .map(([file]) => file);

export default defineConfig({
  test: {
    exclude: EXCLUDED_FILES,
    setupFiles: ["src/testing/setup-dom.ts"],
    // Console output from passing tests is dropped; a failing test, suite,
    // or file prints the console output it captured beside its failure. The
    // `src/logging.ts` console transport writes megabytes of journey-log JSON
    // across the suite, and `review:gate` replays its test output through
    // Tollgate's log pipe after the run. `--silent=false` shows every log.
    silent: "passed-only",
    // Run after-hooks in definition order so the setup file's render
    // teardown unmounts before a test file's own afterEach clears the DOM.
    sequence: { hooks: "list" },
    pool: "threads",
    maxWorkers: Math.min(maxWorkers, availableParallelism()),
    testTimeout,
    projects: [
      {
        extends: true,
        test: {
          name: "shared",
          include: TEST_FILES,
          exclude: [...EXCLUDED_FILES, ...moduleMockingFiles, ...sharedDomFiles],
          // Each worker reuses one module runner across files. The setup file
          // resets the module registry, timers, and stubs before every file.
          isolate: false,
        },
      },
      {
        extends: true,
        test: {
          name: "shared-dom",
          include: sharedDomFiles,
          // As `shared`, and each worker also reuses one jsdom window, whose
          // globals the setup file restores before every file.
          isolate: false,
        },
      },
      {
        extends: true,
        test: {
          name: "isolated",
          include: moduleMockingFiles,
          isolate: true,
        },
      },
    ],
  },
});
