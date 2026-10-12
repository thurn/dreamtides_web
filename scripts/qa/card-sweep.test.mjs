import { describe, expect, it, vi } from "vitest";
import { createSweepCounts, parseSweepArgs, runSweepCell, sweepCards } from "./card-sweep.mjs";
import cardLabPlay from "./scenarios/card-lab-play.mjs";

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
  for (const invalid of [null, "splitBatch", "wrongDaySide", "missingDraw"]) it(`checks durable normal-turn draw evidence at Dusk (${String(invalid)})`, async () => {
    const uuid = "5e5e5e5e-0000-4000-8000-000000000e06";
    const lab = { card: uuid, status: "ready", reason: null, detail: null, eligibleVariants: ["base"], entityKind: "dreamwell", cardStatus: "pending", cardType: "Dreamwell" };
    const draw = { kind: "dreamwellDrawn", side: "enemy", card: uuid, energyAdded: 0 };
    const committed = { instances: {}, stack: [], result: null, turn: { active: "enemy", phase: "dusk" }, dreamwell: { next: 1 }, sides: { enemy: { currentEnergy: 2, maxEnergy: 2 } } };
    const events = [
      ...(invalid === "missingDraw" ? [] : [{ seq: 7, index: 2, event: draw }]),
      { seq: invalid === "splitBatch" ? 8 : 7, index: 3, event: { kind: "energyChanged", side: "enemy", cause: "refresh", current: 2, max: 2, maxChange: 0 } },
      { seq: invalid === "splitBatch" ? 8 : 7, index: 8, event: { kind: "phaseChanged", active: invalid === "wrongDaySide" ? "player" : "enemy", phase: "day" } },
    ];
    vi.stubGlobal("window", { __cardLab: lab, __engineProbe: { slice: { committed, inFlight: null }, decision: { side: "player" }, pending: null, events } });
    try {
      const qa = /** @type {import("./prelude.mjs").Qa} */ (/** @type {unknown} */ ({
        args: { card: uuid, variant: "base", as: "enemy" }, viewport: { width: 1440, height: 900 },
        open: async () => {}, waitVisible: async () => {},
        waitFor: (/** @type {string} */ _label, /** @type {() => unknown} */ observe) => Promise.resolve(observe()),
        read: (/** @type {(arg: unknown) => unknown} */ observe, /** @type {unknown} */ arg) => Promise.resolve(observe(arg)),
        caps: () => Promise.resolve({ errors: [], rejections: [], consoleErrors: [] }),
        isTimeout: () => false,
        battle: { playUntil: async (/** @type {(state: { canPass: boolean }) => Promise<boolean>} */ settled) => {
          if (!await settled({ canPass: true })) throw new Error("normal-turn evidence was not accepted");
          return { answers: 0, passes: 0 };
        } },
      }));
      expect(await cardLabPlay(qa)).toMatchObject(invalid === null || invalid === "splitBatch"
        ? { verdict: "pending", drawn: draw, day: { active: "enemy", phase: "day" }, turn: { active: "enemy", phase: "dusk" } }
        : { verdict: "fail" });
    } finally { vi.unstubAllGlobals(); }
  });
  it("retains the Dreamwell entity kind from a successful base report", async () => {
    const draw = { ...report([], "pending"), result: { ...report([], "pending").result, lab: { entityKind: "dreamwell", eligibleVariants: ["base"] } } };
    const result = await cell([draw]);
    expect(result.records[0]).toMatchObject({ entityKind: "dreamwell", verdict: "pending", effective: true });
    expect(result.result.lab?.eligibleVariants).toEqual(["base"]);
  });
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

/**
 * Sweeps synthetic cards through stub sessions, each standing for one held
 * browser lease, and returns the open/card/close sequence.
 * @param {string[]} cards @param {number[]} queued waiters seen at each boundary
 * @param {string | null} [breaks] the card after which the session is non-runnable
 */
async function sweep(cards, queued, breaks = null) {
  /** @type {string[]} */
  const events = [];
  let opened = 0;
  const boundaries = [...queued];
  const result = await sweepCards(cards, {
    open: () => {
      const id = ++opened;
      let broken = false;
      events.push(`open ${String(id)}`);
      return Promise.resolve({ id, broken: () => { broken = true; }, closed: () => broken,
        close: () => { events.push(`close ${String(id)}`); return Promise.resolve(); } });
    },
    waiters: () => boundaries.shift() ?? 0,
    sweepCard: (card, session) => {
      events.push(`${card} in ${String(session.id)}`);
      if (card === breaks) session.broken();
      return Promise.resolve();
    },
  });
  return { events, result, boundaries };
}

describe("sweep lease yielding", () => {
  it("releases and re-takes the lease at each card boundary with queued waiters", async () => {
    const { events, result } = await sweep(["a", "b", "c"], [1, 2]);
    expect(events).toEqual(["open 1", "a in 1", "close 1", "open 2", "b in 2", "close 2", "open 3", "c in 3", "close 3"]);
    expect(result).toEqual({ sessions: 3, yields: 2 });
  });

  it("keeps its session across a boundary nobody waits at", async () => {
    const { events, result } = await sweep(["a", "b", "c"], [0, 1]);
    expect(events).toEqual(["open 1", "a in 1", "b in 1", "close 1", "open 2", "c in 2", "close 2"]);
    expect(result).toEqual({ sessions: 2, yields: 1 });
  });

  it("stops after a card that leaves its session non-runnable", async () => {
    const { events, boundaries } = await sweep(["a", "b", "c"], [1, 1], "b");
    expect(events).toEqual(["open 1", "a in 1", "close 1", "open 2", "b in 2", "close 2"]);
    expect(boundaries).toEqual([1]);
  });
});
