// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { runInNewContext } from "node:vm";
import { createQa } from "./prelude.mjs";
import cardLabPlay from "./scenarios/card-lab-play.mjs";

afterEach(() => vi.useRealTimers());

/** A synthetic page: observations, navigation interruptions, and host errors only. */
async function fixture() {
  const evaluate = vi.fn();
  const goto = vi.fn().mockResolvedValue(undefined);
  /** @type {Map<string, (...args: unknown[]) => void>} */
  const listeners = new Map();
  const init = vi.fn();
  const waitForFunction = vi.fn();
  const page = /** @type {import('./prelude.mjs').QaPage} */ (/** @type {unknown} */ ({
    evaluate,
    goto,
    waitForFunction,
    addInitScript: init,
    url: () => "http://localhost:5174/lab",
    on: (/** @type {string} */ name, /** @type {(...args: any[]) => void} */ listener) => listeners.set(name, listener),
    off: (/** @type {string} */ name) => listeners.delete(name),
    waitForTimeout: async (/** @type {number} */ ms) => vi.advanceTimersByTimeAsync(ms),
  }));
  const qa = await createQa(page, { baseUrl: "http://localhost:5174", bead: "fixture", captureDir: "/fixture", prod: false, args: {} });
  return { qa, evaluate, listeners, init, waitForFunction, page, goto };
}

describe("QA observations across navigation", () => {
  it("defaults to DOMContentLoaded while preserving an explicit load wait", async () => {
    const { qa, evaluate, goto } = await fixture();
    evaluate.mockResolvedValue({ href: "http://localhost:5174/lab", width: 1440, height: 900, caps: { errors: [], rejections: [], consoleErrors: [] } });
    await qa.goto("/lab");
    expect(goto).toHaveBeenLastCalledWith("http://localhost:5174/lab", { waitUntil: "domcontentloaded" });
    await qa.goto("/lab", { waitUntil: "load" });
    expect(goto).toHaveBeenLastCalledWith("http://localhost:5174/lab", { waitUntil: "load" });
  });

  it("re-attaches a destroyed context and returns the subsequent observation", async () => {
    const { qa, evaluate } = await fixture();
    vi.useFakeTimers();
    evaluate.mockRejectedValueOnce(new Error("Execution context was destroyed, most likely because of a navigation"));
    evaluate.mockResolvedValueOnce({ id: "synthetic-instance" });
    expect(await qa.read(() => null, null)).toEqual({ id: "synthetic-instance" });
  });

  it("propagates real predicate exceptions and bounds repeated navigation", async () => {
    const { qa, evaluate } = await fixture();
    vi.useFakeTimers();
    const error = new Error("synthetic application failure");
    evaluate.mockRejectedValueOnce(error);
    await expect(qa.read(() => null, null)).rejects.toBe(error);
    evaluate.mockRejectedValue(new Error("Execution context was destroyed"));
    await expect(qa.read(() => null, null, { timeout: 1 })).rejects.toThrow(/navigation did not settle/);

  });

  it("re-attaches when navigation interrupts handle serialization and disposes each handle", async () => {
    const { qa, waitForFunction } = await fixture();
    const lost = { jsonValue: vi.fn().mockRejectedValue(new Error("Execution context was destroyed")), dispose: vi.fn().mockResolvedValue(undefined) };
    const ready = { jsonValue: vi.fn().mockResolvedValue({ id: "resumed-observation" }), dispose: vi.fn().mockResolvedValue(undefined) };
    waitForFunction.mockResolvedValueOnce(lost).mockResolvedValueOnce(ready);
    expect(await qa.waitFor("resumed", () => true, null, { allowErrors: true })).toEqual({ id: "resumed-observation" });
    expect(lost.dispose).toHaveBeenCalledOnce();
    expect(ready.dispose).toHaveBeenCalledOnce();
    vi.useFakeTimers({ now: 0 });
    waitForFunction.mockResolvedValueOnce({
      jsonValue: () => { vi.setSystemTime(2); return Promise.reject(new Error("Execution context was destroyed")); },
      dispose: () => Promise.resolve(),
    });
    await expect(qa.waitFor("bounded", () => true, null, { timeout: 1, allowErrors: true })).rejects.toThrow(/bounded/);
  });

  it("retains departing-document errors and removes its host observers at finish", async () => {
    const { qa, evaluate, listeners } = await fixture();
    listeners.get("pageerror")?.(new Error("departing document failure"));
    evaluate.mockResolvedValue({ href: "http://localhost:5174/lab", width: 1440, height: 900, caps: { errors: [], rejections: [], consoleErrors: [] } });
    await expect(qa.assertCaps("reloaded")).rejects.toThrow(/departing document failure/);
    expect((await qa.caps())?.errors).toContain("departing document failure");
    const report = await qa.finish(null, null);
    expect(report.caps[0]?.caps.errors).toEqual(["departing document failure"]);
    expect(listeners.size).toBe(0);
  });

  it("fails a sweep verdict on a departed error even when the resumed document buffer is empty", async () => {
    const { qa, evaluate, listeners } = await fixture();
    listeners.get("pageerror")?.(new Error("departed application failure"));
    evaluate.mockResolvedValue({ href: "http://localhost:5174/lab", caps: { errors: [], rejections: [], consoleErrors: [] } });
    const lab = { status: "ready", cardType: "Character", cardStatus: "authored" };
    const state = { instance: "i1", zone: "play", stack: 0, inFlight: false, result: null, decision: null, pending: null, events: [{ kind: "resolved", instance: "i1" }] };
    const sweepQa = /** @type {import('./prelude.mjs').Qa} */ (/** @type {unknown} */ ({
      ...qa,
      args: { card: "synthetic-card", variant: "base", as: "enemy" },
      open: async () => {},
      waitFor: vi.fn().mockResolvedValueOnce(lab).mockResolvedValueOnce(true),
      waitVisible: async () => {},
      read: () => Promise.resolve(state),
      sleep: async () => {},
      battle: {
        state: () => Promise.resolve({ board: "synthetic-board", canPass: true }),
        playUntil: async () => qa.assertCaps("resolution"),
      },
    }));
    expect((await cardLabPlay(sweepQa)).verdict).toBe("fail");
  });

  it("cleans up host observers when installation or final observation fails", async () => {
    const { qa, page, init, evaluate, listeners } = await fixture();
    evaluate.mockRejectedValueOnce(new Error("final observation failed"));
    await expect(qa.finish(null, null)).rejects.toThrow(/final observation failed/);
    expect(listeners.size).toBe(0);
    init.mockRejectedValueOnce(new Error("init installation failed"));
    await expect(createQa(page, { baseUrl: "http://localhost:5174", bead: "fixture", captureDir: "/fixture", prod: false, args: {} })).rejects.toThrow(/init installation failed/);
    expect(listeners.size).toBe(0);
  });
});

// Run the installed browser init script with synthetic storage/document globals.
// This covers the cache's public metadata contract without another DOM environment.
describe("QA lab observation cache", () => {
  it("restores exact published outcomes only for the complete persisted game/request", async () => {
    const { init } = await fixture();
    /** @type {Map<string, string>} */
    const storage = new Map();
    const query = new URLSearchParams({ game: "saved-game", goto: "card-lab", card: "synthetic-card", variant: "base", as: "player", seed: "1" });
    const document = (/** @type {string} */ search) => {
      /** @type {Map<string, () => void>} */
      const events = new Map();
      const win = {};
      runInNewContext(`(${String(init.mock.calls[0]?.[0])})()`, {
        window: win, location: { search }, URLSearchParams,
        sessionStorage: { getItem: (/** @type {string} */ key) => storage.get(key) ?? null, setItem: (/** @type {string} */ key, /** @type {string} */ value) => storage.set(key, value), removeItem: (/** @type {string} */ key) => storage.delete(key) },
        addEventListener: (/** @type {string} */ name, /** @type {() => void} */ listener) => events.set(name, listener),
        console: { error: () => {} },
      });
      return { win, events };
    };
    for (const status of ["ready", "rejected"]) {
      const original = document(`?${query}`);
      const report = { status, card: "synthetic-card", reason: status === "ready" ? null : "unplayable", detail: "synthetic outcome" };
      Object.assign(original.win, { __cardLab: report });
      original.events.get("pagehide")?.();
      expect(document(`?${query}`).win).toMatchObject({ __cardLab: report });
      for (const field of ["game", "goto", "card", "variant", "as", "seed"]) {
        const stale = new URLSearchParams(query);
        stale.set(field, "different");
        expect(document(`?${stale}`).win).not.toHaveProperty("__cardLab");
      }
      const fresh = new URLSearchParams(query);
      fresh.delete("game");
      expect(document(`?${fresh}`).win).not.toHaveProperty("__cardLab");
    }
  });
});
