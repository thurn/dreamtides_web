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
  const screenshot = vi.fn();
  const page = /** @type {import('./prelude.mjs').QaPage} */ (/** @type {unknown} */ ({
    evaluate,
    goto,
    waitForFunction,
    setViewportSize: vi.fn().mockResolvedValue(undefined),
    screenshot,
    mouse: { move: vi.fn() },
    addInitScript: init,
    url: () => "http://localhost:5174/lab",
    on: (/** @type {string} */ name, /** @type {(...args: any[]) => void} */ listener) => listeners.set(name, listener),
    off: (/** @type {string} */ name) => listeners.delete(name),
    waitForTimeout: async (/** @type {number} */ ms) => vi.advanceTimersByTimeAsync(ms),
  }));
  const qa = await createQa(page, { baseUrl: "http://localhost:5174", bead: "fixture", captureDir: "/fixture", prod: false, args: {} });
  const emit = (/** @type {keyof import('./prelude.mjs').Caps} */ kind, /** @type {string} */ message, documentId = "departed") =>
    listeners.get("console")?.({ type: () => "debug", text: () => `dreamtides:qa:caps:${JSON.stringify({ kind, message, documentId, href: "http://localhost:5174/lab", index: 1 })}` });
  return { qa, evaluate, listeners, init, waitForFunction, page, goto, emit, screenshot };
}

describe("QA observations across navigation", () => {
  it("verifies declared staging from immutable history and returns distinct initial physical ids after AI movement", async () => {
    const { qa, evaluate, waitForFunction, goto } = await fixture();
    const uuid = "5e5e5e5e-0000-4000-8000-000000000002";
    const stage = { enemy: { hand: [uuid, uuid], energy: 4 } };
    const base = { battleId: "fixture-battle", instances: {
      i1: { owner: "enemy", controller: "enemy", printing: { kind: "card", cardId: uuid } },
      i2: { owner: "enemy", controller: "enemy", printing: { kind: "card", cardId: uuid } },
    }, sides: { player: { frontRank: [], backRank: [], hand: [], void: [], currentEnergy: 0, maxEnergy: 0 }, enemy: { frontRank: [], backRank: [], hand: ["i1", "i2"], void: [], currentEnergy: 4, maxEnergy: 4 } } };
    const win = { __caps: { errors: [], rejections: [], consoleErrors: [] }, __cardLab: { status: "ready", stage: JSON.stringify(stage), reason: null, detail: null }, __engineProbe: { battleId: base.battleId, slice: { committed: { sides: { enemy: { hand: [] } } }, history: { base: { committed: base } } } } };
    const context = { window: win, location: { href: "http://localhost:5174/lab" }, innerWidth: 1440, innerHeight: 900 };
    evaluate.mockImplementation((fn, arg) => {
      const value = /** @type {unknown} */ (runInNewContext(`(${String(fn)})(${JSON.stringify(arg)})`, context));
      return Promise.resolve(value);
    });
    waitForFunction.mockImplementation((fn, arg) => {
      const value = /** @type {unknown} */ (runInNewContext(`(${String(fn)})(${JSON.stringify(arg)})`, context));
      return Promise.resolve({ jsonValue: () => Promise.resolve(value), dispose: () => Promise.resolve() });
    });
    const result = await qa.labStage(stage, { card: uuid, as: "enemy" });
    expect(result.enemy.hand).toEqual(["i1", "i2"]);
    expect(goto.mock.calls[0]?.[0]).toContain(`labStage=${encodeURIComponent(JSON.stringify(stage))}`);
    base.sides.enemy.currentEnergy = 1;
    await expect(qa.labStage(stage, { card: uuid })).rejects.toThrow(/energy mismatch/);
    win.__cardLab.status = "rejected";
    await expect(qa.labStage(stage, { card: uuid })).rejects.toThrow(/rejected/);
  });

  it("ignores resource console errors while the installed buffer forwards application errors exactly once", async () => {
    const { qa, evaluate, listeners, init } = await fixture();
    /** @type {Map<string, (...args: any[]) => void>} */
    const events = new Map();
    const win = {};
    const console = {
      error: (/** @type {unknown[]} */ ..._args) => {},
      debug: (/** @type {string} */ message) => listeners.get("console")?.({ type: () => "debug", text: () => message }),
    };
    runInNewContext(`(${String(init.mock.calls[0]?.[0])})()`, {
      window: win, location: { href: "http://localhost:5174/lab", search: "" }, URLSearchParams,
      crypto: { randomUUID: () => "current-document" },
      sessionStorage: { getItem: () => null },
      addEventListener: (/** @type {string} */ name, /** @type {(...args: any[]) => void} */ listener) => events.set(name, listener),
      console,
    });
    evaluate.mockImplementation(() => Promise.resolve({ href: "http://localhost:5174/lab", documentId: "current-document", caps: /** @type {{ __caps: import('./prelude.mjs').Caps }} */ (win).__caps }));
    listeners.get("console")?.({ type: () => "error", text: () => "Failed to load resource: 404" });
    listeners.get("console")?.({ type: () => "debug", text: () => "dreamtides:qa:caps:invalid-json" });
    await qa.assertCaps("resource failure");
    events.get("error")?.({ message: "page failure" });
    events.get("unhandledrejection")?.({ reason: "rejected promise" });
    console.error("application failure");
    console.error("application failure");
    const expected = { errors: ["page failure"], rejections: ["rejected promise"], consoleErrors: ["application failure", "application failure"] };
    expect(await qa.caps()).toEqual(expected);
    expect(await qa.caps()).toEqual(expected);
    await expect(qa.assertCaps("application failure")).rejects.toThrow(/page failure/);
    expect((await qa.finish(null, null)).caps).toEqual([{ href: "http://localhost:5174/lab", caps: expected }]);
  });

  it("resets allowed navigation errors in both the host observation and document buffer", async () => {
    const { qa, evaluate, emit } = await fixture();
    const caps = { errors: ["allowed load failure"], rejections: [], consoleErrors: [] };
    const globals = { window: { __caps: caps }, location: { href: "http://localhost:5174/lab" }, innerWidth: 1440, innerHeight: 900 };
    evaluate.mockImplementation((fn, arg) => {
      /** @type {unknown} */
      const input = arg;
      /** @type {unknown} */
      const result = runInNewContext(`(${String(fn)})(arg)`, { ...globals, arg: input });
      return Promise.resolve(result);
    });
    emit("errors", "allowed load failure");
    await qa.goto("/lab", { allowErrors: true });
    await qa.assertCaps("after allowed navigation");
    expect(await qa.caps()).toEqual({ errors: [], rejections: [], consoleErrors: [] });
    expect((await qa.finish(null, null)).caps).toEqual([]);
  });

  it.each([
    { viewport: { width: 1440, height: 900 }, clip: undefined, raster: { width: 2880, height: 1800 }, reportedClip: undefined },
    { viewport: { width: 390, height: 844 }, clip: undefined, raster: { width: 780, height: 1688 }, reportedClip: undefined },
    { viewport: { width: 1440, height: 900 }, clip: { x: -1.2, y: 12.2, width: 10.4, height: 9.1 }, raster: { width: 20, height: 20 }, reportedClip: { x: 0, y: 12, width: 10, height: 10 } },
  ])("captures device pixels while reporting CSS geometry: $viewport / $clip", async ({ viewport, clip, raster, reportedClip }) => {
    const { qa, evaluate, waitForFunction, screenshot } = await fixture();
    const href = "http://localhost:5174/lab";
    evaluate.mockResolvedValue({ href, ...viewport, caps: { errors: [], rejections: [], consoleErrors: [] } });
    waitForFunction.mockResolvedValue({ jsonValue: () => Promise.resolve(true), dispose: () => Promise.resolve() });
    /** @type {Map<string, { width: number, height: number, pixels: Uint8Array }>} */
    const images = new Map();
    // External page contract: screenshot rectangles are CSS pixels, while
    // device output multiplies their raster size by this synthetic page's DPR.
    screenshot.mockImplementation((/** @type {{ path: string, scale?: "css" | "device", clip?: import('./prelude.mjs').Rect }} */ options) => {
      const density = options.scale === "css" ? 1 : 2;
      const bounds = options.clip ?? viewport;
      const width = bounds.width * density;
      const height = bounds.height * density;
      const pixels = new Uint8Array(width * height * 4);
      images.set(options.path, { width, height, pixels });
      return Promise.resolve(pixels);
    });
    const path = await qa.capture("density", { clip });
    const image = images.get(path);
    expect(image).toMatchObject(raster);
    expect(image?.pixels.byteLength).toBe(raster.width * raster.height * 4);
    expect((await qa.finish(null, null)).captures).toEqual([
      { path, href, ...viewport, ...(reportedClip === undefined ? {} : { clip: reportedClip }) },
    ]);
  });

  it("waits for image completion before capturing, including failed images", async () => {
    const { qa, evaluate, waitForFunction, screenshot } = await fixture();
    evaluate.mockResolvedValue({ href: "http://localhost:5174/lab", width: 1440, height: 900, caps: { errors: [], rejections: [], consoleErrors: [] } });
    waitForFunction.mockResolvedValue({ jsonValue: () => Promise.resolve(true), dispose: () => Promise.resolve() });
    await qa.capture("ready");
    const predicate = /** @type {unknown} */ (waitForFunction.mock.calls[0]?.[0]);
    const visible = { getBoundingClientRect: () => ({ width: 50, height: 50, top: 0, left: 0, bottom: 50, right: 50 }) };
    const offscreen = { getBoundingClientRect: () => ({ width: 50, height: 50, top: 1000, left: 0, bottom: 1050, right: 50 }) };
    const ready = (/** @type {{ complete: boolean, getBoundingClientRect(): unknown }[]} */ images) => {
      /** @type {unknown} */
      const result = runInNewContext(`(${String(predicate)})()`, { document: { images }, innerWidth: 1440, innerHeight: 900 });
      if (typeof result !== "boolean") throw new Error("image predicate returned a non-boolean");
      return result;
    };
    expect(ready([{ ...visible, complete: false }])).toBe(false);
    expect(ready([{ ...visible, complete: true }])).toBe(true);
    expect(ready([{ ...offscreen, complete: false }])).toBe(true);
    expect(waitForFunction.mock.invocationCallOrder[0]).toBeLessThan(screenshot.mock.invocationCallOrder[0]);
  });

  it("refuses to submit a lab card when the selected side or zone did not update", async () => {
    for (const fields of [{ side: "enemy", zone: "hand" }, { side: "player", zone: "void" }]) {
      const { qa, evaluate, waitForFunction, page } = await fixture();
      /** @type {string[]} */
      const clicked = [];
      let target = "";
      const win = {
        __caps: { errors: [], rejections: [], consoleErrors: [] },
        __engineProbe: { battleId: "synthetic-battle", slice: { committed: { version: 1, instances: {} }, inFlight: null } },
        __qa: {
          rendered: () => ({}),
          hitPoint: (/** @type {{ selector: string }} */ probe) => { target = probe.selector; return { x: 1, y: 1, covered: null }; },
        },
      };
      const globals = {
        window: win, location: { href: "http://localhost:5174/lab" }, innerWidth: 1440, innerHeight: 900,
        document: {
          querySelector: (/** @type {string} */ selector) => ({ getAttribute: () => selector.includes("side") ? fields.side : fields.zone }),
        },
      };
      const execute = (/** @type {unknown} */ fn, /** @type {unknown} */ arg) => {
        /** @type {unknown} */
        const result = runInNewContext(`(${String(fn)})(arg)`, { ...globals, arg });
        return result;
      };
      evaluate.mockImplementation((fn, arg) => Promise.resolve(execute(fn, arg)));
      waitForFunction.mockImplementation((fn, arg) => {
        if (execute(fn, arg) !== true) throw new Error("selected fields mismatch");
        return Promise.resolve({ jsonValue: () => Promise.resolve(true), dispose: () => Promise.resolve() });
      });
      Object.assign(page, {
        mouse: { move: async () => {}, click: () => { clicked.push(target); return Promise.resolve(); } },
        locator: () => ({ fill: async () => {} }),
      });
      await expect(qa.labAddCard("hand", "player", "5e5e5e5e-0000-4000-8000-000000000001")).rejects.toThrow(/selected fields mismatch/);
      expect(clicked).not.toContain("[data-testid=engine-debug-add]");
    }
  });

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
    const { qa, evaluate, listeners, emit } = await fixture();
    emit("errors", "departing document failure");
    evaluate.mockResolvedValue({ href: "http://localhost:5174/lab", width: 1440, height: 900, caps: { errors: [], rejections: [], consoleErrors: [] } });
    await expect(qa.assertCaps("reloaded")).rejects.toThrow(/departing document failure/);
    expect((await qa.caps())?.errors).toContain("departing document failure");
    const report = await qa.finish(null, null);
    expect(report.caps[0]?.caps.errors).toEqual(["departing document failure"]);
    expect(listeners.size).toBe(0);
  });

  it("fails a sweep verdict on a departed error even when the resumed document buffer is empty", async () => {
    const { qa, evaluate, emit } = await fixture();
    emit("errors", "departed application failure");
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
        crypto: { randomUUID: () => "synthetic-document" },
        sessionStorage: { getItem: (/** @type {string} */ key) => storage.get(key) ?? null, setItem: (/** @type {string} */ key, /** @type {string} */ value) => storage.set(key, value), removeItem: (/** @type {string} */ key) => storage.delete(key) },
        addEventListener: (/** @type {string} */ name, /** @type {() => void} */ listener) => events.set(name, listener),
        console: { error: () => {}, debug: () => {} },
      });
      return { win, events };
    };
    for (const status of ["ready", "rejected"]) {
      const original = document(`?${query}`);
      const report = { status, card: "synthetic-card", reason: status === "ready" ? null : "unplayable", detail: "synthetic outcome" };
      Object.assign(original.win, { __cardLab: report });
      original.events.get("pagehide")?.();
      expect(document(`?${query}`).win).toMatchObject({ __cardLab: report });
      for (const field of ["game", "goto", "card", "avatar", "variant", "as", "seed", "labStage"]) {
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

// The battle driver's engine-event helpers over a synthetic probe: recorded
// events keyed by intent sequence and batch index, read without acting.
describe("QA engine event observation", () => {
  const A = "5e5e5e5e-0000-4000-8000-000000000a01";
  const B = "5e5e5e5e-0000-4000-8000-000000000a02";
  const C = "5e5e5e5e-0000-4000-8000-000000000a03";
  const source = "5e5e5e5e-0000-4000-8000-000000000a04";
  const recorded = (/** @type {number} */ seq, /** @type {Record<string, unknown>[]} */ events) =>
    events.map((event, index) => ({ seq, index, kind: event.kind, instance: "instance" in event ? event.instance : null, event }));
  const card = (/** @type {string} */ id, /** @type {string} */ cardId) => ({ id, printing: { kind: "card", cardId } });

  async function probed() {
    const { qa, evaluate, waitForFunction, page } = await fixture();
    const click = vi.fn();
    Object.assign(page, { mouse: { move: vi.fn(), click } });
    const probe = {
      battleId: "synthetic-battle",
      slice: { committed: { instances: { i3: card("i3", A), i4: card("i4", A), i5: card("i5", source), i6: card("i6", B), i7: card("i7", C) } }, inFlight: null },
      events: recorded(4, [
        { kind: "cardDrawn", side: "player", instance: "i3" },
        { kind: "cardDrawn", side: "player", instance: "i4" },
      ]),
    };
    const win = { __caps: { errors: [], rejections: [], consoleErrors: [] }, __engineProbe: probe };
    const context = { window: win, location: { href: "http://localhost:5174/lab" }, innerWidth: 1440, innerHeight: 900 };
    const run = (/** @type {unknown} */ fn, /** @type {unknown} */ arg) =>
      /** @type {unknown} */ (runInNewContext(`(${String(fn)})(${JSON.stringify(arg)})`, context));
    evaluate.mockImplementation((fn, arg) => Promise.resolve(run(fn, arg)));
    waitForFunction.mockImplementation((fn, arg) => {
      const value = run(fn, arg);
      if (!value) return Promise.reject(new Error("synthetic wait timed out"));
      return Promise.resolve({ jsonValue: () => Promise.resolve(value), dispose: () => Promise.resolve() });
    });
    const later = recorded(7, [
      { kind: "triggerQueued", source: "i5", controller: "player", ability: 0, node: 2, subject: "i6" },
      { kind: "triggerQueued", source: { kind: "avatar", side: "enemy" }, controller: "enemy", ability: 0, node: null, subject: null },
      { kind: "cardDrawn", side: "enemy", instance: "i7" },
    ]);
    return { qa, probe, win, click, evaluate, publish: () => probe.events.push(...later) };
  }
  const keys = (/** @type {{ events: { seq: number, index: number }[] }} */ page) => page.events.map(({ seq, index }) => [seq, index]);
  const malformed = [null, true, 7, "kind", [], () => {}].map((value) => ({ label: Array.isArray(value) ? "array" : String(value), value }));

  it("rejects direct event fields instead of returning unrelated recorded events", async () => {
    const { qa, evaluate, publish } = await probed();
    publish();
    const options = /** @type {Parameters<typeof qa.battle.events>[1]} */ (/** @type {unknown} */ ({ kind: "laneResolved", challenger: "i5" }));
    await expect(qa.battle.events(null, options)).rejects.toThrow(/qa\.battle\.events:.*options.*match/);
    expect(evaluate).not.toHaveBeenCalled();
  });

  it.each(malformed)("rejects malformed options $label before reading the page", async ({ value }) => {
    const { qa, evaluate } = await probed();
    const options = /** @type {Parameters<typeof qa.battle.events>[1]} */ (/** @type {unknown} */ (value));
    await expect(qa.battle.events(null, options)).rejects.toThrow(/qa\.battle\.events:.*options.*object/);
    expect(evaluate).not.toHaveBeenCalled();
  });

  it.each(malformed)("rejects malformed match $label before reading the page", async ({ value }) => {
    const { qa, evaluate } = await probed();
    const match = /** @type {import('./prelude.mjs').EventMatch} */ (/** @type {unknown} */ (value));
    await expect(qa.battle.events(null, { match })).rejects.toThrow(/qa\.battle\.events:.*match.*object/);
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("rejects unknown own option fields even beside a valid match", async () => {
    const { qa, evaluate } = await probed();
    for (const value of [
      { match: { kind: "cardDrawn" }, challenger: "i5" },
      Object.defineProperty({}, "kind", { value: "laneResolved" }),
      { [Symbol("kind")]: "laneResolved" },
    ]) {
      const options = /** @type {Parameters<typeof qa.battle.events>[1]} */ (/** @type {unknown} */ (value));
      await expect(qa.battle.events(null, options)).rejects.toThrow(/qa\.battle\.events: unknown options field.*match/);
    }
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("preserves default options and record prototypes with arbitrary nested event fields", async () => {
    const { qa, probe } = await probed();
    const empty = {};
    Reflect.setPrototypeOf(empty, null);
    for (const options of [undefined, {}, { match: undefined, limit: undefined }, { match: {} }, empty]) {
      expect(keys(await qa.battle.events(null, options))).toEqual([[4, 0], [4, 1]]);
    }
    const detail = { tags: ["synthetic"], metadata: { value: 1 } };
    probe.events.push(...recorded(7, [{ kind: "syntheticEvent", detail, arbitraryField: 7 }]));
    for (const prototype of [null, { inheritedField: "ignored" }]) {
      const match = { detail, arbitraryField: 7 };
      Reflect.setPrototypeOf(match, prototype);
      const options = {};
      Reflect.setPrototypeOf(options, { match, limit: 1 });
      expect(keys(await qa.battle.events(null, options))).toEqual([[7, 0]]);
    }
    const { events } = await qa.battle.events(null, { match: { detail: { ...detail, tags: ["different"] } } });
    expect(events).toEqual([]);
  });

  it("keys repeated events by sequence and batch index and observes no new event twice", async () => {
    const { qa, probe, publish } = await probed();
    const start = await qa.battle.eventCursor();
    expect(start).toEqual({ battleId: "synthetic-battle", seq: 4, index: 1 });
    for (let read = 0; read < 2; read++) expect(await qa.battle.events(start)).toEqual({ events: [], cursor: start, more: false });
    const drawn = await qa.battle.events(null, { match: { kind: "cardDrawn", side: "player" } });
    expect(keys(drawn)).toEqual([[4, 0], [4, 1]]);
    expect(drawn.events.map(({ instance, cards }) => [instance, cards])).toEqual([["i3", { i3: A }], ["i4", { i4: A }]]);
    publish();
    const next = await qa.battle.events(start);
    expect(keys(next)).toEqual([[7, 0], [7, 1], [7, 2]]);
    expect(next.cursor).toEqual({ battleId: "synthetic-battle", seq: 7, index: 2 });
    expect(await qa.battle.events(next.cursor)).toEqual({ events: [], cursor: next.cursor, more: false });
    /** @type {number[][]} */
    const paged = [];
    /** @type {import('./prelude.mjs').EventCursor | null} */
    let cursor = null;
    for (let more = true; more;) {
      const page = await qa.battle.events(cursor, { limit: 2 });
      paged.push(...keys(page));
      ({ cursor, more } = page);
    }
    expect(paged).toEqual(probe.events.map(({ seq, index }) => [seq, index]));
    await expect(qa.battle.events(null, { limit: 0 })).rejects.toThrow(/limit/);
  });

  it("attributes draws by side and triggers by source and controller, whatever their order, without acting", async () => {
    const { qa, probe, win, click, publish } = await probed();
    const start = await qa.battle.eventCursor();
    await expect(qa.battle.waitForEvents(start, { kind: "cardDrawn", side: "enemy" })).rejects.toThrow(/timed out/);
    publish();
    const snapshot = JSON.stringify(win);
    const enemyDraw = await qa.battle.waitForEvents(start, { kind: "cardDrawn", side: "enemy" });
    expect(enemyDraw.events.map(({ seq, index, instance, cards }) => ({ seq, index, instance, cards }))).toEqual([{ seq: 7, index: 2, instance: "i7", cards: { i7: C } }]);
    const floating = await qa.battle.waitForEvents(start, { kind: "triggerQueued", controller: "player", source: "i5" });
    expect(floating.events.map(({ event, cards }) => [event, cards])).toEqual([[probe.events[2]?.event, { i5: source, i6: B }]]);
    const avatar = await qa.battle.waitForEvents(null, { kind: "triggerQueued", source: { side: "enemy", kind: "avatar" } });
    expect(avatar.events.map(({ seq, index }) => [seq, index])).toEqual([[7, 1]]);
    expect(keys(await qa.battle.waitForEvents(null, { kind: "cardDrawn", side: "player" }, { count: 2 }))).toEqual([[4, 0], [4, 1]]);
    await expect(qa.battle.waitForEvents(start, { kind: "cardDrawn", side: "player" })).rejects.toThrow(/timed out/);
    expect(JSON.stringify(win)).toBe(snapshot);
    expect(click).not.toHaveBeenCalled();
    probe.battleId = "another-battle";
    await expect(qa.battle.events(start)).rejects.toThrow(/another-battle/);
    await expect(qa.battle.waitForEvents(start, { kind: "cardDrawn" })).rejects.toThrow(/another-battle/);
  });
});
