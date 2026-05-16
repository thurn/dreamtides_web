// Per-template `apply` tests for Resource costs (Task 9).
//
// Each test exercises one Resource cost template against the recording
// `JourneyMutations` double from `src/journeys/apply/testing/` and asserts the
// exact sequence of recorded mutation calls. Together the tests catch wiring
// errors that the (broader) costs.test.ts viability/lock suites cannot, such
// as a template calling `changeEssence(+x)` instead of `changeEssence(-x)`,
// or passing a wrong source label.
//
// Per-template-family one literal-value assertion is justified per the plan:
// random-range templates roll within the rolled bounds at apply time, so the
// only correctness signal is "the recorded arg lies inside [min,max]". Every
// other template's recorded args derive trivially from the params, so the
// test asserts the literal value (e.g. `-50` for `pay_essence` with `x=50`).
//
// The non-random-range tests double as smoke coverage for the `Cost.apply`
// signature (`(params, ctx, mut, chooserResolution?) => void`) by passing
// `undefined` for the chooser resolution.
//
// Per-template apply behaviour for the other cost families (banes, dreamsigns,
// cards, atlas/route, battle/shop, meta-compound, visual) lives in later
// per-task suites alongside Tasks 10-18.

import { describe, expect, it } from "vitest";

import type { ContentBundle } from "../../content/types";
import { createRecordingMutations } from "../../apply/testing/recordingMutations";
import type { JourneyContext, QuestStateProjection } from "../context";

import { getCost } from "./costs";

function buildContext(overrides: {
  essence?: number;
  maxEssence?: number;
  omens?: number;
} = {}): JourneyContext {
  const quest: QuestStateProjection = {
    seed: "costs-apply-test",
    resources: {
      essence: overrides.essence ?? 100,
      maxEssence: overrides.maxEssence ?? 200,
      omens: overrides.omens ?? 3,
      dreamscape: 0,
    },
    selectedTides: [],
    deck: {
      entries: [],
      summary: { totalCards: 0, starterCards: 0, uniqueCards: 0 },
    },
    draftPool: [],
    activeDreamsigns: [],
    dreamsignPoolIds: [],
    banes: [],
    dreamcaller: { id: "" },
  };
  const content: ContentBundle = {
    cards: [],
    dreamcallers: [],
    dreamsigns: [],
  };
  return { content, contentVersion: "test", state: { quest } };
}

describe("Resource cost apply", () => {
  it("pay_essence calls changeEssence with negative x and labeled source", () => {
    const t = getCost("pay_essence");
    const ctx = buildContext();
    const { mut, calls } = createRecordingMutations();
    t.apply({ x: 50 }, ctx, mut, undefined);
    expect(calls).toEqual([
      { method: "changeEssence", args: [-50, "dream_journey:pay_essence"] },
    ]);
  });

  it("pay_omens calls changeOmens with negative x", () => {
    const t = getCost("pay_omens");
    const ctx = buildContext();
    const { mut, calls } = createRecordingMutations();
    t.apply({ x: 2 }, ctx, mut, undefined);
    expect(calls).toEqual([
      { method: "changeOmens", args: [-2, "dream_journey:pay_omens"] },
    ]);
  });

  it("pay_max_essence calls changeMaxEssence with -maxEssence(ctx)", () => {
    // Per spec table: `mut.changeMaxEssence(-maxEssence(ctx), "...")`. With a
    // max-essence of 200, the template zeros the cap by subtracting the full
    // current value.
    const t = getCost("pay_max_essence");
    const ctx = buildContext({ maxEssence: 200 });
    const { mut, calls } = createRecordingMutations();
    t.apply({}, ctx, mut, undefined);
    expect(calls).toEqual([
      { method: "changeMaxEssence", args: [-200, "dream_journey:pay_max_essence"] },
    ]);
  });

  it("pay_essence_random_range rolls within [min,max] and calls changeEssence with the negated roll", () => {
    // Wave 1 applies the range cost via `Math.random`; we cannot pin the
    // literal roll. The contract is: a single `changeEssence` call whose
    // first arg is in [-max, -min] and whose source is the labeled string.
    const t = getCost("pay_essence_random_range");
    const ctx = buildContext();
    const { mut, calls } = createRecordingMutations();
    t.apply({ min: 30, max: 60 }, ctx, mut, undefined);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("changeEssence");
    expect(calls[0].args[1]).toBe("dream_journey:pay_essence_random_range");
    const delta = calls[0].args[0] as number;
    expect(Number.isInteger(delta)).toBe(true);
    expect(delta).toBeGreaterThanOrEqual(-60);
    expect(delta).toBeLessThanOrEqual(-30);
  });

  it("pay_percent_essence floors essence * percent / 100 and negates", () => {
    // essence=100, percent=50 → floor(100 * 50 / 100) = 50, negated = -50.
    const t = getCost("pay_percent_essence");
    const ctx = buildContext({ essence: 100 });
    const { mut, calls } = createRecordingMutations();
    t.apply({ percent: 50 }, ctx, mut, undefined);
    expect(calls).toEqual([
      { method: "changeEssence", args: [-50, "dream_journey:pay_percent_essence"] },
    ]);
  });

  it("pay_percent_essence floors (i.e. truncates) the partial-essence case", () => {
    // essence=33, percent=50 → floor(33 * 50 / 100) = floor(16.5) = 16.
    const t = getCost("pay_percent_essence");
    const ctx = buildContext({ essence: 33 });
    const { mut, calls } = createRecordingMutations();
    t.apply({ percent: 50 }, ctx, mut, undefined);
    expect(calls).toEqual([
      { method: "changeEssence", args: [-16, "dream_journey:pay_percent_essence"] },
    ]);
  });

  it("pay_all_remaining_essence calls setEssence(0, ...)", () => {
    const t = getCost("pay_all_remaining_essence");
    const ctx = buildContext({ essence: 100 });
    const { mut, calls } = createRecordingMutations();
    t.apply({}, ctx, mut, undefined);
    expect(calls).toEqual([
      { method: "setEssence", args: [0, "dream_journey:pay_all_remaining_essence"] },
    ]);
  });

  it("lose_max_essence calls changeMaxEssence with -p.amount", () => {
    const t = getCost("lose_max_essence");
    const ctx = buildContext({ maxEssence: 200 });
    const { mut, calls } = createRecordingMutations();
    t.apply({ amount: 50 }, ctx, mut, undefined);
    expect(calls).toEqual([
      { method: "changeMaxEssence", args: [-50, "dream_journey:lose_max_essence"] },
    ]);
  });
});
