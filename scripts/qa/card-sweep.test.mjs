import { describe, expect, it, vi } from "vitest";
import { createSweepCounts, parseSweepArgs, runSweepCell } from "./card-sweep.mjs";

/** @param {string[]} failureKinds @param {string} verdict */
const report = (failureKinds = [], verdict = "fail") => ({
  result: { verdict, notes: "synthetic failure details", failureKinds },
  error: null, caps: [], log: [], captures: [], traces: [],
});

/** @param {unknown[]} outcomes */
async function cell(outcomes, closed = false) {
  const run = vi.fn();
  for (const outcome of outcomes) {
    if (outcome instanceof Error) run.mockRejectedValueOnce(outcome);
    else run.mockResolvedValueOnce(outcome);
  }
  /** @type {Record<string, unknown>[]} */
  const records = [];
  /** @type {import("./prelude.mjs").QaResult[]} */
  const saved = [];
  const result = await runSweepCell({ run, closed: () => closed,
    save: (raw, attempt) => { saved.push(raw); return `attempt-${String(attempt)}.json`; },
    record: (line) => records.push(line) });
  return { result, records, saved };
}

describe("sweep cell attempts", () => {
  it("parses explicit cell selection and rejects malformed execution budgets", () => {
    const uuid = "5e5e5e5e-0000-4000-8000-000000000002";
    expect(parseSweepArgs(["--bead", "synthetic", "--cards", uuid, "--variants", "amplified",
      "--as", "enemy", "--timeout", "45", "--port", "5176", "--capture"])).toEqual({
      bead: "synthetic", cards: [uuid], variants: ["base", "amplified"], sides: ["enemy"],
      timeoutS: 45, port: 5176, capture: true,
    });
    for (const extra of [["--timeout"], ["--timeout", "0"], ["--timeout", "invalid"]]) {
      expect(() => parseSweepArgs(["--bead", "synthetic", "--cards", uuid, ...extra])).toThrow();
    }
  });
  it("retains a timeout failure and one successful retry with only the final cell effective", async () => {
    const first = report(["timeout"]);
    const second = report([], "pass");
    const result = await cell([first, second]);
    expect(result.saved).toEqual([first, second]);
    expect(result.records.map(({ verdict, attempt, effective, rawReport }) => ({ verdict, attempt, effective, rawReport }))).toEqual([
      { verdict: "fail", attempt: 1, effective: false, rawReport: "attempt-1.json" },
      { verdict: "pass", attempt: 2, effective: true, rawReport: "attempt-2.json" },
    ]);
    expect(result.result.verdict).toBe("pass");
    const totals = createSweepCounts();
    result.records.forEach(totals.record);
    expect(totals.counts).toEqual({ pass: 1 });
    expect(totals.attemptCounts).toEqual({ fail: 1, pass: 1 });
  });

  it("stops after the second timeout and preserves both raw failures", async () => {
    const result = await cell([report(["timeout"]), report(["timeout"]), report([], "pass")]);
    expect(result.saved).toHaveLength(2);
    expect(result.records.map(({ effective }) => effective)).toEqual([false, true]);
    expect(result.result.verdict).toBe("fail");
  });

  it("never retries mixed semantic failures, missing classification, caps, report errors or transport exceptions", async () => {
    const caps = { ...report(["timeout"]), caps: [{ href: "synthetic", caps: { errors: ["synthetic product error"], rejections: [], consoleErrors: [] } }] };
    const thrown = Object.assign(new Error("synthetic transport timeout"), { name: "QaTimeoutError" });
    for (const failure of [report(["timeout", "product"]), report(["unknown"]), report([]), { ...report([]), result: "malformed" }, caps,
      { ...report(["timeout"]), error: "synthetic report failure" }, thrown]) {
      const result = await cell([failure, report([], "pass")]);
      expect(result.saved).toHaveLength(1);
      expect(result.records[0]?.effective).toBe(true);
      expect(result.result.verdict).toBe("fail");
    }
    expect((await cell([report(["timeout"])], true)).saved).toHaveLength(1);
  });
});
