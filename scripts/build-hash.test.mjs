// @vitest-environment node

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveBuildHash } from "./build-hash.mjs";

const fixtures = [];

function git(rootDir, args) {
  execFileSync("git", args, {
    cwd: rootDir,
    stdio: "ignore",
  });
}

function fixture() {
  const rootDir = mkdtempSync(path.join(tmpdir(), "journey-build-hash-"));
  fixtures.push(rootDir);
  mkdirSync(path.join(rootDir, "public"));
  writeFileSync(path.join(rootDir, ".gitignore"), "public/\n");
  writeFileSync(path.join(rootDir, "source.ts"), "export const value = 1;\n");
  writeFileSync(path.join(rootDir, "public", "tutorial-data.json"), "{\"step\":1}\n");
  git(rootDir, ["init"]);
  git(rootDir, ["config", "user.email", "test@example.com"]);
  git(rootDir, ["config", "user.name", "Test"]);
  git(rootDir, ["add", ".gitignore", "source.ts"]);
  git(rootDir, ["commit", "-m", "fixture"]);
  return rootDir;
}

afterEach(() => {
  for (const rootDir of fixtures.splice(0)) {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

describe("resolveBuildHash", () => {
  it("is stable for equivalent clean checkouts", () => {
    const rootDir = fixture();
    expect(resolveBuildHash(rootDir)).toBe(resolveBuildHash(rootDir));
  });

  it("distinguishes different uncommitted source content at one commit", () => {
    const rootDir = fixture();
    writeFileSync(path.join(rootDir, "source.ts"), "export const value = 2;\n");
    const firstDirtyBuild = resolveBuildHash(rootDir);
    writeFileSync(path.join(rootDir, "source.ts"), "export const value = 3;\n");
    expect(resolveBuildHash(rootDir)).not.toBe(firstDirtyBuild);
  });

  it("distinguishes generated runtime catalog drift at one commit", () => {
    const rootDir = fixture();
    const cleanBuild = resolveBuildHash(rootDir);
    writeFileSync(path.join(rootDir, "public", "tutorial-data.json"), "{\"step\":2}\n");
    expect(resolveBuildHash(rootDir)).not.toBe(cleanBuild);
  });
});
