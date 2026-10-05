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
 * the isolated project, and the shared project never registers a mock.
 */
const MODULE_MOCK_CALL = /\bvi\.(?:do)?[mM]ock\(/;
const moduleMockingFiles = globSync(TEST_FILES).filter((file) =>
  MODULE_MOCK_CALL.test(readFileSync(file, "utf8")),
);

export default defineConfig({
  test: {
    exclude: EXCLUDED_FILES,
    setupFiles: ["src/testing/setup-dom.ts"],
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
          exclude: [...EXCLUDED_FILES, ...moduleMockingFiles],
          // Each worker reuses one module runner and jsdom window across
          // files. The setup file resets the module registry, timers, stubs,
          // and jsdom globals before every file.
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
