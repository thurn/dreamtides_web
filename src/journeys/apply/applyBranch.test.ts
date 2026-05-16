// applyBranch dispatch loop tests.
//
// `applyBranch` shares the dispatch frame with `applyOption` but is indexed
// off `branch.id` instead of `option.number`. These tests replicate the two
// most load-bearing assertions from `applyOption.test.ts` against a tree
// branch fixture:
//
//   1. Cost-before-effect ordering.
//   2. Locked re-check aborts the apply before any mutation runs and emits
//      `dream_journey_locked_at_apply` (carrying `branchId`, not
//      `optionNumber`).
//
// Per-template apply behaviour is covered by the per-template suites; the
// remaining frame-level invariants (malformed envelopes, missing templateIds,
// success log payload, source string convention, no-op return) are pinned in
// `applyOption.test.ts` because the two entry points share their inner loop.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildFixtureContext } from "../journey/shapes/__shared__/fixture";
import type { Cost, Reward } from "../journey/shared/types";
import { makeUnlockedBranch } from "../journey/manifest";
import type { JourneyTreeBranch } from "../journey/manifest";
import { createRecordingMutations } from "./testing/recordingMutations";

const stubCosts = new Map<string, Cost>();
const stubRewards = new Map<string, Reward>();

vi.mock("../journey/shared/costs", async () => {
  const actual = await vi.importActual<typeof import("../journey/shared/costs")>(
    "../journey/shared/costs",
  );
  return {
    ...actual,
    findCost: (id: string): Cost | undefined => stubCosts.get(id),
  };
});

vi.mock("../journey/shared/rewards", async () => {
  const actual = await vi.importActual<typeof import("../journey/shared/rewards")>(
    "../journey/shared/rewards",
  );
  return {
    ...actual,
    findReward: (id: string): Reward | undefined => stubRewards.get(id),
  };
});

const { applyBranch } = await import("./applyBranch");
const loggingModule = await import("../../logging");

const META = {
  siteId: "site-7",
  journeyId: "journey-abc",
  shapeId: "complete_decision_tree" as const,
};

function costEnvelope(templateId: string, params: Record<string, unknown> = {}): unknown {
  return {
    kind: "shared_cost_template",
    templateId,
    params,
    text: `cost:${templateId}`,
    convertedEssence: 0,
  };
}

function rewardEnvelope(templateId: string, params: Record<string, unknown> = {}): unknown {
  return {
    kind: "shared_reward_template",
    templateId,
    params,
    text: `reward:${templateId}`,
    convertedEssence: 0,
  };
}

function makeBranch(opts: {
  id?: string;
  costs?: unknown[];
  effects?: unknown[];
}): JourneyTreeBranch {
  return makeUnlockedBranch({
    id: opts.id ?? "branch-1",
    label: "A",
    kind: "player_choice",
    text: "test branch",
    operations: [],
    costs: opts.costs ?? [],
    effects: opts.effects ?? [],
    burdens: [],
    targets: [],
    triggers: [],
    routeEffects: [],
    costConvertedEssence: 0,
    effectConvertedEssence: 0,
    burdenConvertedEssence: 0,
    uncertaintyConvertedEssence: 0,
    netConvertedEssence: 0,
  });
}

function payEssenceStub(): Cost<{ x: number }> {
  return {
    id: "pay_essence",
    weight: 1,
    rollParams: () => ({ x: 50 }),
    cec: () => 50,
    viable: () => true,
    locked: (p, ctx) => p.x > ctx.state.quest.resources.essence,
    render: (p) => `Pay ${p.x} essence`,
    apply: (p, _ctx, mut) => {
      mut.changeEssence(-p.x, "dream_journey:pay_essence");
    },
  };
}

function gainEssenceStub(): Reward<{ x: number }> {
  return {
    id: "gain_essence",
    weight: 1,
    rollParams: () => ({ x: 30 }),
    cec: () => 30,
    viable: () => true,
    render: (p) => `Gain ${p.x} essence`,
    apply: (p, _ctx, mut) => {
      mut.changeEssence(p.x, "dream_journey:gain_essence");
    },
  };
}

beforeEach(() => {
  stubCosts.clear();
  stubRewards.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("applyBranch", () => {
  it("calls cost mutations before reward mutations (ordering)", () => {
    stubCosts.set("pay_essence", payEssenceStub());
    stubRewards.set("gain_essence", gainEssenceStub());

    const ctx = buildFixtureContext();
    const { mut, calls } = createRecordingMutations();
    const branch = makeBranch({
      id: "node-root.A",
      costs: [costEnvelope("pay_essence", { x: 50 })],
      effects: [rewardEnvelope("gain_essence", { x: 30 })],
    });

    vi.spyOn(loggingModule, "logEvent").mockImplementation(
      () => ({ event: "", seq: 0, timestamp: "" }) as never,
    );

    const result = applyBranch(branch, META, ctx, mut);

    expect(result).toEqual({ done: true });
    expect(calls).toEqual([
      { method: "changeEssence", args: [-50, "dream_journey:pay_essence"] },
      { method: "changeEssence", args: [30, "dream_journey:gain_essence"] },
    ]);
  });

  it("aborts when a cost reports locked at apply time and logs branchId", () => {
    stubCosts.set("pay_essence", payEssenceStub());
    stubRewards.set("gain_essence", gainEssenceStub());

    const baseCtx = buildFixtureContext();
    const ctx = {
      ...baseCtx,
      state: {
        quest: {
          ...baseCtx.state.quest,
          resources: { ...baseCtx.state.quest.resources, essence: 0 },
        },
      },
    };

    const { mut, calls } = createRecordingMutations();
    const branch = makeBranch({
      id: "node-root.B",
      costs: [costEnvelope("pay_essence", { x: 50 })],
      effects: [rewardEnvelope("gain_essence", { x: 30 })],
    });

    const logSpy = vi
      .spyOn(loggingModule, "logEvent")
      .mockImplementation(() => ({ event: "", seq: 0, timestamp: "" }) as never);

    const result = applyBranch(branch, META, ctx, mut);

    expect(result).toEqual({ done: true });
    expect(calls).toEqual([]);

    const lockedEvents = logSpy.mock.calls.filter(
      ([event]) => event === "dream_journey_locked_at_apply",
    );
    const appliedEvents = logSpy.mock.calls.filter(
      ([event]) => event === "dream_journey_applied",
    );
    expect(lockedEvents).toHaveLength(1);
    expect(appliedEvents).toHaveLength(0);
    expect(lockedEvents[0][1]).toMatchObject({
      siteId: META.siteId,
      journeyId: META.journeyId,
      shapeId: META.shapeId,
      branchId: "node-root.B",
    });
  });
});
