// @vitest-environment node

import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  DISPOSABLE_WORKSPACE_FILES,
  prepareWorkspace,
  WORKSPACE_GENERATORS,
} from "./prepare-workspace.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("prepareWorkspace", () => {
  it("runs every workspace generator in dependency order", () => {
    /** @type {import("vitest").Mock<(command: string, args: string[]) => void>} */
    const run = vi.fn();

    prepareWorkspace({ root: "/fixture", run });

    expect(run.mock.calls.map(([, args]) => args.at(-1))).toEqual(
      WORKSPACE_GENERATORS.map(({ script }) => `/fixture/${script}`),
    );
    expect(run).toHaveBeenCalledTimes(WORKSPACE_GENERATORS.length);
  });

  it("stops immediately when a generator fails", () => {
    const failure = new Error("fixture failure");
    const run = vi
      .fn()
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw failure;
      });

    expect(() => prepareWorkspace({ root: "/fixture", run })).toThrow(failure);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("keeps every disposable workspace file out of version control", () => {
    const tracked = new Set(
      execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" })
        .split("\n")
        .filter(Boolean),
    );

    expect(DISPOSABLE_WORKSPACE_FILES.filter((path) => tracked.has(path))).toEqual(
      [],
    );
  });
});
