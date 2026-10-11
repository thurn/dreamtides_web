import { afterEach, describe, expect, it, vi } from "vitest";
import { runInNewContext } from "node:vm";
import cardLabPlay from "./scenarios/card-lab-play.mjs";
import { createQa } from "./prelude.mjs";

afterEach(() => vi.useRealTimers());

async function stagedFixture(navigationWork = 0) {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const uuid = "5e5e5e5e-0000-4000-8000-000000000002";
  const stage = { enemy: { energy: 4 } };
  const sides = { player: { frontRank: [], backRank: [], hand: [], void: [], currentEnergy: 0, maxEnergy: 0 },
    enemy: { frontRank: [], backRank: [], hand: [], void: [], currentEnergy: 4, maxEnergy: 4 } };
  /** @type {Record<string, unknown>} */
  const win = { __caps: { errors: [], rejections: [], consoleErrors: [] }, __cardLab: null, __engineProbe: null };
  const context = { window: win, location: { href: "http://localhost:5174/lab" }, innerWidth: 1440, innerHeight: 900 };
  let readyAt = 20_000;
  const evaluate = (/** @type {(arg: unknown) => unknown} */ fn, /** @type {unknown} */ arg) => Promise.resolve(/** @type {unknown} */ (runInNewContext(`(${String(fn)})(${JSON.stringify(arg)})`, context)));
  const page = /** @type {import("./prelude.mjs").QaPage} */ (/** @type {unknown} */ ({
    url: () => context.location.href, on: () => {}, off: () => {}, addInitScript: async () => {},
    setViewportSize: () => { vi.setSystemTime(Date.now() + navigationWork); return Promise.resolve(); }, goto: () => {
      win.__cardLab = null; win.__engineProbe = null; readyAt = Date.now() + 20_000;
      return Promise.resolve();
    },
    evaluate,
    waitForFunction: async (/** @type {(arg: unknown) => unknown} */ fn, /** @type {unknown} */ arg, /** @type {{timeout: number}} */ options) => {
      if (Date.now() + options.timeout < readyAt) {
        vi.setSystemTime(Date.now() + options.timeout);
        throw Object.assign(new Error("synthetic native waiter deadline"), { name: "TimeoutError" });
      }
      vi.setSystemTime(readyAt);
      win.__cardLab = { status: "ready", stage: JSON.stringify(stage), reason: null, detail: null };
      win.__engineProbe = { battleId: "synthetic-battle", slice: { history: { base: { committed: { sides, instances: {} } } } } };
      readyAt = Date.now() + 20_000;
      const value = await evaluate(fn, arg);
      return { jsonValue: () => Promise.resolve(value), dispose: async () => {} };
    },
  }));
  const qa = await createQa(page, { baseUrl: "http://localhost:5174", bead: "fixture",
    captureDir: "/fixture", prod: false, args: { card: uuid }, timeoutMs: 60_000 });
  return { qa, stage };
}

describe("declared staging call budget", () => {
  it("accepts delayed load observations beyond the helper default within the supplied call budget", async () => {
    const { qa, stage } = await stagedFixture();
    const result = await qa.labStage(stage);
    expect(result.enemy.hand).toEqual([]);
    expect(result.enemy.front).toEqual([]);
    // The next staging call shares the original budget rather than restarting it.
    await expect(qa.labStage(stage)).rejects.toMatchObject({ name: "QaTimeoutError" });
  });

  it("rejects navigation work that consumes the explicit deadline before accepting a board", async () => {
    const { qa, stage } = await stagedFixture(20_000);
    await expect(qa.labStage(stage, { timeout: 10_000 })).rejects.toMatchObject({ name: "QaTimeoutError" });
  });

  it("honors an explicit shorter staging deadline and retains structured causes", async () => {
    const { qa, stage } = await stagedFixture();
    await expect(qa.labStage(stage, { timeout: 10_000 })).rejects.toMatchObject({ name: "QaTimeoutError" });
    const deadline = qa.timeoutError("synthetic deadline");
    expect(qa.isTimeout(new Error("wrapped", { cause: deadline }))).toBe(true);
    expect(qa.isTimeout(new Error("timed out, but unclassified"))).toBe(false);
  });

  it("classifies a settled native navigation timeout and keeps unknown failures distinct", async () => {
    const { qa } = await stagedFixture();
    const cases = [
      { error: Object.assign(new Error("synthetic native navigation deadline"), { name: "TimeoutError" }), expected: "timeout" },
      { error: new Error("synthetic product exception"), expected: "unknown" },
    ];
    for (const { error, expected } of cases) {
      const failed = { ...qa, open: () => Promise.reject(error) };
      const result = await cardLabPlay(failed);
      expect(result.verdict).toBe("fail");
      expect(result.failureKinds).toEqual([expected]);
    }
  });
});
