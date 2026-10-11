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
