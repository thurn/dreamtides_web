// @vitest-environment node
// `qa.battle.promptOrAutoAnswer` over a synthetic page and probe: a prompt
// role the player owes resolves as either its rendered, answerable prompt or
// the engine's `promptAutoAnswered` event after the cursor, whichever the
// battle reached first.
import { afterEach, describe, expect, it, vi } from "vitest";
import { runInNewContext } from "node:vm";
import { createBattleDriver } from "./prelude.mjs";
import { parseBattleId } from "../../src/types/identifiers";

afterEach(() => vi.useRealTimers());

const BATTLE = parseBattleId("synthetic-battle");

/** A battle screen whose only possible surface is a card awaiting targets, and the probe behind it. */
function fixture() {
  const stage = { visible: false, getAttribute: () => null };
  /** @type {Record<string, unknown>} */
  const elements = { "[data-battle-targeting-card-stage]": stage };
  /** @type {Array<{ seq: number, index: number, kind: string, instance: null, event: Record<string, unknown> }>} */
  const events = [];
  const probe = {
    battleId: BATTLE,
    decision: null,
    /** @type {{ kind: string, side: string, id: string, candidates: string[], purpose: { role: string } } | null} */
    pending: null,
    events,
    slice: {
      committed: { stack: [], result: null, sides: { player: { score: 0 }, enemy: { score: 0 } }, config: { scoreToWin: 25 }, instances: {} },
      /** @type {{ answers: Array<{ value: unknown, auto?: true }> } | null} */
      inFlight: null,
      publishedEvents: 0,
    },
  };
  const win = {
    __caps: { errors: /** @type {string[]} */ ([]), rejections: [], consoleErrors: [] },
    __engineProbe: probe,
    __qa: {
      rendered: (/** @type {{ selector: string }} */ { selector }) => {
        const element = /** @type {{ visible?: boolean } | undefined} */ (elements[selector]);
        return element?.visible === true ? element : null;
      },
      hitPoint: () => null,
    },
  };
  const document = {
    querySelector: (/** @type {string} */ selector) => elements[selector] ?? null,
    querySelectorAll: () => [],
  };
  const context = { window: win, document };
  const sleep = vi.fn((/** @type {number} */ ms) => {
    vi.advanceTimersByTime(ms);
    return Promise.resolve();
  });
  const qa = /** @type {import("./prelude.mjs").Qa} */ (/** @type {unknown} */ ({
    read: (/** @type {(arg: unknown) => unknown} */ fn, /** @type {unknown} */ arg) =>
      Promise.resolve(/** @type {unknown} */ (runInNewContext(`(${String(fn)})(${JSON.stringify(arg)})`, context))),
    assertCaps: (/** @type {string} */ label) =>
      win.__caps.errors.length > 0 ? Promise.reject(new Error(`${label}: __caps`)) : Promise.resolve(),
    note: vi.fn(),
    sleep,
    timeoutError: (/** @type {string} */ message) => Object.assign(new Error(message), { name: "QaTimeoutError" }),
  }));
  /** Shows a target prompt of `role` the player owes. */
  const render = (/** @type {string} */ role, id = "target-prompt") => {
    stage.visible = true;
    probe.pending = { kind: "chooseTargets", side: "player", id, candidates: ["i1"], purpose: { role } };
  };
  /** Records one engine batch under `seq`. */
  const publish = (/** @type {number} */ seq, /** @type {Record<string, unknown>[]} */ batch) =>
    events.push(...batch.map((event, index) => ({ seq, index, kind: String(event.kind), instance: null, event })));
  const auto = (/** @type {string} */ side, /** @type {string} */ role) =>
    ({ kind: "promptAutoAnswered", side, prompt: "chooseTargets", purpose: { source: "i5", cardId: null, ability: 0, role } });
  vi.useFakeTimers();
  return { driver: createBattleDriver(qa), probe, win, render, publish, auto, sleep };
}

const start = { battleId: BATTLE, seq: -1, index: -1 };

describe("qa.battle.promptOrAutoAnswer", () => {
  it("resolves with the rendered, answerable prompt of the role when it shows first", async () => {
    const { driver, render, publish } = fixture();
    publish(2, [{ kind: "cardPlayed", side: "player" }]);
    render("target");
    const result = await driver.promptOrAutoAnswer({ role: "target", since: start });
    expect(result.outcome).toBe("rendered");
    if (result.outcome !== "rendered") return;
    expect(result.prompt).toMatchObject({ id: "target-prompt", surface: "target", answerable: true });
    expect(result.cursor).toEqual({ battleId: BATTLE, seq: 2, index: 0 });
  });

  it("resolves with the auto-answered event first, with its forced answer while the step is in flight", async () => {
    const { driver, probe, render, publish, auto } = fixture();
    publish(5, [{ kind: "cardPlayed", side: "player" }, auto("player", "target")]);
    // The same step suspends at a later rendered prompt of the same role.
    probe.slice.inFlight = { answers: [{ value: ["i9"], auto: true }] };
    probe.slice.publishedEvents = 2;
    render("target", "later-prompt");
    const result = await driver.promptOrAutoAnswer({ role: "target", since: start });
    expect(result).toMatchObject({ outcome: "autoAnswered", answer: ["i9"], cursor: { battleId: BATTLE, seq: 5, index: 1 } });
    if (result.outcome !== "autoAnswered") return;
    expect(result.event.event).toMatchObject({ kind: "promptAutoAnswered", side: "player", purpose: { role: "target" } });
    const next = await driver.promptOrAutoAnswer({ role: "target", since: result.cursor });
    expect(next).toMatchObject({ outcome: "rendered", prompt: { id: "later-prompt" } });

    probe.slice.inFlight = null;
    probe.slice.publishedEvents = 0;
    expect(await driver.promptOrAutoAnswer({ role: "target", since: start })).toMatchObject({ outcome: "autoAnswered", answer: null });
  });

  it("ignores auto-answers for another role or the enemy, and prompts of another role", async () => {
    const { driver, render, publish, auto } = fixture();
    publish(3, [auto("player", "playRoute"), auto("enemy", "target")]);
    render("chooseCost");
    await expect(driver.promptOrAutoAnswer({ role: "target", since: start, timeout: 0 })).rejects.toMatchObject({ name: "QaTimeoutError" });
    render("target");
    expect(await driver.promptOrAutoAnswer({ role: "target", since: start })).toMatchObject({ outcome: "rendered" });
  });

  it("ignores an auto-answer at or before the cursor", async () => {
    const { driver, publish, auto } = fixture();
    publish(3, [auto("player", "target")]);
    const since = { battleId: BATTLE, seq: 3, index: 0 };
    await expect(driver.promptOrAutoAnswer({ role: "target", since, timeout: 0 })).rejects.toMatchObject({ name: "QaTimeoutError" });
    expect(await driver.promptOrAutoAnswer({ role: "target", since: null, timeout: 0 })).toMatchObject({ outcome: "autoAnswered" });
    publish(6, [auto("player", "target")]);
    expect(await driver.promptOrAutoAnswer({ role: "target", since })).toMatchObject({ cursor: { seq: 6, index: 0 } });
  });

  it("times out with a structured error after polling, and fails at once on another battle or __caps", async () => {
    const { driver, probe, win, sleep } = fixture();
    const waiting = driver.promptOrAutoAnswer({ role: "target", since: start, timeout: 1_000, pollMs: 100, label: "synthetic wait" });
    await expect(waiting).rejects.toMatchObject({ name: "QaTimeoutError" });
    await expect(waiting).rejects.toThrow(/^synthetic wait: timed out after 1000 ms/);
    expect(sleep.mock.calls.length).toBeGreaterThanOrEqual(10);
    probe.battleId = parseBattleId("another-battle");
    await expect(driver.promptOrAutoAnswer({ role: "target", since: start })).rejects.toThrow(/another-battle/);
    probe.battleId = BATTLE;
    win.__caps.errors.push("synthetic failure");
    await expect(driver.promptOrAutoAnswer({ role: "target", since: start })).rejects.toThrow(/__caps/);
  });
});
