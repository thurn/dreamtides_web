// @vitest-environment node

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { formatFluent } from "./fluent-format.mjs";

const formatterPath = fileURLToPath(
  new URL("./format-fluent.mjs", import.meta.url),
);

function runFormatter(cwd, ...args) {
  return spawnSync(process.execPath, [formatterPath, ...args], {
    cwd,
    encoding: "utf8",
  });
}

describe("Fluent formatting", () => {
  it("canonicalizes syntax and is idempotent", () => {
    const source = `### Synthetic fixture
item-count = { $count ->
  [one] One item
 *[other] { $count } items
 }
`;

    const formatted = formatFluent(source);

    expect(formatted).toContain("item-count =\n    { $count ->");
    expect(formatted).toContain("        [one] One item");
    expect(formatted).toContain("       *[other] { $count } items");
    expect(formatFluent(formatted)).toBe(formatted);
  });

  it("reports syntax errors with their source location", () => {
    expect(() => formatFluent("message = {\n", "fixture.ftl")).toThrow(
      "fixture.ftl:2:1: Expected an inline expression",
    );
  });

  it("enforces check and write modes", () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), "fluent-format-cli-"));
    try {
      const fluentPath = join(fixtureRoot, "fixture.ftl");
      writeFileSync(fluentPath, "message ={ $value }\n");

      const driftedCheck = runFormatter(fixtureRoot, "--check", "fixture.ftl");
      expect(driftedCheck.status).toBe(1);
      expect(driftedCheck.stderr).toContain("fixture.ftl");

      const write = runFormatter(fixtureRoot, "fixture.ftl");
      expect(write.status).toBe(0);
      expect(write.stdout).toContain("Formatted 1 of 1 Fluent files.");
      expect(readFileSync(fluentPath, "utf8")).toBe("message = { $value }\n");

      const cleanCheck = runFormatter(fixtureRoot, "--check", "fixture.ftl");
      expect(cleanCheck.status).toBe(0);
      expect(cleanCheck.stdout).toContain("Fluent formatting is current");
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});
