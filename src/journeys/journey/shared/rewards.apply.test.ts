// Per-template `apply` tests for Resource rewards (Task 9).
//
// Mirrors `costs.apply.test.ts` for the Reward side of the catalog. Each test
// exercises one Resource reward template against the recording
// `JourneyMutations` double from `src/journeys/apply/testing/` and asserts the
// exact sequence of recorded mutation calls. Random-range rewards roll within
// the rolled bounds at apply time via `Math.random`, so the only correctness
// signal for that template is "the recorded arg lies inside [min,max]".
//
// Per-template apply behaviour for the other reward families (cards, dreamsigns,
// transfigurations, atlas/route, battle/shop, draft, meta-compound, visual)
// lives in later per-task suites alongside Tasks 10-18.

import { describe, expect, it } from "vitest";

import type { ContentBundle } from "../../content/types";
import { createRecordingMutations } from "../../apply/testing/recordingMutations";
import type { JourneyContext, QuestStateProjection } from "../context";

import { getReward } from "./rewards";

function buildContext(overrides: {
  essence?: number;
  maxEssence?: number;
  omens?: number;
} = {}): JourneyContext {
  const quest: QuestStateProjection = {
    seed: "rewards-apply-test",
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

describe("Resource reward apply", () => {
  it("gain_essence calls changeEssence with +x and labeled source", () => {
    const t = getReward("gain_essence");
    const ctx = buildContext();
    const { mut, calls } = createRecordingMutations();
    t.apply({ x: 75 }, ctx, mut, undefined);
    expect(calls).toEqual([
      { method: "changeEssence", args: [75, "dream_journey:gain_essence"] },
    ]);
  });

  it("gain_omens calls changeOmens with +x", () => {
    const t = getReward("gain_omens");
    const ctx = buildContext();
    const { mut, calls } = createRecordingMutations();
    t.apply({ x: 2 }, ctx, mut, undefined);
    expect(calls).toEqual([
      { method: "changeOmens", args: [2, "dream_journey:gain_omens"] },
    ]);
  });

  it("set_essence_to_percent_of_max calls setEssence(floor(maxEssence * percent / 100), ...)", () => {
    // maxEssence=200, percent=75 → floor(200 * 75 / 100) = 150.
    const t = getReward("set_essence_to_percent_of_max");
    const ctx = buildContext({ maxEssence: 200 });
    const { mut, calls } = createRecordingMutations();
    t.apply({ percent: 75 }, ctx, mut, undefined);
    expect(calls).toEqual([
      {
        method: "setEssence",
        args: [150, "dream_journey:set_essence_to_percent_of_max"],
      },
    ]);
  });

  it("set_essence_to_percent_of_max can exceed maxEssence (e.g. percent=125)", () => {
    // The mutation layer clamps; the template body must still emit the
    // un-clamped requested value so the clamp policy stays a property of the
    // mutation, not the template.
    const t = getReward("set_essence_to_percent_of_max");
    const ctx = buildContext({ maxEssence: 200 });
    const { mut, calls } = createRecordingMutations();
    t.apply({ percent: 125 }, ctx, mut, undefined);
    expect(calls).toEqual([
      {
        method: "setEssence",
        args: [250, "dream_journey:set_essence_to_percent_of_max"],
      },
    ]);
  });

  it("gain_essence_random_range rolls within [min,max] and calls changeEssence with the positive roll", () => {
    // Wave 1 applies the range reward via `Math.random`; we cannot pin the
    // literal roll. The contract is: a single `changeEssence` call whose
    // first arg is in [min, max].
    const t = getReward("gain_essence_random_range");
    const ctx = buildContext();
    const { mut, calls } = createRecordingMutations();
    t.apply({ min: 30, max: 60 }, ctx, mut, undefined);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("changeEssence");
    expect(calls[0].args[1]).toBe("dream_journey:gain_essence_random_range");
    const delta = calls[0].args[0] as number;
    expect(Number.isInteger(delta)).toBe(true);
    expect(delta).toBeGreaterThanOrEqual(30);
    expect(delta).toBeLessThanOrEqual(60);
  });

  it("gain_essence_to_max calls setEssence(maxEssence(ctx), ...)", () => {
    const t = getReward("gain_essence_to_max");
    const ctx = buildContext({ essence: 100, maxEssence: 200 });
    const { mut, calls } = createRecordingMutations();
    t.apply({}, ctx, mut, undefined);
    expect(calls).toEqual([
      { method: "setEssence", args: [200, "dream_journey:gain_essence_to_max"] },
    ]);
  });

  it("increase_max_essence calls changeMaxEssence with +p.amount", () => {
    const t = getReward("increase_max_essence");
    const ctx = buildContext({ maxEssence: 200 });
    const { mut, calls } = createRecordingMutations();
    t.apply({ amount: 25 }, ctx, mut, undefined);
    expect(calls).toEqual([
      { method: "changeMaxEssence", args: [25, "dream_journey:increase_max_essence"] },
    ]);
  });
});
