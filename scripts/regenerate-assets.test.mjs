import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(ROOT, "scripts", "regenerate-assets.sh");
const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function mockedRun(...arguments_) {
  const directory = mkdtempSync(join(tmpdir(), "regenerate-assets-test-"));
  temporaryDirectories.push(directory);
  const commandLog = join(directory, "commands.log");

  for (const command of ["node", "git"]) {
    const path = join(directory, command);
    writeFileSync(
      path,
      `#!/usr/bin/env bash\nprintf '%s %s\\n' '${command}' "$*" >> "$COMMAND_LOG"\n`,
    );
    chmodSync(path, 0o755);
  }

  const result = spawnSync("/bin/bash", [SCRIPT, ...arguments_], {
    cwd: ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      COMMAND_LOG: commandLog,
      PATH: `${directory}${delimiter}${process.env.PATH ?? ""}`,
    },
  });
  const commands =
    result.status === 0
      ? readFileSync(commandLog, "utf8").trim().split("\n")
      : [];
  return { ...result, commands };
}

describe("regenerate-assets.sh", () => {
  it("runs only content generators in fast mode", () => {
    const result = mockedRun("--fast");

    expect(result.status).toBe(0);
    expect(result.commands).toEqual([
      "node scripts/setup-assets.mjs",
      "node scripts/trox.mjs extract",
      "node scripts/trox.mjs check --deny warnings",
      "node scripts/trox.mjs bundle --allow-missing",
      "git status --short -- data",
    ]);
    expect(result.stdout).toContain("1/2  setup-assets");
    expect(result.stdout).toContain("fast content regeneration complete");
  });

  it("retains the complete regeneration sequence by default", () => {
    const result = mockedRun();

    expect(result.status).toBe(0);
    expect(
      result.commands.filter((command) => command.startsWith("node ")),
    ).toEqual([
      "node scripts/setup-assets.mjs",
      "node scripts/bake-merchant-corpus.mjs",
      "node scripts/setup-assets.mjs",
      "node scripts/generate-cumulus-tokens.mjs",
      "node scripts/generate-cumulus-metadata.mjs",
      "node scripts/generate-cumulus-docs.mjs",
      "node scripts/trox.mjs extract",
      "node scripts/trox.mjs check --deny warnings",
      "node scripts/trox.mjs bundle --allow-missing",
    ]);
  });

  it("rejects unsupported arguments", () => {
    const result = spawnSync("/bin/bash", [SCRIPT, "--quick"], {
      cwd: ROOT,
      encoding: "utf8",
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Unknown argument: --quick");
  });

  it("documents fast mode in help output", () => {
    const output = execFileSync("/bin/bash", [SCRIPT, "--help"], {
      cwd: ROOT,
      encoding: "utf8",
    });

    expect(output).toContain("./scripts/regenerate-assets.sh --fast");
    expect(output).toContain("routine RON content changes");
  });
});
