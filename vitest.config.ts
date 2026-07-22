import { defineConfig } from "vitest/config";
import { availableParallelism } from "node:os";

export default defineConfig({
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
    maxWorkers: Math.min(4, availableParallelism()),
  },
});
