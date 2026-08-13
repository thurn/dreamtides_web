import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { bumpTrox, updateTroxPins } from "./bump-trox.mjs";

const PREVIOUS_REVISION = "1".repeat(40);
const NEXT_REVISION = "2".repeat(40);

function createFixture() {
  const root = mkdtempSync(resolve(tmpdir(), "quest-bump-trox-"));
  mkdirSync(resolve(root, "tools/game-data"), { recursive: true });
  writeFileSync(resolve(root, ".trox-revision"), `${PREVIOUS_REVISION}\n`);
  writeFileSync(
    resolve(root, "tools/game-data/Cargo.toml"),
    `[dependencies]\ntrox = { git = "https://github.com/thurn/trox.git", rev = "${PREVIOUS_REVISION}" }\n`,
  );
  return root;
}

describe("Trox version bump", () => {
  it("updates the repository pin and Rust dependency together", () => {
    const root = createFixture();
    try {
      updateTroxPins({
        questRoot: root,
        previousRevision: PREVIOUS_REVISION,
        nextRevision: NEXT_REVISION,
      });
      expect(readFileSync(resolve(root, ".trox-revision"), "utf8")).toBe(`${NEXT_REVISION}\n`);
      expect(readFileSync(resolve(root, "tools/game-data/Cargo.toml"), "utf8"))
        .toContain(`rev = "${NEXT_REVISION}"`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("runs dependency, runtime, lockfile, and bundle updates for Trox HEAD", () => {
    const root = createFixture();
    const troxRoot = resolve(root, "trox");
    mkdirSync(troxRoot);
    const commands = [];
    const run = (command, arguments_, options) => {
      commands.push([command, arguments_, options.cwd]);
      if (command === "git" && arguments_[0] === "status") return "\n";
      if (command === "git" && arguments_[0] === "rev-parse") return `${NEXT_REVISION}\n`;
      return undefined;
    };
    const syncRuntime = vi.fn();
    const runTroxCommand = vi.fn();
    try {
      expect(bumpTrox({
        environment: {},
        questRoot: root,
        run,
        runTroxCommand,
        syncRuntime,
        troxRoot,
      })).toEqual({
        previousRevision: PREVIOUS_REVISION,
        nextRevision: NEXT_REVISION,
      });

      expect(commands.filter(([command]) => command === "cargo")[0][1]).toEqual([
        "update",
        "--manifest-path",
        resolve(root, "tools/game-data/Cargo.toml"),
        "-p",
        "trox",
      ]);
      expect(commands.filter(([command]) => command === "npm")[0][1])
        .toContain("--package-lock-only");
      expect(syncRuntime).toHaveBeenCalledWith(expect.objectContaining({
        troxRoot,
        verifyRevision: true,
      }));
      expect(runTroxCommand.mock.calls.map(([arguments_]) => arguments_)).toEqual([
        ["extract"],
        ["check"],
        ["bundle", "--allow-missing"],
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects a dirty Trox checkout before modifying Quest", () => {
    const root = createFixture();
    const troxRoot = resolve(root, "trox");
    mkdirSync(troxRoot);
    const run = (_command, _arguments, options) => options.cwd === troxRoot ? " M src/lib.rs\n" : "\n";
    try {
      expect(() => bumpTrox({ environment: {}, questRoot: root, run, troxRoot }))
        .toThrow(/Trox checkout.*must be clean/);
      expect(readFileSync(resolve(root, ".trox-revision"), "utf8"))
        .toBe(`${PREVIOUS_REVISION}\n`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
