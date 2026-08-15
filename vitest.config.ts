import { defineConfig } from "vitest/config";
import { availableParallelism } from "node:os";
import { troxDevelopmentBundlesPlugin } from "./scripts/trox-vite-plugin.ts";

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

export default defineConfig({
  plugins: [troxDevelopmentBundlesPlugin()],
  test: {
    include: [
      "src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}",
      "scripts/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}",
      "eslint-rules/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}",
    ],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.git/**",
      "**/.cache/**",
      "**/.output/**",
      "**/.temp/**",
      "**/.claude/worktrees/**",
    ],
    pool: "threads",
    maxWorkers: Math.min(maxWorkers, availableParallelism()),
    testTimeout,
  },
});
