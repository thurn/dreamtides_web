import { describe, expect, it } from "vitest";
import { runInNewContext } from "node:vm";
import { createBattleDriver } from "./prelude.mjs";

/** Public synthetic DOM hooks, with visibility and hit observations supplied by the page. */
function fixture() {
  /** @type {Record<string, string>} */
  const bannerAttributes = { "data-battle-prompt-id": "synthetic-prompt" };
  const rank = { getAttribute: () => "enemy-back" };
  const card = (/** @type {string} */ id) => {
    /** @type {Record<string, string>} */
    const attributes = { "data-battle-card-id": id, role: "button" };
    return { attributes, visible: true, covered: false, ranked: true,
      getAttribute: (/** @type {string} */ key) => attributes[key] ?? null,
      hasAttribute: (/** @type {string} */ key) => key in attributes,
      closest() { return this.ranked ? rank : null; } };
  };
  const first = card("i1");
  const second = card("i2");
  const banner = { visible: true, getAttribute: (/** @type {string} */ key) => bannerAttributes[key] ?? null };
  const stage = { visible: false, getAttribute: () => null };
  const gallery = { visible: false, getAttribute: () => null };
  const board = { visible: false, getAttribute: () => null };
  const elements = {
    "[data-battle-prompt-banner]": banner,
    "[data-battle-targeting-card-stage]": stage,
    "[data-battle-card-picker-gallery]": gallery,
    "[data-battle-card-picker-controls]": board,
    '[data-battlefield-card][data-battle-card-id="i1"]': first,
    '[data-battlefield-card][data-battle-card-id="i2"]': second,
  };
  /** @param {string} selector */
  const lookup = (selector) => /** @type {Record<string, typeof first | typeof banner | typeof stage>} */ (elements)[selector] ?? null;
  const pending = { kind: "chooseTargets", side: "player", id: "synthetic-prompt", candidates: ["i1", "i2"] };
  const win = { __caps: { errors: [], rejections: [], consoleErrors: [] },
    __engineProbe: { decision: null, pending, events: [], slice: { inFlight: {}, committed: {
      stack: [], result: null, sides: { player: { score: 0 }, enemy: { score: 0 } }, config: { scoreToWin: 25 },
    } } },
    __qa: {
      rendered: (/** @type {{selector: string}} */ { selector }) => { const element = lookup(selector); return element?.visible ? element : null; },
      hitPoint: (/** @type {{selector: string}} */ { selector }) => {
        const element = lookup(selector);
        return element !== null && "covered" in element ? { covered: element.covered ? "overlay" : null } : null;
      },
    },
  };
  const document = {
    querySelector: lookup,
    querySelectorAll: (/** @type {string} */ selector) => selector === "[data-battle-card-id]" ? [first, second] : [],
  };
  const context = { window: win, document };
  const qa = /** @type {import("./prelude.mjs").Qa} */ (/** @type {unknown} */ ({
    read: (/** @type {(arg: unknown) => unknown} */ fn, /** @type {unknown} */ arg) => Promise.resolve(/** @type {unknown} */ (runInNewContext(`(${String(fn)})(${JSON.stringify(arg)})`, context))),
  }));
  return { driver: createBattleDriver(qa), first, second, banner, bannerAttributes, pending, stage, gallery, board };
}

describe("inline activated target observation", () => {
  it("requires the visible matching banner and actionable legal battlefield cards", async () => {
    const { driver, first } = fixture();
    first.visible = false;
    expect((await driver.state()).prompt).toMatchObject({
      surface: "target", kind: "chooseTargets", id: "synthetic-prompt", candidates: ["i2"], answerable: true,
    });
  });

  it("keeps state-only, hidden, covered, disabled, passive, wrong-owner and wrong-banner choices unanswerable", async () => {
    for (const change of ["banner", "hidden", "covered", "disabled", "passive", "unranked", "owner", "id", "kind"]) {
      const { driver, first, second, banner, bannerAttributes, pending } = fixture();
      second.visible = false;
      if (change === "banner") banner.visible = false;
      if (change === "hidden") first.visible = false;
      if (change === "covered") first.covered = true;
      if (change === "disabled") first.attributes["aria-disabled"] = "true";
      if (change === "passive") delete first.attributes.role;
      if (change === "unranked") first.ranked = false;
      if (change === "owner") pending.side = "enemy";
      if (change === "id") bannerAttributes["data-battle-prompt-id"] = "another-prompt";
      if (change === "kind") pending.kind = "chooseCards";
      const prompt = (await driver.state()).prompt;
      expect(prompt?.answerable ?? false).toBe(false);
      expect(prompt?.surface ?? null).toBe(null);
    }
  });

  it("preserves existing source-play, gallery and board prompt surfaces", async () => {
    for (const surface of ["target", "gallery", "board"]) {
      const { driver, stage, gallery, board, pending } = fixture();
      pending.kind = surface === "target" ? "chooseTargets" : "chooseCards";
      stage.visible = surface === "target";
      gallery.visible = surface === "gallery";
      board.visible = surface === "board";
      expect((await driver.state()).prompt).toMatchObject({ surface, candidates: ["i1", "i2"], answerable: true });
    }
  });
});

describe("battle pointer taps", () => {
  it("answers an off-screen gallery candidate and refuses its disabled nested fallback", async () => {
    for (const disabled of [false, true]) {
      let top = 900;
      let selected = false;
      const attributes = { "data-testid": "battle-card-picker-candidate-i1", "aria-disabled": String(disabled) };
      const candidate = {
        getAttribute: (/** @type {string} */ key) => /** @type {Record<string, string>} */ (attributes)[key] ?? null,
        hasAttribute: () => false,
        scrollIntoView: () => { top = 100; },
        getBoundingClientRect: () => ({ left: 20, right: 100, top, height: 80 }),
        contains: (/** @type {unknown} */ hit) => hit === candidate,
      };
      const gallery = { getAttribute: () => null };
      const lookup = (/** @type {string} */ selector) =>
        selector.includes("candidate-i1") || (disabled && selector.includes('"i1"')) ? candidate :
          selector === "[data-battle-card-picker-gallery]" && !selected ? gallery : null;
      const context = { innerWidth: 390, innerHeight: 844,
        window: { __qa: { rendered: (/** @type {{selector: string}} */ { selector }) => {
          const element = lookup(selector);
          return element === candidate && top >= 844 ? null : element;
        } } },
        document: { querySelector: lookup,
          querySelectorAll: (/** @type {string} */ selector) => selector.includes("gallery]") && !selected ? [candidate] : [],
          elementFromPoint: () => top < 844 ? candidate : null },
      };
      const qa = /** @type {import("./prelude.mjs").Qa} */ (/** @type {unknown} */ ({
        page: { mouse: { click: () => { selected = true; } } },
        sleep: async () => {}, rest: async () => {}, assertCaps: async () => {},
        read: (/** @type {(arg: unknown) => unknown} */ fn, /** @type {unknown} */ arg) =>
          Promise.resolve(/** @type {unknown} */ (runInNewContext(`(${String(fn)})(${JSON.stringify(arg)})`, context))),
      }));
      const driver = createBattleDriver(qa);
      expect(await driver.answer()).toBe(!disabled);
      expect(selected).toBe(!disabled);
      expect((await driver.state()).prompt === null).toBe(!disabled);
    }
  });

  it("brings a clipped candidate into view and clicks only its uncovered area", async () => {
    let scrollTop = 0;
    let covered = false;
    /** @type {{ x: number, y: number }[]} */
    const clicks = [];
    const child = {};
    const overlay = {};
    const element = {
      // A candidate inside a scroll container starts below the viewport.
      scrollIntoView: () => { scrollTop = 600; },
      getBoundingClientRect: () => ({ left: 20, right: 100, top: 900 - scrollTop, height: 80 }),
      contains: (/** @type {unknown} */ hit) => hit === child,
    };
    const context = {
      innerWidth: 390, innerHeight: 844,
      document: {
        querySelector: (/** @type {string} */ selector) => selector === "[data-candidate]" ? element : null,
        elementFromPoint: (/** @type {number} */ x, /** @type {number} */ y) => {
          const box = element.getBoundingClientRect();
          // Its centre is covered, as in a fanned hand; the left edge is free.
          return !covered && x < 32 && y >= box.top && y <= box.top + box.height && y < 844 ? child : overlay;
        },
      },
    };
    const qa = /** @type {import("./prelude.mjs").Qa} */ (/** @type {unknown} */ ({
      page: { mouse: { click: (/** @type {number} */ x, /** @type {number} */ y) => { clicks.push({ x, y }); } } },
      rest: async () => {},
      read: (/** @type {(arg: unknown) => unknown} */ fn, /** @type {unknown} */ arg) =>
        Promise.resolve(/** @type {unknown} */ (runInNewContext(`(${String(fn)})(${JSON.stringify(arg)})`, context))),
    }));
    const driver = createBattleDriver(qa);
    expect(await driver.tap("[data-candidate]")).toBe(true);
    expect(scrollTop).toBeGreaterThan(0);
    expect(clicks).toHaveLength(1);
    expect(clicks[0]?.x).toBeLessThan(32);
    expect(clicks[0]?.y).toBeGreaterThanOrEqual(element.getBoundingClientRect().top);
    covered = true;
    expect(await driver.tap("[data-candidate]")).toBe(false);
    expect(await driver.tap("[data-missing]")).toBe(false);
    expect(clicks).toHaveLength(1);
  });
});
