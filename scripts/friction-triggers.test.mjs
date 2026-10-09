// @vitest-environment node

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runFrictionTriggers } from "./friction-triggers.mjs";

const SCRIPT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "friction-triggers.mjs",
);

/** @type {string[]} */
const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

/**
 * @param {string} bead
 * @param {number | string} phase
 * @param {string[]} tags
 */
function frictionFile(bead, phase, tags) {
  return {
    bead,
    phase,
    friction: tags.map((tag) => ({ tag, minutes: 10, note: "x" })),
  };
}

/**
 * Writes a synthetic evidence directory.
 *
 * @param {{
 *   files?: ReturnType<typeof frictionFile>[],
 *   legacy?: unknown[],
 *   ledger?: unknown[],
 *   cadence?: number,
 * }} evidence
 */
function evidenceFixture({
  files = [],
  legacy = [],
  ledger = [],
  cadence = 3,
}) {
  const directory = mkdtempSync(join(tmpdir(), "friction-triggers-"));
  temporaryDirectories.push(directory);
  mkdirSync(join(directory, "friction"));
  for (const file of files) {
    writeFileSync(
      join(directory, "friction", `${file.bead}.json`),
      JSON.stringify(file),
    );
  }
  /** @param {unknown[]} lines */
  const jsonl = (lines) =>
    lines.map((line) => `${JSON.stringify(line)}\n`).join("");
  writeFileSync(join(directory, "friction.jsonl"), jsonl(legacy));
  writeFileSync(join(directory, "introspection.jsonl"), jsonl(ledger));
  writeFileSync(
    join(directory, "friction-tags.json"),
    JSON.stringify({
      triggerBeads: 3,
      retrospectiveCadence: cadence,
      aliases: { "slow-hook": "hook-misfire", "hook-refusal": "hook-misfire" },
    }),
  );
  return directory;
}

/** Three phase-2 beads hit one cause under aliases, one of them in legacy form. */
const ALIASED_TRIGGER = {
  files: [
    frictionFile("hv-a.1", 2, ["hook-misfire", "flaky"]),
    frictionFile("hv-a.2", 2, ["slow-hook", "hook-misfire"]),
    frictionFile("hv-a.3", 3, ["flaky", "hook-misfire"]),
    frictionFile("hv-a.4", 2, ["flaky"]),
  ],
  legacy: [{ bead: "hv-a.0", phase: 2, friction: ["hook-refusal"] }],
};

describe("friction triggers", () => {
  it("fires on a tag in three beads of one phase after alias normalization", () => {
    const { report } = runFrictionTriggers(evidenceFixture(ALIASED_TRIGGER));

    expect(report.triggers).toEqual([
      {
        phase: "2",
        tag: "hook-misfire",
        beads: ["hv-a.0", "hv-a.1", "hv-a.2"],
        disposition: null,
      },
    ]);
    expect(report.exitCode).toBe(1);
  });

  it("passes when every fired trigger has a disposition for its phase", () => {
    const dispositioned = runFrictionTriggers(
      evidenceFixture({
        ...ALIASED_TRIGGER,
        ledger: [{ tag: "slow-hook", phase: 2, reason: "harness issue" }],
      }),
    ).report;
    expect(
      dispositioned.triggers.map((trigger) => trigger.disposition),
    ).toEqual([
      {
        tag: "slow-hook",
        phase: "2",
        bead: undefined,
        reason: "harness issue",
      },
    ]);
    expect(dispositioned.exitCode).toBe(0);

    const otherPhase = runFrictionTriggers(
      evidenceFixture({
        ...ALIASED_TRIGGER,
        ledger: [{ tag: "hook-misfire", phase: 3, bead: "hv-b.1" }],
      }),
    ).report;
    expect(otherPhase.exitCode).toBe(1);
  });

  it("counts each phase's friction files outside every recorded retrospective", () => {
    const { report } = runFrictionTriggers(
      evidenceFixture({
        ...ALIASED_TRIGGER,
        ledger: [
          { retrospective: "2026-01-01", phase: 2, covers: ["hv-a.0"] },
          {
            retrospective: "2026-01-02",
            phase: 2,
            bead: "hv-r.1",
            covers: ["hv-a.1"],
          },
          { tag: "hook-misfire", phase: 2, bead: "hv-b.1" },
        ],
      }),
    );

    expect(report.cadence).toEqual([
      {
        phase: "2",
        frictionFiles: 4,
        uncovered: ["hv-a.2", "hv-a.4"],
        lastRetrospective: {
          date: "2026-01-02",
          phase: "2",
          bead: "hv-r.1",
          covers: ["hv-a.1"],
        },
        due: false,
      },
      {
        phase: "3",
        frictionFiles: 1,
        uncovered: ["hv-a.3"],
        lastRetrospective: null,
        due: false,
      },
    ]);
    expect(report.exitCode).toBe(0);

    const due = runFrictionTriggers(
      evidenceFixture({ ...ALIASED_TRIGGER, cadence: 2 }),
    ).report;
    expect(due.cadence.map(({ phase, due: isDue }) => [phase, isDue])).toEqual([
      ["2", true],
      ["3", false],
    ]);
  });

  it("rejects a disposition that names neither a bead nor a reason", () => {
    const directory = evidenceFixture({ ledger: [{ tag: "flaky", phase: 2 }] });

    expect(() => runFrictionTriggers(directory)).toThrow();
  });

  it("exits non-zero from the command line only on an undispositioned trigger", () => {
    /** @param {string} directory */
    const status = (directory) =>
      spawnSync(process.execPath, [SCRIPT, directory], { encoding: "utf8" })
        .status;

    expect(status(evidenceFixture(ALIASED_TRIGGER))).toBe(1);
    expect(
      status(
        evidenceFixture({
          ...ALIASED_TRIGGER,
          ledger: [{ tag: "hook-misfire", phase: 2, bead: "hv-b.1" }],
        }),
      ),
    ).toBe(0);
  });
});
