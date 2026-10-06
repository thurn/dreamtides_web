import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  nodeTypecheckArgs,
  publishTypecheckState,
  seedTypecheckState,
  sharesTypecheckState,
  typecheckArgs,
  typecheckStatePaths,
} from "./typecheck-cache.mjs";

/** @type {string[]} */
const temps = [];

function workspace() {
  const dir = mkdtempSync(join(tmpdir(), "typecheck-cache-"));
  temps.push(dir);
  return typecheckStatePaths({
    root: join(dir, "worktree"),
    commonGitDir: join(dir, "git"),
  });
}

/**
 * @param {string} path
 * @param {string} text
 */
function write(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("typecheck state sharing", () => {
  it("keeps the exhaustive tasks off the shared state", () => {
    for (const task of ["full", "lint-full", "test-full"]) {
      expect(sharesTypecheckState(task)).toBe(false);
    }
    for (const task of ["quick", "typecheck"]) {
      expect(sharesTypecheckState(task)).toBe(true);
    }
  });

  it("typechecks with declaration-only incremental emit into the worktree cache", () => {
    const paths = workspace();
    const args = typecheckArgs({ tsc: "tsc", paths, extraArgs: ["--pretty"] });
    expect(args).toContain("--emitDeclarationOnly");
    expect(args).toContain("--incremental");
    expect(args[args.indexOf("--tsBuildInfoFile") + 1]).toBe(paths.buildInfo);
    expect(args[args.indexOf("--outDir") + 1]).toBe(paths.declarations);
    expect(args.at(-1)).toBe("--pretty");
  });

  it("typechecks the node project incrementally with worktree-local build info", () => {
    const paths = workspace();
    const args = nodeTypecheckArgs({ tsc: "tsc", paths });
    expect(args[args.indexOf("-p") + 1]).toBe("tsconfig.node.json");
    expect(args).toContain("--incremental");
    expect(args[args.indexOf("--tsBuildInfoFile") + 1]).toBe(paths.nodeBuildInfo);
    expect(paths.nodeBuildInfo).not.toBe(paths.buildInfo);
    expect(paths.nodeBuildInfo.startsWith(dirname(paths.buildInfo))).toBe(true);
  });

  it("seeds a worktree without build info from the shared copy", () => {
    const paths = workspace();
    write(paths.sharedBuildInfo, "shared");
    expect(seedTypecheckState(paths)).toBe(true);
    expect(readFileSync(paths.buildInfo, "utf8")).toBe("shared");
  });

  it("never replaces a worktree's own build info and tolerates no shared copy", () => {
    const paths = workspace();
    expect(seedTypecheckState(paths)).toBe(false);
    expect(existsSync(paths.buildInfo)).toBe(false);
    write(paths.buildInfo, "local");
    write(paths.sharedBuildInfo, "shared");
    expect(seedTypecheckState(paths)).toBe(false);
    expect(readFileSync(paths.buildInfo, "utf8")).toBe("local");
  });

  it("publishes the worktree's build info without leaving staged files", () => {
    const paths = workspace();
    expect(publishTypecheckState(paths, 7)).toBe(false);
    write(paths.buildInfo, "local");
    write(paths.sharedBuildInfo, "old");
    expect(publishTypecheckState(paths, 7)).toBe(true);
    expect(readFileSync(paths.sharedBuildInfo, "utf8")).toBe("local");
    expect(readdirSync(dirname(paths.sharedBuildInfo))).toEqual([
      "tsconfig.tsbuildinfo",
    ]);
  });
});
