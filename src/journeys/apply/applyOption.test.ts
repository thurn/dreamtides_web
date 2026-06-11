// applyOption dispatch loop tests.
//
// These tests pin the *frame* around per-template apply work:
//   1. Cost-before-effect ordering.
//   2. Locked re-check aborts the apply before any mutation runs.
//   3. Missing-template warn + continue.
//   4. Malformed envelope warn + continue.
//   5. Chooser requests are planned before mutations are committed.
//   6. The `source` string convention threaded into mutation calls.
//   7. `dream_journey_applied` log payload (one event per successful apply;
//      a locked-skip apply emits `dream_journey_locked_at_apply` instead).
//
// Per-template apply behaviour is covered exhaustively in
// `shared/costs.apply.test.ts` and `shared/rewards.apply.test.ts` (Tasks 9-18).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildFixtureContext } from "../journey/shapes/__shared__/fixture";
import type { Cost, Reward } from "../journey/shared/types";
import { makeUnlockedOption } from "../journey/manifest";
import type { JourneyOption } from "../journey/manifest";
import { requestIdFor } from "./chooserPlan";
import type { ChooserRequest, ChooserResolution } from "./chooserPlan";
import { createRecordingMutations } from "./testing/recordingMutations";

// Per-test stub registries. `vi.mock` factory wires `findCost` / `findReward`
// to read from these maps so each test can inject a deterministic catalog
// without mutating frozen production arrays.
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

// Imported after `vi.mock` so the dispatch loop sees the stubbed lookups.
const { applyOption } = await import("./applyOption");
const loggingModule = await import("../../logging");

const META = {
  siteId: "site-7",
  journeyId: "journey-abc",
  shapeId: "random_trades" as const,
};

function makeCostEnvelope(templateId: string, params: Record<string, unknown> = {}): unknown {
  return {
    kind: "shared_cost_template",
    templateId,
    params,
    text: `cost:${templateId}`,
    convertedEssence: 0,
  };
}

function makeRewardEnvelope(templateId: string, params: Record<string, unknown> = {}): unknown {
  return {
    kind: "shared_reward_template",
    templateId,
    params,
    text: `reward:${templateId}`,
    convertedEssence: 0,
  };
}

function makeOption(opts: {
  number?: number;
  costs?: unknown[];
  effects?: unknown[];
}): JourneyOption {
  return makeUnlockedOption({
    number: opts.number ?? 1,
    symbols: [],
    text: "test option",
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
    pickBehavior: "record_and_generate_next",
  });
}

// Minimal cost stub that calls a recorded mutation method when applied.
function stubPayEssence(): Cost<{ x: number }> {
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

function stubGainEssence(): Reward<{ x: number }> {
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

function makeCardRequest(requestId: string, title = "Choose cards"): ChooserRequest {
  return {
    kind: "card",
    requestId,
    poolKind: "deck",
    deckFilter: { predicateId: "event" },
    minPicks: 1,
    maxPicks: 2,
    title,
  };
}

function stubTransfigureChosenCards(
  id: string,
  request: ChooserRequest,
  type: "Enduring" | "Amplified",
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
        mut.transfigureDeckEntry(entryId, type, `dream_journey:${id}`);
      }
    },
  };
}

function stubChooseCardThenTransfiguration(id: string): Reward<Record<string, unknown>> {
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
        return makeCardRequest(cardRequestId, "Choose card");
      }
      const transfigurationRequestId = planning.requestIdForSlot(1);
      if (!planning.resolutions.has(transfigurationRequestId)) {
        return {
          kind: "transfiguration",
          requestId: transfigurationRequestId,
          eligibleTransfigurations: ["Inspired", "Enduring"],
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

function stubChooseCardCost(id: string): Cost<Record<string, unknown>> {
  return {
    id,
    weight: 1,
    rollParams: () => ({}),
    cec: () => 0,
    viable: () => true,
    locked: () => false,
    render: () => "Choose cost card",
    choosePlan: (_params, _ctx, planning) => {
      const requestId = planning.requestIdForSlot();
      if (planning.resolutions.has(requestId)) {
        return undefined;
      }
      return makeCardRequest(requestId, "Choose cost card");
    },
    apply: (_params, _ctx, mut, resolution) => {
      if (resolution?.kind !== "card") {
        return;
      }
      for (const entryId of resolution.entryIds) {
        mut.removeDeckEntry(entryId, `dream_journey:${id}`);
      }
    },
  };
}

function stubChooseCardReward(id: string): Reward<Record<string, unknown>> {
  return {
    id,
    weight: 1,
    rollParams: () => ({}),
    cec: () => 0,
    viable: () => true,
    render: () => "Choose reward card",
    choosePlan: (_params, _ctx, planning) => {
      const requestId = planning.requestIdForSlot();
      if (planning.resolutions.has(requestId)) {
        return undefined;
      }
      return makeCardRequest(requestId, "Choose reward card");
    },
    apply: (_params, _ctx, mut, resolution) => {
      if (resolution?.kind !== "card") {
        return;
      }
      for (const entryId of resolution.entryIds) {
        mut.duplicateDeckEntry(entryId, `dream_journey:${id}`);
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

describe("applyOption", () => {
  it("calls cost mutations before reward mutations (ordering)", () => {
    stubCosts.set("pay_essence", stubPayEssence());
    stubRewards.set("gain_essence", stubGainEssence());

    const ctx = buildFixtureContext();
    const { mut, calls } = createRecordingMutations();

    const option = makeOption({
      costs: [makeCostEnvelope("pay_essence", { x: 50 })],
      effects: [makeRewardEnvelope("gain_essence", { x: 30 })],
    });

    vi.spyOn(loggingModule, "logEvent").mockImplementation(
      () => ({ event: "", seq: 0, timestamp: "" }) as never,
    );

    const result = applyOption(option, META, ctx, mut);

    expect(result).toEqual({ done: true });
    expect(calls).toEqual([
      { method: "changeEssence", args: [-50, "dream_journey:pay_essence"] },
      { method: "changeEssence", args: [30, "dream_journey:gain_essence"] },
    ]);
  });

  it("uses the dream_journey:<templateId> source-string convention", () => {
    stubCosts.set("pay_essence", stubPayEssence());

    const ctx = buildFixtureContext();
    const { mut, calls } = createRecordingMutations();
    const option = makeOption({
      costs: [makeCostEnvelope("pay_essence", { x: 50 })],
    });

    vi.spyOn(loggingModule, "logEvent").mockImplementation(
      () => ({ event: "", seq: 0, timestamp: "" }) as never,
    );

    applyOption(option, META, ctx, mut);

    expect(calls).toHaveLength(1);
    const sourceArg = calls[0].args[1];
    expect(typeof sourceArg).toBe("string");
    expect(sourceArg).toContain("dream_journey:pay_essence");
  });

  it("aborts when a cost reports locked at apply time", () => {
    stubCosts.set("pay_essence", stubPayEssence());
    stubRewards.set("gain_essence", stubGainEssence());

    // Cripple the player's essence so pay_essence(50) locks.
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
    const option = makeOption({
      number: 2,
      costs: [makeCostEnvelope("pay_essence", { x: 50 })],
      effects: [makeRewardEnvelope("gain_essence", { x: 30 })],
    });

    const logSpy = vi
      .spyOn(loggingModule, "logEvent")
      .mockImplementation(() => ({ event: "", seq: 0, timestamp: "" }) as never);

    const result = applyOption(option, META, ctx, mut);

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
    // Locked-at-apply log carries enough context to debug the drift.
    expect(lockedEvents[0][1]).toMatchObject({
      siteId: META.siteId,
      journeyId: META.journeyId,
      shapeId: META.shapeId,
      optionNumber: 2,
    });
  });

  it("warns and continues when a costs[] entry references an unknown templateId", () => {
    stubRewards.set("gain_essence", stubGainEssence());

    const ctx = buildFixtureContext();
    const { mut, calls } = createRecordingMutations();
    const option = makeOption({
      costs: [
        makeCostEnvelope("does_not_exist_in_catalog", { x: 1 }),
      ],
      effects: [makeRewardEnvelope("gain_essence", { x: 30 })],
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(loggingModule, "logEvent").mockImplementation(
      () => ({ event: "", seq: 0, timestamp: "" }) as never,
    );

    const result = applyOption(option, META, ctx, mut);

    expect(result).toEqual({ done: true });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    // Remaining well-formed reward still applied.
    expect(calls).toEqual([
      { method: "changeEssence", args: [30, "dream_journey:gain_essence"] },
    ]);
  });

  it("warns and continues when a costs[] entry fails narrowing", () => {
    stubCosts.set("pay_essence", stubPayEssence());

    const ctx = buildFixtureContext();
    const { mut, calls } = createRecordingMutations();
    const option = makeOption({
      // Envelope missing required `templateId` → narrow returns null.
      costs: [
        { kind: "shared_cost_template", params: {}, text: "x", convertedEssence: 0 },
        makeCostEnvelope("pay_essence", { x: 50 }),
      ],
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(loggingModule, "logEvent").mockImplementation(
      () => ({ event: "", seq: 0, timestamp: "" }) as never,
    );

    applyOption(option, META, ctx, mut);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    // The well-formed cost after the malformed one still applies.
    expect(calls).toEqual([
      { method: "changeEssence", args: [-50, "dream_journey:pay_essence"] },
    ]);
  });

  it("returns { done: true } on Wave 1 inputs (no chooser)", () => {
    const ctx = buildFixtureContext();
    const { mut } = createRecordingMutations();
    vi.spyOn(loggingModule, "logEvent").mockImplementation(
      () => ({ event: "", seq: 0, timestamp: "" }) as never,
    );
    const option = makeOption({});

    const result = applyOption(option, META, ctx, mut);

    expect(result).toEqual({ done: true });
  });

  it("returns the first chooser request without mutating when a chosen-target template needs resolution", () => {
    const templateId = "apply_named_transfiguration_to_chosen_predicate_cards";
    const request = makeCardRequest(requestIdFor(1, templateId));
    stubRewards.set(templateId, stubTransfigureChosenCards(templateId, request, "Enduring"));

    const ctx = buildFixtureContext();
    const { mut, calls } = createRecordingMutations();
    const option = makeOption({
      effects: [makeRewardEnvelope(templateId)],
    });

    vi.spyOn(loggingModule, "logEvent").mockImplementation(
      () => ({ event: "", seq: 0, timestamp: "" }) as never,
    );

    const result = applyOption(option, META, ctx, mut);

    expect(result).toEqual({ done: false, needsChoice: request });
    expect(calls).toEqual([]);
  });

  it("commits a chosen-target template when called with its resolution", () => {
    const templateId = "apply_named_transfiguration_to_chosen_predicate_cards";
    const request = makeCardRequest(requestIdFor(1, templateId));
    stubRewards.set(templateId, stubTransfigureChosenCards(templateId, request, "Enduring"));

    const ctx = buildFixtureContext();
    const { mut, calls } = createRecordingMutations();
    const option = makeOption({
      effects: [makeRewardEnvelope(templateId)],
    });
    const resolutions = new Map<string, ChooserResolution>([
      [request.requestId, { kind: "card", entryIds: ["deck-1", "deck-2"] }],
    ]);

    vi.spyOn(loggingModule, "logEvent").mockImplementation(
      () => ({ event: "", seq: 0, timestamp: "" }) as never,
    );

    const result = applyOption(option, META, ctx, mut, resolutions);

    expect(result).toEqual({ done: true });
    expect(calls).toEqual([
      {
        method: "transfigureDeckEntry",
        args: [
          "deck-1",
          "Enduring",
          "dream_journey:apply_named_transfiguration_to_chosen_predicate_cards",
        ],
      },
      {
        method: "transfigureDeckEntry",
        args: [
          "deck-2",
          "Enduring",
          "dream_journey:apply_named_transfiguration_to_chosen_predicate_cards",
        ],
      },
    ]);
  });

  it("walks multiple chosen-target templates one chooser at a time, then commits all mutations in order", () => {
    const firstTemplateId = "choose_first_cards";
    const secondTemplateId = "choose_second_cards";
    const firstRequest = makeCardRequest(
      requestIdFor(4, firstTemplateId),
      "Choose first cards",
    );
    const secondRequest = makeCardRequest(
      requestIdFor(4, secondTemplateId),
      "Choose second cards",
    );
    stubRewards.set(
      firstTemplateId,
      stubTransfigureChosenCards(firstTemplateId, firstRequest, "Enduring"),
    );
    stubRewards.set(
      secondTemplateId,
      stubTransfigureChosenCards(secondTemplateId, secondRequest, "Amplified"),
    );

    const ctx = buildFixtureContext();
    const { mut, calls } = createRecordingMutations();
    const option = makeOption({
      number: 4,
      effects: [
        makeRewardEnvelope(firstTemplateId),
        makeRewardEnvelope(secondTemplateId),
      ],
    });
    const firstResolution = new Map<string, ChooserResolution>([
      [firstRequest.requestId, { kind: "card", entryIds: ["first-entry"] }],
    ]);
    const bothResolutions = new Map<string, ChooserResolution>([
      [firstRequest.requestId, { kind: "card", entryIds: ["first-entry"] }],
      [secondRequest.requestId, { kind: "card", entryIds: ["second-entry"] }],
    ]);

    vi.spyOn(loggingModule, "logEvent").mockImplementation(
      () => ({ event: "", seq: 0, timestamp: "" }) as never,
    );

    expect(applyOption(option, META, ctx, mut)).toEqual({
      done: false,
      needsChoice: firstRequest,
    });
    expect(calls).toEqual([]);

    expect(applyOption(option, META, ctx, mut, firstResolution)).toEqual({
      done: false,
      needsChoice: secondRequest,
    });
    expect(calls).toEqual([]);

    expect(applyOption(option, META, ctx, mut, bothResolutions)).toEqual({
      done: true,
    });
    expect(calls).toEqual([
      {
        method: "transfigureDeckEntry",
        args: ["first-entry", "Enduring", "dream_journey:choose_first_cards"],
      },
      {
        method: "transfigureDeckEntry",
        args: ["second-entry", "Amplified", "dream_journey:choose_second_cards"],
      },
    ]);
  });

  it("lets one template ask for a second slot after the first slot is resolved", () => {
    const templateId = "apply_chosen_transfiguration_to_chosen_card";
    const firstRequest = makeCardRequest(
      requestIdFor(5, templateId, 0),
      "Choose card",
    );
    const secondRequest: ChooserRequest = {
      kind: "transfiguration",
      requestId: requestIdFor(5, templateId, 1),
      eligibleTransfigurations: ["Inspired", "Enduring"],
      title: "Choose transfiguration",
    };
    stubRewards.set(templateId, stubChooseCardThenTransfiguration(templateId));

    const ctx = buildFixtureContext();
    const { mut, calls } = createRecordingMutations();
    const option = makeOption({
      number: 5,
      effects: [makeRewardEnvelope(templateId)],
    });
    const firstResolution = new Map<string, ChooserResolution>([
      [firstRequest.requestId, { kind: "card", entryIds: ["deck-1"] }],
    ]);
    const bothResolutions = new Map<string, ChooserResolution>([
      [firstRequest.requestId, { kind: "card", entryIds: ["deck-1"] }],
      [secondRequest.requestId, { kind: "transfiguration", type: "Inspired" }],
    ]);

    vi.spyOn(loggingModule, "logEvent").mockImplementation(
      () => ({ event: "", seq: 0, timestamp: "" }) as never,
    );

    expect(applyOption(option, META, ctx, mut)).toEqual({
      done: false,
      needsChoice: firstRequest,
    });
    expect(calls).toEqual([]);

    expect(applyOption(option, META, ctx, mut, firstResolution)).toEqual({
      done: false,
      needsChoice: secondRequest,
    });
    expect(calls).toEqual([]);

    expect(applyOption(option, META, ctx, mut, bothResolutions)).toEqual({
      done: true,
    });
    expect(calls).toEqual([
      {
        method: "transfigureDeckEntry",
        args: [
          "deck-1",
          "Inspired",
          "dream_journey:apply_chosen_transfiguration_to_chosen_card",
        ],
      },
    ]);
  });

  it("keeps repeated two-slot template occurrences from sharing request ids", () => {
    const templateId = "apply_chosen_transfiguration_to_chosen_card";
    const firstCardRequest = makeCardRequest(
      requestIdFor(7, templateId, 0),
      "Choose card",
    );
    const firstTransfigurationRequest: ChooserRequest = {
      kind: "transfiguration",
      requestId: requestIdFor(7, templateId, 1),
      eligibleTransfigurations: ["Inspired", "Enduring"],
      title: "Choose transfiguration",
    };
    const secondCardRequest = makeCardRequest(
      requestIdFor("7:entry:1", templateId, 0),
      "Choose card",
    );
    const secondTransfigurationRequest: ChooserRequest = {
      kind: "transfiguration",
      requestId: requestIdFor("7:entry:1", templateId, 1),
      eligibleTransfigurations: ["Inspired", "Enduring"],
      title: "Choose transfiguration",
    };
    stubRewards.set(templateId, stubChooseCardThenTransfiguration(templateId));

    const ctx = buildFixtureContext();
    const { mut, calls } = createRecordingMutations();
    const option = makeOption({
      number: 7,
      effects: [
        makeRewardEnvelope(templateId),
        makeRewardEnvelope(templateId),
      ],
    });
    const firstCardResolution = new Map<string, ChooserResolution>([
      [firstCardRequest.requestId, { kind: "card", entryIds: ["deck-1"] }],
    ]);
    const firstCompleteResolution = new Map<string, ChooserResolution>([
      [firstCardRequest.requestId, { kind: "card", entryIds: ["deck-1"] }],
      [firstTransfigurationRequest.requestId, { kind: "transfiguration", type: "Inspired" }],
    ]);
    const secondCardResolution = new Map<string, ChooserResolution>([
      [firstCardRequest.requestId, { kind: "card", entryIds: ["deck-1"] }],
      [firstTransfigurationRequest.requestId, { kind: "transfiguration", type: "Inspired" }],
      [secondCardRequest.requestId, { kind: "card", entryIds: ["deck-2"] }],
    ]);
    const allResolutions = new Map<string, ChooserResolution>([
      [firstCardRequest.requestId, { kind: "card", entryIds: ["deck-1"] }],
      [firstTransfigurationRequest.requestId, { kind: "transfiguration", type: "Inspired" }],
      [secondCardRequest.requestId, { kind: "card", entryIds: ["deck-2"] }],
      [
        secondTransfigurationRequest.requestId,
        { kind: "transfiguration", type: "Enduring" },
      ],
    ]);

    vi.spyOn(loggingModule, "logEvent").mockImplementation(
      () => ({ event: "", seq: 0, timestamp: "" }) as never,
    );

    expect(applyOption(option, META, ctx, mut)).toEqual({
      done: false,
      needsChoice: firstCardRequest,
    });
    expect(applyOption(option, META, ctx, mut, firstCardResolution)).toEqual({
      done: false,
      needsChoice: firstTransfigurationRequest,
    });
    expect(applyOption(option, META, ctx, mut, firstCompleteResolution)).toEqual({
      done: false,
      needsChoice: secondCardRequest,
    });
    expect(applyOption(option, META, ctx, mut, secondCardResolution)).toEqual({
      done: false,
      needsChoice: secondTransfigurationRequest,
    });
    expect(calls).toEqual([]);

    expect(applyOption(option, META, ctx, mut, allResolutions)).toEqual({
      done: true,
    });
    expect(calls).toEqual([
      {
        method: "transfigureDeckEntry",
        args: [
          "deck-1",
          "Inspired",
          "dream_journey:apply_chosen_transfiguration_to_chosen_card",
        ],
      },
      {
        method: "transfigureDeckEntry",
        args: [
          "deck-2",
          "Enduring",
          "dream_journey:apply_chosen_transfiguration_to_chosen_card",
        ],
      },
    ]);
  });

  it("returns a cost chooser before a reward chooser and waits to mutate until both are resolved", () => {
    const costTemplateId = "choose_cost_card";
    const rewardTemplateId = "choose_reward_card";
    const costRequest = makeCardRequest(
      requestIdFor(6, costTemplateId),
      "Choose cost card",
    );
    const rewardRequest = makeCardRequest(
      requestIdFor(6, rewardTemplateId),
      "Choose reward card",
    );
    stubCosts.set(costTemplateId, stubChooseCardCost(costTemplateId));
    stubRewards.set(rewardTemplateId, stubChooseCardReward(rewardTemplateId));

    const ctx = buildFixtureContext();
    const { mut, calls } = createRecordingMutations();
    const option = makeOption({
      number: 6,
      costs: [makeCostEnvelope(costTemplateId)],
      effects: [makeRewardEnvelope(rewardTemplateId)],
    });
    const costResolution = new Map<string, ChooserResolution>([
      [costRequest.requestId, { kind: "card", entryIds: ["cost-entry"] }],
    ]);
    const bothResolutions = new Map<string, ChooserResolution>([
      [costRequest.requestId, { kind: "card", entryIds: ["cost-entry"] }],
      [rewardRequest.requestId, { kind: "card", entryIds: ["reward-entry"] }],
    ]);

    vi.spyOn(loggingModule, "logEvent").mockImplementation(
      () => ({ event: "", seq: 0, timestamp: "" }) as never,
    );

    expect(applyOption(option, META, ctx, mut)).toEqual({
      done: false,
      needsChoice: costRequest,
    });
    expect(calls).toEqual([]);

    expect(applyOption(option, META, ctx, mut, costResolution)).toEqual({
      done: false,
      needsChoice: rewardRequest,
    });
    expect(calls).toEqual([]);

    expect(applyOption(option, META, ctx, mut, bothResolutions)).toEqual({
      done: true,
    });
    expect(calls).toEqual([
      {
        method: "removeDeckEntry",
        args: ["cost-entry", "dream_journey:choose_cost_card"],
      },
      {
        method: "duplicateDeckEntry",
        args: ["reward-entry", "dream_journey:choose_reward_card"],
      },
    ]);
  });

  it("emits exactly one dream_journey_applied event listing cost+reward templateIds in encountered order", () => {
    stubCosts.set("pay_essence", stubPayEssence());
    stubRewards.set("gain_essence", stubGainEssence());

    const ctx = buildFixtureContext();
    const { mut } = createRecordingMutations();
    const option = makeOption({
      number: 3,
      costs: [makeCostEnvelope("pay_essence", { x: 50 })],
      effects: [makeRewardEnvelope("gain_essence", { x: 30 })],
    });

    const logSpy = vi
      .spyOn(loggingModule, "logEvent")
      .mockImplementation(() => ({ event: "", seq: 0, timestamp: "" }) as never);

    applyOption(option, META, ctx, mut);

    const appliedCalls = logSpy.mock.calls.filter(
      ([event]) => event === "dream_journey_applied",
    );
    expect(appliedCalls).toHaveLength(1);
    expect(appliedCalls[0][1]).toEqual({
      siteId: META.siteId,
      journeyId: META.journeyId,
      shapeId: META.shapeId,
      optionNumber: 3,
      templateIds: ["pay_essence", "gain_essence"],
    });
  });
});
