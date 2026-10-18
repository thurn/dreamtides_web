// @vitest-environment node
// `qa.d97`, `qa.touch.longPress`, and `qa.battle.win` over synthetic pages:
// observations a fake `window.__d97`, `window.__engineProbe`, and DOM return.
import { afterEach, describe, expect, it, vi } from "vitest";
import { runInNewContext } from "node:vm";
import { createBattleDriver, createQa } from "./prelude.mjs";
import { parseBattleId, parseD97DialogueId, parseD97DialogueNodeId, parseDreamAnchorId } from "../../src/types/identifiers";

afterEach(() => vi.useRealTimers());

const ANCHOR = parseDreamAnchorId("5e5e5e5e-0000-4000-8000-000000000097");
const ELSEWHERE = parseDreamAnchorId("5e5e5e5e-0000-4000-8000-000000000098");
const DIALOGUE = parseD97DialogueId("d97d0000-0000-4000-8000-000000000001");
const GREET = parseD97DialogueNodeId("d97d0000-0000-4000-8000-000000000011");
const ASK = parseD97DialogueNodeId("d97d0000-0000-4000-8000-000000000012");
const CAPS = () => ({ errors: [], rejections: [], consoleErrors: [] });

/**
 * A page whose evaluations and native waits run against `context`; each
 * native-wait poll first calls `tick`, the synthetic page's passage of time;
 * `mouse` receives its pointer input.
 *
 * @param {Record<string, unknown>} context
 * @param {() => void} [tick]
 * @param {{ click: (x: number, y: number) => Promise<void>, move: (x: number, y: number) => Promise<void> }} [mouse]
 */
async function pageFixture(context, tick = () => {}, mouse = { click: async () => {}, move: async () => {} }) {
  vi.useFakeTimers();
  const run = (/** @type {Function} */ fn, /** @type {unknown} */ arg) =>
    /** @type {unknown} */ (runInNewContext(`(${String(fn)})(${JSON.stringify(arg) ?? "null"})`, context));
  const waitForTimeout = vi.fn(async (/** @type {number} */ ms) => { await vi.advanceTimersByTimeAsync(ms); });
  const page = /** @type {import("./prelude.mjs").QaPage} */ (/** @type {unknown} */ ({
    url: () => "http://localhost:5174/d97",
    on: () => {},
    off: () => {},
    addInitScript: async () => {},
    evaluate: (/** @type {Function} */ fn, /** @type {unknown} */ arg) => Promise.resolve(run(fn, arg)),
    waitForFunction: (/** @type {Function} */ fn, /** @type {unknown} */ arg, /** @type {{ timeout: number }} */ options) => {
      const deadline = Date.now() + options.timeout;
      for (;;) {
        tick();
        const value = run(fn, arg);
        if (value) return Promise.resolve({ jsonValue: () => Promise.resolve(value), dispose: () => Promise.resolve() });
        if (Date.now() >= deadline) return Promise.reject(Object.assign(new Error("synthetic native waiter deadline"), { name: "TimeoutError" }));
        vi.advanceTimersByTime(100);
      }
    },
    waitForTimeout,
    mouse,
  }));
  const qa = await createQa(page, { baseUrl: "http://localhost:5174", bead: "fixture", captureDir: "/fixture", prod: false, args: {} });
  return { qa, waitForTimeout };
}

/** A walker that takes `steps` ticks to arrive, and a surface over it. */
function overworld(steps = 3) {
  const player = { tile: [1, 1], facing: "down", faced: [1, 2], walking: false, pathRemaining: 0 };
  let remaining = 0;
  const calls = /** @type {string[]} */ ([]);
  const surface = {
    state: () => ({ mapId: "map", player: { ...player }, anchors: [{ id: ANCHOR, kind: "challenger", at: [4, 4] }], markers: {}, characters: {} }),
    walkTo: (/** @type {string} */ id) => {
      calls.push(`walkTo ${id}`);
      if (id !== ANCHOR) return false;
      remaining = steps;
      player.walking = true;
      return true;
    },
    teleport: (/** @type {string} */ id) => { calls.push(`teleport ${id}`); return false; },
    interact: () => { calls.push("interact"); return true; },
  };
  const tick = () => {
    if (remaining === 0) return;
    remaining -= 1;
    if (remaining === 0) Object.assign(player, { tile: [4, 3], faced: [4, 4], walking: false });
  };
  return { surface, tick, calls };
}

describe("qa.d97", () => {
  it("waits for the surface to mount, then waits until the walker stops", async () => {
    const { surface, tick, calls } = overworld();
    /** @type {Record<string, unknown>} */
    const win = { __caps: CAPS() };
    let mountIn = 3;
    const { qa } = await pageFixture({ window: win, location: { href: "http://localhost:5174/d97" }, innerWidth: 1440, innerHeight: 900 }, () => {
      if (mountIn > 0 && --mountIn === 0) win.__d97 = surface;
      tick();
    });
    const player = await qa.d97.walkTo(ANCHOR);
    expect(calls).toEqual([`walkTo ${ANCHOR}`]);
    expect(player).toMatchObject({ tile: [4, 3], faced: [4, 4], walking: false });
  });

  it("fails with the player's and the anchor's state when an action returns false", async () => {
    const { surface, calls } = overworld();
    const { qa } = await pageFixture({ window: { __caps: CAPS(), __d97: surface }, location: { href: "http://localhost:5174/d97" }, innerWidth: 1440, innerHeight: 900 });
    await expect(qa.d97.walkTo(ELSEWHERE)).rejects.toThrow(/walkTo returned false; the anchor is not among the scene's 1 anchors; player .*"tile":\[1,1\]/);
    await expect(qa.d97.teleport(ANCHOR, "up")).rejects.toThrow(/teleport returned false; the anchor is a challenger at \[4,4\]/);
    expect(await qa.d97.interact()).toMatchObject({ tile: [1, 1] });
    expect(calls).toEqual([`walkTo ${ELSEWHERE}`, `teleport ${ANCHOR}`, "interact"]);
  });

  it("times out naming the surface when the overworld never mounts", async () => {
    const { qa } = await pageFixture({ window: { __caps: CAPS() }, location: { href: "http://localhost:5174/d97" }, innerWidth: 1440, innerHeight: 900 });
    await expect(qa.d97.state({ timeout: 1_000 })).rejects.toMatchObject({ name: "QaTimeoutError" });
    await expect(qa.d97.state({ timeout: 1_000 })).rejects.toThrow(/window\.__d97/);
  });

  it("waits for a named panel and reports its keyed hook, rejecting unknown names", async () => {
    let shownIn = 3;
    const preview = { getAttribute: (/** @type {string} */ name) => (name === "data-d97-encounter-preview" ? ANCHOR : null) };
    const selectors = /** @type {string[]} */ ([]);
    const win = {
      __caps: CAPS(),
      __qa: {
        rendered: (/** @type {{ selector: string }} */ { selector }) => {
          selectors.push(selector);
          return selector === "[data-d97-encounter-preview]" && --shownIn <= 0 ? preview : null;
        },
      },
    };
    const document = { querySelector: (/** @type {string} */ selector) => (selector === "[data-d97-encounter-preview]" ? preview : null) };
    const { qa } = await pageFixture({ window: win, document, location: { href: "http://localhost:5174/d97" }, innerWidth: 1440, innerHeight: 900 });
    expect(await qa.d97.waitForPanel("encounter-preview")).toEqual({ panel: "encounter-preview", id: ANCHOR });
    expect(selectors.length).toBe(3);
    await expect(qa.d97.waitForPanel(/** @type {import("./prelude.mjs").D97PanelName} */ (/** @type {unknown} */ ("nowhere")))).rejects.toThrow(/unknown panel nowhere/);
  });
});

/**
 * A synthetic dialogue panel over `nodes`, opening on `start`: the panel's
 * data attributes and buttons as `D97DialoguePanel` renders them, and a mouse
 * whose click presses the button `__qa.hitPoint` last resolved at that x.
 * A `stuck` Continue does nothing.
 *
 * @param {Record<string, { lines: number, choices: Array<{ index: number, next: import("../../src/types/identifiers").D97DialogueNodeId | null }> }>} nodes
 * @param {import("../../src/types/identifiers").D97DialogueNodeId} start
 * @param {{ stuck?: boolean }} [options]
 */
function dialogueFixture(nodes, start, { stuck = false } = {}) {
  /** @type {{ nodeId: string, line: number } | null} */
  let at = { nodeId: start, line: 0 };
  const presses = /** @type {string[]} */ ([]);
  /** @param {string} testId @param {() => void} press */
  const button = (testId, press) => ({ testId, press, getAttribute: (/** @type {string} */ name) => (name === "data-testid" ? testId : null) });
  const buttons = () => {
    if (at === null) return [];
    const position = at;
    const node = nodes[position.nodeId];
    if (node === undefined) throw new Error(`no synthetic node ${position.nodeId}`);
    if (position.line < node.lines - 1) return [button("d97-dialogue-continue", () => { if (!stuck) position.line += 1; })];
    if (node.choices.length === 0) return [button("d97-dialogue-close", () => { at = null; })];
    return node.choices.map(({ index, next }) => button(`d97-dialogue-choice-${String(index)}`, () => { at = next === null ? null : { nodeId: next, line: 0 }; }));
  };
  const attributes = () => {
    if (at === null) return {};
    const node = nodes[at.nodeId];
    return {
      "data-d97-dialogue": DIALOGUE,
      "data-d97-dialogue-node": at.nodeId,
      "data-d97-dialogue-line": String(at.line),
      "data-d97-dialogue-last-line": String(node !== undefined && at.line >= node.lines - 1),
    };
  };
  const panel = {
    getAttribute: (/** @type {string} */ name) => /** @type {Record<string, string>} */ (attributes())[name] ?? null,
    querySelectorAll: (/** @type {string} */ selector) =>
      selector === '[data-testid^="d97-dialogue-choice-"]' ? buttons().filter((b) => b.testId.startsWith("d97-dialogue-choice-")) : [],
    querySelector: (/** @type {string} */ selector) => buttons().find((b) => selector === `[data-testid=${b.testId}]`) ?? null,
  };
  /** @param {string} selector */
  const resolve = (selector) => {
    const scoped = /^\[data-d97-dialogue-node="([^"]+)"\] (.*)$/.exec(selector);
    if (scoped !== null && scoped[1] !== at?.nodeId) return null;
    const inner = scoped === null ? selector : scoped[2];
    return buttons().find((b) => inner === `[data-testid=${b.testId}]`) ?? null;
  };
  const hit = /** @type {Array<{ testId: string, press: () => void }>} */ ([]);
  const document = { querySelector: (/** @type {string} */ selector) => (selector === "[data-d97-dialogue-node]" && at !== null ? panel : null) };
  const qaDom = {
    rendered: (/** @type {{ selector: string }} */ { selector }) => resolve(selector),
    hitPoint: (/** @type {{ selector: string }} */ { selector }) => {
      const found = resolve(selector);
      if (found === null) return null;
      return { x: hit.push(found) - 1, y: 0, covered: null };
    },
  };
  const mouse = {
    click: (/** @type {number} */ x) => {
      const pressed = hit[x];
      if (pressed === undefined) return Promise.reject(new Error(`nothing pressed at ${String(x)}`));
      presses.push(pressed.testId);
      pressed.press();
      return Promise.resolve();
    },
    move: async () => {},
  };
  return {
    presses,
    page: () => pageFixture({ window: { __caps: CAPS(), __qa: qaDom }, document, location: { href: "http://localhost:5174/d97" }, innerWidth: 1440, innerHeight: 900 }, () => {}, mouse),
  };
}

describe("qa.d97 dialogue", () => {
  const nodes = {
    [GREET]: { lines: 3, choices: [{ index: 0, next: ASK }, { index: 2, next: null }] },
    [ASK]: { lines: 2, choices: [] },
  };

  it("presses Continue through the lines until the node's choices show", async () => {
    const { presses, page } = dialogueFixture(nodes, GREET);
    const { qa } = await page();
    expect(await qa.d97.advanceDialogue()).toEqual({ kind: "choices", dialogueId: DIALOGUE, nodeId: GREET, choices: [0, 2], continues: 2 });
    expect(presses).toEqual(["d97-dialogue-continue", "d97-dialogue-continue"]);
  });

  it("presses Continue, then Close, until the conversation ends, or stops at the last line", async () => {
    const closing = dialogueFixture(nodes, ASK);
    const { qa } = await closing.page();
    expect(await qa.d97.advanceDialogue()).toEqual({ kind: "ended", dialogueId: DIALOGUE, nodeId: ASK, continues: 1 });
    expect(closing.presses).toEqual(["d97-dialogue-continue", "d97-dialogue-close"]);

    const stopping = dialogueFixture(nodes, ASK);
    const { qa: held } = await stopping.page();
    expect(await held.d97.advanceDialogue({ close: false })).toEqual({ kind: "last-line", dialogueId: DIALOGUE, nodeId: ASK, continues: 1 });
    expect(stopping.presses).toEqual(["d97-dialogue-continue"]);
  });

  it("times out with the dialogue's state when Continue does not advance it", async () => {
    const { page } = dialogueFixture(nodes, GREET, { stuck: true });
    const { qa } = await page();
    const failure = qa.d97.advanceDialogue({ timeout: 2_000 });
    await expect(failure).rejects.toMatchObject({ name: "QaTimeoutError" });
    await expect(failure).rejects.toThrow(new RegExp(`did not leave .*"nodeId":"${GREET}","line":0.* within 2000 ms \\(1 Continue presses\\)`));
  });

  it("times out naming the missing dialogue when none opens", async () => {
    const { qa } = await pageFixture({ window: { __caps: CAPS() }, document: { querySelector: () => null }, location: { href: "http://localhost:5174/d97" }, innerWidth: 1440, innerHeight: 900 });
    await expect(qa.d97.advanceDialogue({ timeout: 1_000 })).rejects.toThrow(/no dialogue opened within 1000 ms/);
  });

  it("takes a choice by its node and index and reports the next node or the end", async () => {
    const { presses, page } = dialogueFixture(nodes, GREET);
    const { qa } = await page();
    await qa.d97.advanceDialogue();
    expect(await qa.d97.chooseDialogue(GREET, 0)).toEqual({ nodeId: GREET, index: 0, next: ASK });
    expect(presses.at(-1)).toBe("d97-dialogue-choice-0");

    const ending = dialogueFixture(nodes, GREET);
    const { qa: other } = await ending.page();
    await other.d97.advanceDialogue();
    expect(await other.d97.chooseDialogue(GREET, 2)).toEqual({ nodeId: GREET, index: 2, next: null });
  });

  it("fails clearly on a choice the node does not offer, another node, or a node still mid-line", async () => {
    const { presses, page } = dialogueFixture(nodes, GREET);
    const { qa } = await page();
    await expect(qa.d97.chooseDialogue(GREET, 0)).rejects.toThrow(/shows no choices at line 0; advance it first/);
    await qa.d97.advanceDialogue();
    await expect(qa.d97.chooseDialogue(GREET, 1)).rejects.toThrow(/offers choices \[0,2\], not 1/);
    await expect(qa.d97.chooseDialogue(ASK, 0)).rejects.toThrow(new RegExp(`shows node ${GREET}, not ${ASK}`));
    expect(presses).toEqual(["d97-dialogue-continue", "d97-dialogue-continue"]);
  });
});

describe("qa.touch.longPress", () => {
  it("dispatches a touch pointerdown, holds, and releases on the same element", async () => {
    const order = /** @type {Array<{ type: string, pointerType: string, on: string, at: number }>} */ ([]);
    const element = (/** @type {string} */ name) => ({
      isConnected: true,
      dispatchEvent: (/** @type {{ type: string, init: { pointerType: string } }} */ event) => { order.push({ type: event.type, pointerType: event.init.pointerType, on: name, at: Date.now() }); return true; },
    });
    const source = element("source");
    const overlay = element("overlay");
    let hit = source;
    class PointerEvent {
      /** @param {string} type @param {{ pointerType: string }} init */
      constructor(type, init) { this.type = type; this.init = init; }
    }
    const win = { __caps: CAPS(), __qa: { rendered: () => source, hitPoint: () => ({ x: 20, y: 30, covered: null }) } };
    const document = { elementFromPoint: () => hit };
    const { qa, waitForTimeout } = await pageFixture({ window: win, document, PointerEvent, location: { href: "http://localhost:5174/d97" }, innerWidth: 390, innerHeight: 844 });
    waitForTimeout.mockImplementation(async (ms) => {
      // The reveal opens under the finger while it is held.
      hit = overlay;
      await vi.advanceTimersByTimeAsync(ms);
    });
    expect(await qa.touch.longPress("[data-card]", 700)).toEqual({ x: 20, y: 30 });
    expect(order.map(({ type, pointerType, on }) => [type, pointerType, on])).toEqual([["pointerdown", "touch", "source"], ["pointerup", "touch", "source"]]);
    expect((order[1]?.at ?? 0) - (order[0]?.at ?? 0)).toBe(700);
  });
});

describe("qa.battle.win", () => {
  /** @param {{ prod?: boolean, winner?: "victory" | "defeat", score?: number }} [options] */
  function battleFixture({ prod = false, winner = "victory", score = 2 } = {}) {
    const scoreToWin = 5;
    const probe = {
      battleId: parseBattleId("synthetic-battle"),
      decision: /** @type {{ kind: string, side: string } | null} */ ({ kind: "main", side: "player" }),
      pending: null,
      events: [],
      slice: { committed: { stack: [], result: /** @type {unknown} */ (null), sides: { player: { score }, enemy: { score: 0 } }, config: { scoreToWin }, instances: {} }, inFlight: null, publishedEvents: 0 },
    };
    const result = { getAttribute: () => winner };
    /** @type {Record<string, unknown>} */
    const elements = {};
    const win = {
      __caps: CAPS(),
      __engineProbe: probe,
      __qa: { rendered: () => null, hitPoint: () => null },
    };
    const document = {
      querySelector: (/** @type {string} */ selector) => {
        if (selector === "[data-engine-debug-side]") return { getAttribute: () => "player" };
        return elements[selector] ?? null;
      },
      querySelectorAll: () => [],
    };
    const context = { window: win, document, innerWidth: 1440, innerHeight: 900 };
    const run = (/** @type {Function} */ fn, /** @type {unknown} */ arg) =>
      /** @type {unknown} */ (runInNewContext(`(${String(fn)})(${JSON.stringify(arg) ?? "null"})`, context));
    const clicks = /** @type {string[]} */ ([]);
    let panel = false;
    const qa = /** @type {Omit<import("./prelude.mjs").Qa, "battle">} */ (/** @type {unknown} */ ({
      prod,
      read: vi.fn((/** @type {Function} */ fn, /** @type {unknown} */ arg) => Promise.resolve(run(fn, arg))),
      waitFor: vi.fn((/** @type {string} */ _label, /** @type {Function} */ fn, /** @type {unknown} */ arg) => Promise.resolve(run(fn, arg))),
      assertCaps: () => Promise.resolve(),
      note: vi.fn(),
      sleep: () => Promise.resolve(),
      timeoutError: (/** @type {string} */ message) => Object.assign(new Error(message), { name: "QaTimeoutError" }),
      isVisible: () => Promise.resolve(panel),
      waitVisible: () => Promise.resolve(),
      click: vi.fn((/** @type {string} */ selector) => {
        clicks.push(selector);
        if (selector === "[data-testid=engine-debug-open]") panel = true;
        if (selector === "[data-testid=engine-debug-score] button:last-of-type") {
          const player = probe.slice.committed.sides.player;
          player.score += 1;
          if (player.score >= scoreToWin) {
            probe.slice.committed.result = { kind: winner };
            probe.decision = null;
            elements["[data-battle-result-surface]"] = result;
          }
        }
        return Promise.resolve({ x: 0, y: 0 });
      }),
    }));
    return { driver: createBattleDriver(qa), qa, clicks, scoreToWin };
  }

  it("refuses a production build before touching the page", async () => {
    const { driver, qa } = battleFixture({ prod: true });
    await expect(driver.win()).rejects.toThrow(/--prod/);
    expect(qa.read).not.toHaveBeenCalled();
  });

  it("opens the debug panel and steps the player's score until the result surface shows", async () => {
    const { driver, clicks, scoreToWin } = battleFixture({ score: 2 });
    const won = await driver.win();
    expect(won.result).toBe("victory");
    expect(clicks[0]).toBe("[data-testid=engine-debug-open]");
    expect(clicks.filter((selector) => selector.includes("engine-debug-score")).length).toBe(scoreToWin - 2);
  });

  it("fails when the battle ends in another result", async () => {
    const { driver } = battleFixture({ winner: "defeat" });
    await expect(driver.win()).rejects.toThrow(/ended in defeat/);
  });
});
