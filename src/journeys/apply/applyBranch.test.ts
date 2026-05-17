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
import { requestIdFor } from "./chooserPlan";
import type { ChooserRequest, ChooserResolution } from "./chooserPlan";
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

const { applyBranch, branchRequestIdFor } = await import("./applyBranch");
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

function cardRequest(requestId: string): ChooserRequest {
  return {
    kind: "card",
    requestId,
    poolKind: "deck",
    deckFilter: { predicateId: "event" },
    minPicks: 1,
    maxPicks: 2,
    title: "Choose cards",
  };
}

function transfigureChosenCardsStub(
  id: string,
  request: ChooserRequest,
): Reward<Record<string, unknown>> {
  return {
    id,
    weight: 1,
    rollParams: () => ({}),
    cec: () => 0,
    viable: () => true,
    render: () => "Apply transfiguration",
    choosePlan: () => request,
    apply: (_params, _ctx, mut, resolution) => {
      if (resolution?.kind !== "card") {
        return;
      }
      for (const entryId of resolution.entryIds) {
        mut.transfigureDeckEntry(entryId, "Bronze", `dream_journey:${id}`);
      }
    },
  };
}

function chooseCardThenTransfigurationStub(id: string): Reward<Record<string, unknown>> {
  return {
    id,
    weight: 1,
    rollParams: () => ({}),
    cec: () => 0,
    viable: () => true,
    render: () => "Apply chosen transfiguration",
    choosePlan: (_params, _ctx, planning) => {
      const cardRequestId = planning.requestIdForSlot(0);
      if (!planning.resolutions.has(cardRequestId)) {
        return {
          ...cardRequest(cardRequestId),
          title: "Choose card",
        };
      }
      const transfigurationRequestId = planning.requestIdForSlot(1);
      if (!planning.resolutions.has(transfigurationRequestId)) {
        return {
          kind: "transfiguration",
          requestId: transfigurationRequestId,
          eligibleTransfigurations: ["Azure", "Bronze"],
          title: "Choose transfiguration",
        };
      }
      return undefined;
    },
    apply: (_params, _ctx, mut, _resolution, planning) => {
      const cardResolution = planning?.resolutions.get(planning.requestIdForSlot(0));
      const transfigurationResolution = planning?.resolutions.get(
        planning.requestIdForSlot(1),
      );
      if (
        cardResolution?.kind !== "card" ||
        transfigurationResolution?.kind !== "transfiguration"
      ) {
        return;
      }
      for (const entryId of cardResolution.entryIds) {
        mut.transfigureDeckEntry(
          entryId,
          transfigurationResolution.type,
          `dream_journey:${id}`,
        );
      }
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

  it("warns once and continues when a costs[] entry references an unknown templateId", () => {
    stubRewards.set("gain_essence", gainEssenceStub());

    const ctx = buildFixtureContext();
    const { mut, calls } = createRecordingMutations();
    const branch = makeBranch({
      id: "node-root.C",
      costs: [costEnvelope("does_not_exist_in_catalog", { x: 1 })],
      effects: [rewardEnvelope("gain_essence", { x: 30 })],
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(loggingModule, "logEvent").mockImplementation(
      () => ({ event: "", seq: 0, timestamp: "" }) as never,
    );

    const result = applyBranch(branch, META, ctx, mut);

    expect(result).toEqual({ done: true });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([
      { method: "changeEssence", args: [30, "dream_journey:gain_essence"] },
    ]);
  });

  it("warns once and continues when a costs[] entry fails narrowing", () => {
    stubCosts.set("pay_essence", payEssenceStub());

    const ctx = buildFixtureContext();
    const { mut, calls } = createRecordingMutations();
    const branch = makeBranch({
      id: "node-root.C",
      costs: [
        { kind: "shared_cost_template", params: {}, text: "x", convertedEssence: 0 },
        costEnvelope("pay_essence", { x: 50 }),
      ],
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(loggingModule, "logEvent").mockImplementation(
      () => ({ event: "", seq: 0, timestamp: "" }) as never,
    );

    const result = applyBranch(branch, META, ctx, mut);

    expect(result).toEqual({ done: true });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([
      { method: "changeEssence", args: [-50, "dream_journey:pay_essence"] },
    ]);
  });

  it("returns a branch chooser request without mutating, then commits with the resolution", () => {
    const templateId = "apply_named_transfiguration_to_chosen_predicate_cards";
    const request = cardRequest(branchRequestIdFor("node-root.C", templateId));
    stubRewards.set(templateId, transfigureChosenCardsStub(templateId, request));

    const ctx = buildFixtureContext();
    const { mut, calls } = createRecordingMutations();
    const branch = makeBranch({
      id: "node-root.C",
      effects: [rewardEnvelope(templateId)],
    });
    const resolutions = new Map<string, ChooserResolution>([
      [request.requestId, { kind: "card", entryIds: ["deck-entry-1"] }],
    ]);

    vi.spyOn(loggingModule, "logEvent").mockImplementation(
      () => ({ event: "", seq: 0, timestamp: "" }) as never,
    );

    expect(applyBranch(branch, META, ctx, mut)).toEqual({
      done: false,
      needsChoice: request,
    });
    expect(calls).toEqual([]);

    expect(applyBranch(branch, META, ctx, mut, resolutions)).toEqual({
      done: true,
    });
    expect(calls).toEqual([
      {
        method: "transfigureDeckEntry",
        args: [
          "deck-entry-1",
          "Bronze",
          "dream_journey:apply_named_transfiguration_to_chosen_predicate_cards",
        ],
      },
    ]);
  });

  it("lets one branch template ask for a second slot after the first slot is resolved", () => {
    const templateId = "apply_chosen_transfiguration_to_chosen_card";
    const firstRequest = {
      ...cardRequest(branchRequestIdFor("node-root.D", templateId, 0)),
      title: "Choose card",
    };
    const secondRequest: ChooserRequest = {
      kind: "transfiguration",
      requestId: branchRequestIdFor("node-root.D", templateId, 1),
      eligibleTransfigurations: ["Azure", "Bronze"],
      title: "Choose transfiguration",
    };
    stubRewards.set(templateId, chooseCardThenTransfigurationStub(templateId));

    const ctx = buildFixtureContext();
    const { mut, calls } = createRecordingMutations();
    const branch = makeBranch({
      id: "node-root.D",
      effects: [rewardEnvelope(templateId)],
    });
    const firstResolution = new Map<string, ChooserResolution>([
      [firstRequest.requestId, { kind: "card", entryIds: ["deck-1"] }],
    ]);
    const bothResolutions = new Map<string, ChooserResolution>([
      [firstRequest.requestId, { kind: "card", entryIds: ["deck-1"] }],
      [secondRequest.requestId, { kind: "transfiguration", type: "Azure" }],
    ]);

    vi.spyOn(loggingModule, "logEvent").mockImplementation(
      () => ({ event: "", seq: 0, timestamp: "" }) as never,
    );

    expect(applyBranch(branch, META, ctx, mut)).toEqual({
      done: false,
      needsChoice: firstRequest,
    });
    expect(calls).toEqual([]);

    expect(applyBranch(branch, META, ctx, mut, firstResolution)).toEqual({
      done: false,
      needsChoice: secondRequest,
    });
    expect(calls).toEqual([]);

    expect(applyBranch(branch, META, ctx, mut, bothResolutions)).toEqual({
      done: true,
    });
    expect(calls).toEqual([
      {
        method: "transfigureDeckEntry",
        args: [
          "deck-1",
          "Azure",
          "dream_journey:apply_chosen_transfiguration_to_chosen_card",
        ],
      },
    ]);
  });

  it("keeps repeated two-slot branch template occurrences from sharing request ids", () => {
    const templateId = "apply_chosen_transfiguration_to_chosen_card";
    const firstCardRequest = {
      ...cardRequest(branchRequestIdFor("node-root.E", templateId, 0)),
      title: "Choose card",
    };
    const firstTransfigurationRequest: ChooserRequest = {
      kind: "transfiguration",
      requestId: branchRequestIdFor("node-root.E", templateId, 1),
      eligibleTransfigurations: ["Azure", "Bronze"],
      title: "Choose transfiguration",
    };
    const secondCardRequest = {
      ...cardRequest(requestIdFor("node-root.E:entry:1", templateId, 0)),
      title: "Choose card",
    };
    const secondTransfigurationRequest: ChooserRequest = {
      kind: "transfiguration",
      requestId: requestIdFor("node-root.E:entry:1", templateId, 1),
      eligibleTransfigurations: ["Azure", "Bronze"],
      title: "Choose transfiguration",
    };
    stubRewards.set(templateId, chooseCardThenTransfigurationStub(templateId));

    const ctx = buildFixtureContext();
    const { mut, calls } = createRecordingMutations();
    const branch = makeBranch({
      id: "node-root.E",
      effects: [
        rewardEnvelope(templateId),
        rewardEnvelope(templateId),
      ],
    });
    const firstCardResolution = new Map<string, ChooserResolution>([
      [firstCardRequest.requestId, { kind: "card", entryIds: ["deck-1"] }],
    ]);
    const firstCompleteResolution = new Map<string, ChooserResolution>([
      [firstCardRequest.requestId, { kind: "card", entryIds: ["deck-1"] }],
      [firstTransfigurationRequest.requestId, { kind: "transfiguration", type: "Azure" }],
    ]);
    const secondCardResolution = new Map<string, ChooserResolution>([
      [firstCardRequest.requestId, { kind: "card", entryIds: ["deck-1"] }],
      [firstTransfigurationRequest.requestId, { kind: "transfiguration", type: "Azure" }],
      [secondCardRequest.requestId, { kind: "card", entryIds: ["deck-2"] }],
    ]);
    const allResolutions = new Map<string, ChooserResolution>([
      [firstCardRequest.requestId, { kind: "card", entryIds: ["deck-1"] }],
      [firstTransfigurationRequest.requestId, { kind: "transfiguration", type: "Azure" }],
      [secondCardRequest.requestId, { kind: "card", entryIds: ["deck-2"] }],
      [
        secondTransfigurationRequest.requestId,
        { kind: "transfiguration", type: "Bronze" },
      ],
    ]);

    vi.spyOn(loggingModule, "logEvent").mockImplementation(
      () => ({ event: "", seq: 0, timestamp: "" }) as never,
    );

    expect(applyBranch(branch, META, ctx, mut)).toEqual({
      done: false,
      needsChoice: firstCardRequest,
    });
    expect(applyBranch(branch, META, ctx, mut, firstCardResolution)).toEqual({
      done: false,
      needsChoice: firstTransfigurationRequest,
    });
    expect(applyBranch(branch, META, ctx, mut, firstCompleteResolution)).toEqual({
      done: false,
      needsChoice: secondCardRequest,
    });
    expect(applyBranch(branch, META, ctx, mut, secondCardResolution)).toEqual({
      done: false,
      needsChoice: secondTransfigurationRequest,
    });
    expect(calls).toEqual([]);

    expect(applyBranch(branch, META, ctx, mut, allResolutions)).toEqual({
      done: true,
    });
    expect(calls).toEqual([
      {
        method: "transfigureDeckEntry",
        args: [
          "deck-1",
          "Azure",
          "dream_journey:apply_chosen_transfiguration_to_chosen_card",
        ],
      },
      {
        method: "transfigureDeckEntry",
        args: [
          "deck-2",
          "Bronze",
          "dream_journey:apply_chosen_transfiguration_to_chosen_card",
        ],
      },
    ]);
  });
});
