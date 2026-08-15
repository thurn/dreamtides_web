// @vitest-environment node

import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DISPOSABLE_WORKSPACE_FILES } from "./prepare-workspace.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("generated workspace files", () => {
  it("keeps every disposable runtime/code artifact out of version control", () => {
    const tracked = new Set(
      execFileSync("git", ["ls-files"], {
        cwd: ROOT,
        encoding: "utf8",
      })
        .split("\n")
        .filter(Boolean),
    );

    expect(DISPOSABLE_WORKSPACE_FILES.filter((path) => tracked.has(path))).toEqual(
      [],
    );
    expect(
      [...tracked].filter(
        (path) =>
          path.startsWith(".llms/skills/cumulus/components/") ||
          path === ".llms/skills/cumulus/tokens.md",
      ),
    ).toEqual([]);
  });
});
