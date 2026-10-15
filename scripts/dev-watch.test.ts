import { describe, expect, it } from "vitest";
import { createFilter, type AnymatchPattern } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import config from "../vite.config.ts";

const root = fileURLToPath(new URL("../", import.meta.url));

/** Evaluate Vite's public watch matcher forms against synthetic absolute paths. */
function watchIgnores(relative: string): boolean {
  const configured = config.server?.watch?.ignored;
  const patterns: AnymatchPattern[] = configured === undefined
    ? []
    : Array.isArray(configured) ? configured : [configured];
  const file = path.resolve(root, relative);
  return patterns.some((pattern) => typeof pattern === "function"
    ? pattern(file)
    : createFilter(pattern, undefined, { resolve: false })(file));
}

describe("development watch boundary", () => {
  it.each([
    "docs/plan/evidence/qa-ledger/synthetic.jsonl",
    "docs/plan/evidence/qa-ledger/nested/synthetic.jsonl",
  ])("excludes canonical sweep output %s from source updates", (file) => {
    expect(watchIgnores(file)).toBe(true);
  });

  it.each([
    "src/main.tsx",
    "src/index.css",
    "src/cumulus/primitives/cumulus-tokens.css",
    "src/components/qa-ledger/synthetic.tsx",
    "docs/plan/evidence/qa-ledger-neighbor/synthetic.jsonl",
    "docs/plan/evidence/measurements/synthetic.json",
    "docs/plan/README.md",
    "../sibling/docs/plan/evidence/qa-ledger/synthetic.jsonl",
  ])("keeps application and neighboring source watched at %s", (file) => {
    expect(watchIgnores(file)).toBe(false);
  });

  it.each([
    ".worktrees/synthetic/tsconfig.json",
    ".claude/worktrees/synthetic/tsconfig.json",
  ])("keeps independent nested checkouts isolated at %s", (file) => {
    expect(watchIgnores(file)).toBe(true);
  });
});
