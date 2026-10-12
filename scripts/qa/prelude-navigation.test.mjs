// @vitest-environment node
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQa } from "./prelude.mjs";

afterEach(() => vi.useRealTimers());

/** Synthetic public browser observations, without application state or provider calls. */
async function fixture() {
  const events = new EventEmitter();
  const state = { href: "http://localhost:5174/old", documentId: "old-document", width: 1440, height: 900,
    caps: { errors: /** @type {string[]} */ ([]), rejections: [], consoleErrors: [] } };
  const evaluate = vi.fn().mockImplementation(() => Promise.resolve(state));
  const goto = vi.fn().mockImplementation((/** @type {string} */ href) => {
    const frame = { parentFrame: () => null, url: () => href };
    events.emit("request", { isNavigationRequest: () => true, frame: () => frame, url: () => href });
    state.href = href;
    state.documentId = "new-document";
    events.emit("framenavigated", frame);
    events.emit("domcontentloaded");
    return Promise.resolve();
  });
  const off = vi.fn().mockImplementation((/** @type {string} */ name, /** @type {(...args: any[]) => void} */ listener) => events.off(name, listener));
  const page = /** @type {import('./prelude.mjs').QaPage} */ (/** @type {unknown} */ ({
    evaluate, goto, url: () => state.href, addInitScript: async () => {},
    on: events.on.bind(events), off, waitForTimeout: (/** @type {number} */ ms) => vi.advanceTimersByTimeAsync(ms),
  }));
  const qa = await createQa(page, { baseUrl: "http://localhost:5174", bead: "fixture", captureDir: "/fixture", prod: false,
    args: { card: "5e5e5e5e-0000-4000-8000-000000000550", variant: "base", as: "enemy" } });
  const reports = async () => /** @type {Array<{ expectedUrl: string, operation: number, deadline: number | null,
    outcome: string, failedPhase: string | null, error: string | null, contextDestroyed: boolean,
    listenerCleanup: string, droppedEvents: number, droppedObservationErrors: number,
    observationErrors: string[], events: Array<{ phase: string, order: number, activeOperations: number[], document?: { id: string, caps: unknown } }> }>} */
    ((await qa.finish(null, null)).log.filter(({ label }) => label === "qa.navigation").map(({ data }) => data));
  return { qa, events, state, evaluate, goto, off, page, reports };
}

describe("navigation lifecycle evidence", () => {
  it("observes document replacement and ordered main-frame events, preserving the healthy public contract", async () => {
    const { qa, reports, events } = await fixture();
    expect(await qa.goto("/new", { timeout: 1_000 })).toEqual({ href: "http://localhost:5174/new", width: 1440, height: 900 });
    const [diagnostic] = await reports();
    expect(diagnostic).toMatchObject({ expectedUrl: "http://localhost:5174/new", outcome: "succeeded", listenerCleanup: "removed",
      cell: { uuid: "5e5e5e5e-0000-4000-8000-000000000550", variant: "base", controller: "enemy" } });
    expect(diagnostic?.events.flatMap(({ document }) => document === undefined ? [] : [document.id])).toEqual(["old-document", "new-document"]);
    expect(diagnostic?.events.map(({ phase }) => phase)).toEqual([
      "started", "caps-before", "goto-started", "request", "framenavigated", "domcontentloaded", "goto-settled", "document-after", "succeeded", "listener-cleanup",
    ]);
    expect(events.eventNames()).toEqual([]);
  });

  it("distinguishes overlapping operations and an actual aborted request without changing the original error or retrying", async () => {
    const { qa, goto, events, reports, state } = await fixture();
    const original = new Error("net::ERR_ABORTED");
    let rejectFirst = (/** @type {unknown} */ _error) => {};
    let entered = () => {};
    const started = new Promise((resolve) => { entered = () => resolve(null); });
    goto.mockImplementationOnce(() => { entered(); return new Promise((_, reject) => { rejectFirst = reject; }); });
    const first = qa.goto("/first", { timeout: 5_000 });
    const failure = first.catch((/** @type {unknown} */ error) => error);
    await started;
    goto.mockImplementationOnce(() => {
      const frame = { parentFrame: () => null };
      events.emit("requestfailed", { isNavigationRequest: () => true, frame: () => frame,
        url: () => "http://localhost:5174/first", failure: () => ({ errorText: "net::ERR_ABORTED" }) });
      rejectFirst(original);
      state.href = "http://localhost:5174/second";
      return Promise.resolve();
    });
    await qa.goto("/second", { timeout: 5_000 });
    expect(await failure).toBe(original);
    const [aborted, succeeded] = await reports();
    expect(aborted).toMatchObject({ outcome: "failed", failedPhase: "goto", listenerCleanup: "removed" });
    expect(succeeded?.outcome).toBe("succeeded");
    expect(aborted?.events.find(({ phase }) => phase === "requestfailed")?.activeOperations).toEqual([1, 2]);
    const orders = [aborted, succeeded].flatMap((diagnostic) => diagnostic?.events.map(({ order }) => order) ?? []);
    expect(new Set(orders).size).toBe(orders.length);
    expect(goto).toHaveBeenCalledTimes(2);
    expect(events.eventNames()).toEqual([]);
  });

  it("retains departing Caps and actual close/crash observations on a failed navigation", async () => {
    const { qa, state, goto, reports, events } = await fixture();
    const original = new Error("closed browser");
    state.caps.errors.push("departing failure");
    goto.mockImplementationOnce(() => { events.emit("crash"); events.emit("close"); return Promise.reject(original); });
    await expect(qa.goto("/new")).rejects.toBe(original);
    const [diagnostic] = await reports();
    expect(diagnostic?.events.map(({ phase }) => phase)).toContain("crash");
    expect(diagnostic?.events.map(({ phase }) => phase)).toContain("close");
    expect(diagnostic?.events.find(({ phase }) => phase === "caps-before")?.document?.caps).toEqual(state.caps);
    expect(await qa.caps()).toEqual(state.caps);
    expect(events.eventNames()).toEqual([]);
  });

  it("retains document-context failure and its existing deadline cause while removing owned listeners", async () => {
    vi.useFakeTimers();
    const { qa, goto, evaluate, reports, events } = await fixture();
    const original = new Error("Execution context was destroyed");
    goto.mockImplementationOnce(() => { evaluate.mockRejectedValue(original); return Promise.resolve(); });
    const failed = qa.goto("/new", { timeout: 10 }).catch((/** @type {unknown} */ error) => error);
    await vi.advanceTimersByTimeAsync(10);
    const error = await failed;
    expect(error).toMatchObject({ name: "QaTimeoutError", cause: original });
    evaluate.mockResolvedValueOnce({ href: "http://localhost:5174/old", documentId: "old-document", caps: null });
    const [diagnostic] = await reports();
    expect(diagnostic).toMatchObject({ outcome: "failed", failedPhase: "document-after", contextDestroyed: true, listenerCleanup: "removed" });
    expect(events.eventNames()).toEqual([]);
  });

  it("reports bounded overflow and terminal outcomes even when event observation or listener removal fails", async () => {
    const { qa, goto, off, events, reports } = await fixture();
    const original = new Error("net::ERR_ABORTED");
    goto.mockImplementationOnce(() => {
      for (let index = 0; index < 100; index++) {
        events.emit("load");
        events.emit("framenavigated", { parentFrame() { throw new Error("unavailable frame observation"); } });
      }
      return Promise.reject(original);
    });
    off.mockImplementationOnce(() => { throw new Error("listener removal unavailable"); });
    await expect(qa.goto("/new")).rejects.toBe(original);
    const [diagnostic] = await reports();
    expect(diagnostic).toMatchObject({ outcome: "failed", failedPhase: "goto", listenerCleanup: "uncertain" });
    expect(diagnostic?.events).toHaveLength(64);
    expect(diagnostic?.droppedEvents).toBeGreaterThan(0);
    expect(diagnostic?.observationErrors).toHaveLength(64);
    expect(diagnostic?.droppedObservationErrors).toBeGreaterThan(0);
    const count = diagnostic?.droppedObservationErrors;
    events.emit("framenavigated", { parentFrame() { throw new Error("late observer"); } });
    expect(diagnostic?.droppedObservationErrors).toBe(count);
    // Only the deliberately unremovable listener remains; remove this fixture's own observer.
    expect(events.listenerCount("framenavigated")).toBe(1);
    events.removeAllListeners();
  });

  it("does not make diagnostic snapshot formatting a new healthy navigation failure", async () => {
    const { qa, state, reports } = await fixture();
    Object.defineProperty(state.caps, "toJSON", { value() { throw new Error("snapshot unavailable"); } });
    await expect(qa.goto("/new")).resolves.toMatchObject({ href: "http://localhost:5174/new" });
    const [diagnostic] = await reports();
    expect(diagnostic?.outcome).toBe("succeeded");
    expect(diagnostic?.observationErrors).toHaveLength(2);
  });
});
