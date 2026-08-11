import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { assertDirectoriesEqual, copyDistributable, syncTroxRuntime } from "./sync-trox-runtime.mjs";
import { pinnedTroxRevision, resolveTroxRoot, troxInvocation, verifyTroxRevision } from "./trox.mjs";

describe("Trox wrappers", () => {
  it("rejects a missing checkout and a different revision", () => {
    expect(() => verifyTroxRevision("/missing", () => { throw new Error("missing"); })).toThrow(/Unable to read/);
    expect(() => verifyTroxRevision("/fixture", () => `${"0".repeat(40)}\n`)).toThrow(/revision mismatch/);
  });

  it("forwards CLI arguments after the pinned config", () => {
    const invocation = troxInvocation("/trox", ["extract", "--locale", "es"]);
    expect(invocation.command).toBe("cargo");
    expect(invocation.arguments.slice(-3)).toEqual(["extract", "--locale", "es"]);
    expect(invocation.arguments).toContain("--locked");
    expect(troxInvocation("/trox", ["check"], "/tmp/fixture.ron").arguments)
      .toContain("/tmp/fixture.ron");
  });

  it("surfaces an upstream build failure before replacing vendored output", () => {
    expect(() => syncTroxRuntime({
      troxRoot: resolveTroxRoot(),
      commands: [[process.execPath, ["-e", "process.exit(7)"]]],
    })).toThrow();
  });

  it("copies only distributable package output and verifies deterministic bytes", () => {
    const root = mkdtempSync(resolve(tmpdir(), "trox-wrapper-test-"));
    try {
      const upstream = resolve(root, "upstream");
      const first = resolve(root, "first");
      const second = resolve(root, "second");
      mkdirSync(resolve(upstream, "packages/trox/dist"), { recursive: true });
      writeFileSync(resolve(upstream, "packages/trox/package.json"), JSON.stringify({ name: "@trox/runtime" }));
      writeFileSync(resolve(upstream, "packages/trox/dist/index.js"), "export {};\n");
      writeFileSync(resolve(upstream, "packages/trox/dist/index.d.ts"), "export {};\n");
      writeFileSync(resolve(upstream, "packages/trox/dist/ignored.map"), "map\n");
      writeFileSync(resolve(upstream, "README.md"), "readme\n");
      writeFileSync(resolve(upstream, "LICENSE.txt"), "license\n");
      copyDistributable(upstream, first);
      copyDistributable(upstream, second);
      mkdirSync(resolve(first, "node_modules/ignored"), { recursive: true });
      writeFileSync(resolve(first, "node_modules/ignored/package.json"), "{}\n");
      assertDirectoriesEqual(first, second);
      expect(readFileSync(resolve(first, "UPSTREAM_REVISION"), "utf8").trim()).toBe(pinnedTroxRevision());
      expect(() => readFileSync(resolve(first, "dist/ignored.map"))).toThrow();
      writeFileSync(resolve(second, "dist/index.js"), "changed\n");
      expect(() => assertDirectoriesEqual(first, second)).toThrow(/not byte-identical/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
