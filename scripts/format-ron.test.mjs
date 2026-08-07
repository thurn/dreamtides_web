// @vitest-environment node

import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const formatterPath = fileURLToPath(new URL("./format-ron.mjs", import.meta.url));

function runFormatter(cwd, ...args) {
  return spawnSync(process.execPath, [formatterPath, ...args], {
    cwd,
    encoding: "utf8",
  });
}

it("discovers RON files and enforces check and write modes", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "ron-format-cli-"));
  try {
    execFileSync("git", ["init", "--quiet"], { cwd: fixtureRoot });
    writeFileSync(
      join(fixtureRoot, ".ronfmt.json"),
      `${JSON.stringify({ indentWidth: 2, printWidth: 120 }, null, 2)}\n`,
    );
    const ronPath = join(fixtureRoot, "fixture.ron");
    writeFileSync(ronPath, "Thing( value: [ 1, 2, ], )\n");

    const driftedCheck = runFormatter(fixtureRoot, "--check");
    expect(driftedCheck.status).toBe(1);
    expect(driftedCheck.stderr).toContain("fixture.ron");

    const write = runFormatter(fixtureRoot);
    expect(write.status).toBe(0);
    expect(write.stdout).toContain("Formatted 1 of 1 RON files.");
    expect(readFileSync(ronPath, "utf8")).toBe("Thing(value: [1, 2])\n");

    const cleanCheck = runFormatter(fixtureRoot, "--check");
    expect(cleanCheck.status).toBe(0);
    expect(cleanCheck.stdout).toContain("RON formatting is current");

    execFileSync("git", ["add", "fixture.ron"], { cwd: fixtureRoot });
    rmSync(ronPath);
    const deletedCheck = runFormatter(fixtureRoot, "--check");
    expect(deletedCheck.status).toBe(0);
    expect(deletedCheck.stdout).toContain("0 files checked");
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
