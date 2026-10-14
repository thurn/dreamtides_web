// @vitest-environment node

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  readFrictionRecords,
  runFrictionTriggers,
  validateFrictionEvidence,
} from "./friction-triggers.mjs";

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
    hostLoad: 2.5,
    implementMin: 4,
    implementWindow: { start: "2026-01-01T00:00:00Z", end: "2026-01-01T00:04:00Z" },
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
 *   phaseCadence?: Record<string, number>,
 *   unknowns?: unknown,
 *   exempt?: unknown,
 * }} evidence
 */
function evidenceFixture({
  files = [],
  legacy = [],
  ledger = [],
  cadence = 3,
  phaseCadence = {},
  unknowns = [],
  exempt = [],
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
      phaseRetrospectiveCadence: phaseCadence,
      historicalUnknowns: unknowns,
      implementWindowExempt: exempt,
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

  it("applies a phase's own retrospective cadence in place of the default", () => {
    /** @param {Record<string, number>} phaseCadence */
    const report = (phaseCadence) =>
      runFrictionTriggers(
        evidenceFixture({ ...ALIASED_TRIGGER, cadence: 2, phaseCadence }),
      ).report.cadence.map(({ phase, due }) => [phase, due]);

    expect(report({ 2: 5 })).toEqual([
      ["2", false],
      ["3", false],
    ]);
    expect(report({ 3: 1 })).toEqual([
      ["2", true],
      ["3", true],
    ]);
  });

  it("rejects a disposition that names neither a bead nor a reason", () => {
    const directory = evidenceFixture({ ledger: [{ tag: "flaky", phase: 2 }] });

    expect(() => runFrictionTriggers(directory)).toThrow();
  });

  it("reports valid, undispositioned and malformed evidence through the command line", () => {
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
    const malformed = spawnSync(process.execPath, [SCRIPT, recordFixture({ ...validRecord(), hostLoad: "3" })], { encoding: "utf8" });
    expect(malformed.status).toBe(2);
    expect(malformed.stderr).toContain("hv-synthetic.json");
    expect(malformed.stderr).toContain("hostLoad");
  });
});

/** @param {unknown} record @param {unknown} unknowns @param {unknown} exempt */
function recordFixture(record, unknowns = [], exempt = []) {
  const directory = evidenceFixture({ unknowns, exempt });
  /** @param {string} _key @param {unknown} value */
  const overflowNumber = (_key, value) =>
    value === Infinity
      ? "__positive_overflow__"
      : value === -Infinity
        ? "__negative_overflow__"
        : value;
  writeFileSync(
    join(directory, "friction", "hv-synthetic.json"),
    JSON.stringify(record, overflowNumber)
      .replaceAll('"__positive_overflow__"', "1e400")
      .replaceAll('"__negative_overflow__"', "-1e400"),
  );
  return directory;
}

/** @returns {Record<string, unknown> & { friction: Record<string, unknown>[] }} */
const validRecord = () => frictionFile("hv-synthetic", 5, ["test-tag"]);
/** @param {string} field */
const historicalUnknown = (field = "hostLoad") => ({
  bead: "hv-synthetic",
  field,
  sourceSHA256: "a".repeat(64),
  reason: "Historical observation was not recorded in the audited evidence.",
});

/** @type {{ field: string, value: unknown }[]} */
const malformedFields = [];
for (const field of ["hostLoad", "implementMin", "minutes"]) {
  for (const value of [undefined, null, "3", [], {}, true, Infinity, -Infinity, NaN]) {
    malformedFields.push({ field, value });
  }
}
for (const value of [undefined, null, 1, [], {}]) malformedFields.push({ field: "note", value });
for (const value of [undefined, null, "", "Bad Tag", "snake_case", "bad--tag", "-tag", "tag-"]) {
  malformedFields.push({ field: "tag", value });
}
for (const value of [undefined, null, {}, "bare", ["bare-tag"], [null], [1], [[]]]) {
  malformedFields.push({ field: "friction", value });
}

describe("friction record schema", () => {
  it.each(malformedFields)("rejects malformed $field ($value) through the reader", ({ field, value }) => {
    const record = validRecord();
    const object = ["minutes", "note", "tag"].includes(field) ? record.friction[0] : record;
    if (value === undefined) delete object[field];
    else object[field] = value;
    const directory = recordFixture(record);
    expect(() => readFrictionRecords(directory)).toThrow();
  });

  it("accepts finite zero/fractional measurements, string notes and extra fields", () => {
    const record = { ...validRecord(), hostLoad: 0, implementMin: 4.25, extra: { preserved: true },
      friction: [{ tag: "test-tag", minutes: 0, note: "", seconds: 0 }] };
    expect(readFrictionRecords(recordFixture(record))[0].tags).toEqual(["test-tag"]);
    expect(runFrictionTriggers(recordFixture({ ...record, friction: [] })).report.exitCode).toBe(0);
  });

  it("keeps legacy bare-tag JSONL separate from strict per-bead records", () => {
    const directory = evidenceFixture({ legacy: [{ bead: "hv-legacy", phase: 2, friction: ["legacy-tag"] }] });
    expect(readFrictionRecords(directory)[0].tags).toEqual(["legacy-tag"]);
    expect(runFrictionTriggers(directory).report.exitCode).toBe(0);
  });

  it.each(["hostLoad", "implementMin", "friction[0].minutes"])("surfaces an exact historical null $field with provenance", (field) => {
    const record = validRecord();
    if (field === "friction[0].minutes") record.friction[0].minutes = null;
    else record[field] = null;
    const unknown = historicalUnknown(field);
    const directory = recordFixture(record, [unknown]);
    expect(readFrictionRecords(directory)[0].unknownMeasurements).toEqual([unknown]);
    const result = runFrictionTriggers(directory);
    expect(result.report.unknownMeasurements).toEqual([unknown]);
    expect(result.report.exitCode).toBe(0);
    expect(result.text).toContain("UNKNOWN");
    expect(result.text).toContain(unknown.reason);
    const cli = spawnSync(process.execPath, [SCRIPT, directory], { encoding: "utf8" });
    expect(cli.status).toBe(0);
    expect(cli.stdout).toContain("UNKNOWN");
  });

  it.each([undefined, "3", {}, [], true])("accepts only explicit null at a configured historical field ($value)", (value) => {
    const record = validRecord();
    if (value === undefined) delete record.hostLoad;
    else record.hostLoad = value;
    const directory = recordFixture(record, [historicalUnknown()]);
    expect(() => readFrictionRecords(directory)).toThrow();
  });

  it("does not exempt a different bead, field or entry index", () => {
    const record = { ...validRecord(), hostLoad: null };
    expect(() => readFrictionRecords(recordFixture(record, [{ ...historicalUnknown(), bead: "hv-other" }]))).toThrow();
    expect(() => readFrictionRecords(recordFixture(record, [historicalUnknown("implementMin")]))).toThrow();
    const entry = validRecord();
    entry.friction[0].minutes = null;
    expect(() => readFrictionRecords(recordFixture(entry, [historicalUnknown("friction[1].minutes")]))).toThrow();
  });

  it.each([
    null, {}, { ...historicalUnknown(), field: "note" },
    { ...historicalUnknown(), field: "friction[00].minutes" },
    { ...historicalUnknown(), sourceSHA256: "bad" },
    { ...historicalUnknown(), bead: "" }, { ...historicalUnknown(), reason: "" },
  ])("rejects invalid historical exemption configuration ($value)", (unknown) => {
    expect(() => runFrictionTriggers(recordFixture(validRecord(), [unknown]))).toThrow();
  });

  it("rejects an exemption collection with the wrong shape or duplicate field", () => {
    for (const unknowns of [null, {}, [historicalUnknown(), historicalUnknown()]]) {
      expect(() => runFrictionTriggers(recordFixture(validRecord(), unknowns))).toThrow();
    }
  });
});

describe("friction evidence validation", () => {
  /** @param {string} directory */
  const validate = (directory) =>
    spawnSync(process.execPath, [SCRIPT, "--validate-records", directory], {
      encoding: "utf8",
    });

  it("passes a well-formed record and counts historical unknowns", () => {
    const record = { ...validRecord(), hostLoad: null };
    expect(
      validateFrictionEvidence(recordFixture(record, [historicalUnknown()])),
    ).toEqual({ records: 1, unknownMeasurements: 1 });
    expect(validate(recordFixture(validRecord())).status).toBe(0);
  });

  it("passes on an undispositioned trigger that the full report fails", () => {
    const directory = evidenceFixture(ALIASED_TRIGGER);
    expect(runFrictionTriggers(directory).report.exitCode).toBe(1);
    expect(validateFrictionEvidence(directory).records).toBe(5);
    expect(validate(directory).status).toBe(0);
  });

  it("exits 2 naming the file of a malformed record", () => {
    const directory = recordFixture({ ...validRecord(), hostLoad: "3" });
    expect(() => validateFrictionEvidence(directory)).toThrow();
    const cli = validate(directory);
    expect(cli.status).toBe(2);
    expect(cli.stderr).toContain("hv-synthetic.json");
  });

  it("exits 2 naming the file of a record that is not JSON", () => {
    const directory = evidenceFixture({});
    writeFileSync(join(directory, "friction", "hv-synthetic.json"), "{");
    const cli = validate(directory);
    expect(cli.status).toBe(2);
    expect(cli.stderr).toContain("hv-synthetic.json");
  });

  it("exits 2 on a malformed introspection ledger line", () => {
    const directory = evidenceFixture({ ledger: [{ tag: "x", phase: 2 }] });
    expect(() => validateFrictionEvidence(directory)).toThrow();
    expect(validate(directory).status).toBe(2);
  });

  it("exits 2 on an unrecognized flag", () => {
    const cli = spawnSync(
      process.execPath,
      [SCRIPT, "--validate", evidenceFixture({})],
      { encoding: "utf8" },
    );
    expect(cli.status).toBe(2);
  });
});

describe("friction record implement window", () => {
  /** @param {string} directory */
  const validate = (directory) =>
    spawnSync(process.execPath, [SCRIPT, "--validate-records", directory], {
      encoding: "utf8",
    });

  /**
   * @param {string} directory
   * @param {string} field
   */
  const expectRejected = (directory, field) => {
    expect(() => validateFrictionEvidence(directory)).toThrow(field);
  };

  /** @param {unknown} start @param {unknown} end @param {number} implementMin */
  const windowed = (start, end, implementMin = 4) => ({
    ...validRecord(),
    implementMin,
    implementWindow: { start, end },
  });

  it("requires a window on a record whose bead is not exempt", () => {
    const record = validRecord();
    delete record.implementWindow;
    expectRejected(recordFixture(record), "implementWindow");
    expectRejected(recordFixture({ ...record, implementWindow: "4m" }), "implementWindow");
    expectRejected(recordFixture(record, [], ["hv-other"]), "implementWindow");
    const cli = validate(recordFixture(record));
    expect(cli.status).toBe(2);
    expect(cli.stderr).toContain("hv-synthetic.json");
    expect(cli.stderr).toContain("implementWindow");
  });

  it("accepts an exempt record without a window", () => {
    const record = validRecord();
    delete record.implementWindow;
    const directory = recordFixture(record, [], ["hv-synthetic"]);
    expect(validateFrictionEvidence(directory).records).toBe(1);
    expect(validate(directory).status).toBe(0);
  });

  it.each([
    { start: "2026-01-01T00:00:00Z", end: "2026-01-01T00:04:00Z", implementMin: 4 },
    { start: "2026-01-01T00:00Z", end: "2026-01-01T00:05:00.000Z", implementMin: 4 },
    { start: "2026-01-01T01:00:00+01:00", end: "2026-01-01T00:03:00Z", implementMin: 4 },
    { start: "2025-12-31T23:59:30-00:30", end: "2026-01-01T00:33:30Z", implementMin: 4 },
  ])("accepts a consistent window ($start to $end for $implementMin min)", ({ start, end, implementMin }) => {
    const directory = recordFixture(windowed(start, end, implementMin));
    expect(validateFrictionEvidence(directory).records).toBe(1);
  });

  it.each([5.5, 2.5, 40])("rejects implementMin %s against a 4-minute window", (implementMin) => {
    expectRejected(recordFixture(windowed("2026-01-01T00:00:00Z", "2026-01-01T00:04:00Z", implementMin)), "implementMin");
  });

  it("checks an exempt record's window when it has one", () => {
    const record = windowed("2026-01-01T00:00:00Z", "2026-01-01T00:30:00Z");
    expectRejected(recordFixture(record, [], ["hv-synthetic"]), "implementMin");
  });

  it.each([
    ["2026-01-01T00:04:00Z", "2026-01-01T00:04:00Z"],
    ["2026-01-01T00:04:00Z", "2026-01-01T00:00:00Z"],
    ["2026-01-01T00:00:00Z", "2026-01-01T00:30:00+01:00"],
  ])("rejects a window that does not end after it starts (%s to %s)", (start, end) => {
    expectRejected(recordFixture(windowed(start, end, 0)), "implementWindow.end");
  });

  it.each([
    "2026-01-01T00:00:00",
    "2026-01-01 00:00:00Z",
    "2026-01-01",
    "2026-01-01T00:00:00+0100",
    "2026-02-30T00:00:00Z",
    "2026-13-01T00:00:00Z",
    "2026-01-01T24:00:00Z",
    "2026-01-01T00:00:00+24:00",
    "",
    1767225600000,
    null,
  ])("rejects a malformed or offset-free start timestamp (%s)", (start) => {
    expectRejected(recordFixture(windowed(start, "2026-01-01T00:04:00Z")), "implementWindow.start");
  });

  it("rejects a malformed end timestamp", () => {
    expectRejected(recordFixture(windowed("2026-01-01T00:00:00Z", "2026-01-01T00:04:00")), "implementWindow.end");
  });

  it.each([{}, "hv-synthetic", [""], [1], ["hv-synthetic", "hv-synthetic"]])(
    "rejects an invalid exemption list (%j)",
    (exempt) => {
      expect(() => validateFrictionEvidence(recordFixture(validRecord(), [], exempt))).toThrow("implementWindowExempt");
    },
  );
});
