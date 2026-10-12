import { runInNewContext } from "node:vm";
// Public scenario results from a synthetic QA host; no browser or production data.
import { afterEach, expect, it, vi } from "vitest";
import cardLabPlay from "./card-lab-play.mjs";

afterEach(() => vi.unstubAllGlobals());
const uuid = "5e5e5e5e-0000-4000-8000-000000022800";

/** @param {"player" | "enemy"} side @param {Record<string, unknown>} [source] @param {string} [identity] @param {boolean} [serialized] @param {boolean} [defaults] */
async function scenario(side, source = { kind: "dreamsign", side, index: 0 }, identity = uuid, serialized = false, defaults = false) {
  const opposite = side === "player" ? "enemy" : "player";
  vi.stubGlobal("window", { __cardLab: { card: "", dreamsign: uuid, side, status: "ready", reason: null, detail: null, eligibleVariants: ["base"], entityKind: "dreamsign", cardStatus: "pending", cardType: "Dreamsign" }, __engineProbe: {
    slice: { committed: { instances: {}, stack: [], result: null, turn: { active: side, phase: "day" }, sides: { [side]: { avatar: null, dreamsigns: [{ id: identity }] }, [opposite]: { avatar: null, dreamsigns: [] } } }, inFlight: null }, decision: { side: "player" }, pending: null,
    events: [{ seq: 1, index: 0, event: { kind: "phaseChanged", active: side, phase: "day" } }, { seq: 1, index: 1, event: { kind: "triggerResolved", source, controller: side } }],
  } });
  const qa = /** @type {import("../prelude.mjs").Qa} */ (/** @type {unknown} */ ({
    args: { dreamsign: uuid, variant: "base", as: side }, viewport: { width: 1440, height: 900 },
    open: async () => {}, waitVisible: async () => {},
    waitFor: (/** @type {string} */ _label, /** @type {() => unknown} */ observe) => Promise.resolve(observe()),
    read: (/** @type {(arg: unknown) => unknown} */ observe, /** @type {unknown} */ arg) => Promise.resolve(observe(arg)),
    note: () => {}, caps: () => Promise.resolve({ errors: [], rejections: [], consoleErrors: [] }), isTimeout: () => false,
    battle: { playUntil: async (/** @type {(battle: unknown) => Promise<boolean>} */ settled) => { expect(await settled({ canPass: true })).toBe(true); return { answers: 0, passes: 0 }; } },
  }));
  if (defaults) { delete qa.args.as; delete qa.args.variant; }
  return serialized ? /** @type {ReturnType<typeof cardLabPlay>} */ (runInNewContext(`(${String(cardLabPlay)})(qa)`, { qa, window: globalThis.window })) : cardLabPlay(qa);
}

it.each(["player", "enemy"])("reports the exact %s Dreamsign source without claiming pending ability completion", async side => {
  expect(await scenario(/** @type {"player" | "enemy"} */ (side))).toMatchObject({ verdict: "pending", exercised: true });
});
it.each([{ kind: "dreamsign", side: "enemy", index: 0 }, { kind: "dreamsign", side: "player", index: 1 }, { kind: "avatar", side: "player" }])("excludes unrelated source %j", async source => {
  expect(await scenario("player", source)).toMatchObject({ verdict: "pending", exercised: false });
});

it("rejects a slot whose current UUID differs from the initialized request", async () => {
  expect(await scenario("player", { kind: "dreamsign", side: "player", index: 0 }, "5e5e5e5e-0000-4000-8000-000000022801")).toMatchObject({ verdict: "fail", exercised: false });
});

it("runs the public serialized scenario in a host without browser URL helpers", async () => {
  expect(await scenario("player", { kind: "dreamsign", side: "player", index: 0 }, uuid, true)).toMatchObject({ verdict: "pending", exercised: true });
});

it("uses the same default controller and variant in the serialized request and observation", async () => {
  expect(await scenario("player", { kind: "dreamsign", side: "player", index: 0 }, uuid, true, true)).toMatchObject({ verdict: "pending", exercised: true });
});
