import { describe, expect, it } from "vitest";

import { buildFixtureContext } from "./shapes/__shared__/fixture";
import {
  JourneyDebugHarnessError,
  generateNextJourneyWithDebugHarness,
  journeyManifestIncludesTemplateIds,
} from "./debugHarness";
import type { DrawContext } from "../util/rng";
import type { JourneyContext } from "./context";

function fixtureDrawContext(): DrawContext {
  return {
    seed: "fixture-seed",
    contentVersion: "test",
    rootJourneyIndex: 0,
  };
}

function richFixtureContext(): JourneyContext {
  const ctx = buildFixtureContext();
  return {
    ...ctx,
    state: {
      quest: {
        ...ctx.state.quest,
        resources: {
          ...ctx.state.quest.resources,
          essence: 500,
          maxEssence: 500,
          omens: 50,
        },
      },
    },
  };
}

describe("generateNextJourneyWithDebugHarness", () => {
  it("forces a specific shape id", () => {
    const result = generateNextJourneyWithDebugHarness({
      context: richFixtureContext(),
      drawContext: fixtureDrawContext(),
      debugForcing: { shapeId: "single_offer" },
    });

    expect(result.manifest.shapeId).toBe("single_offer");
  });

  it("searches deterministic attempts for a forced reward template id", () => {
    const result = generateNextJourneyWithDebugHarness({
      context: richFixtureContext(),
      drawContext: fixtureDrawContext(),
      debugForcing: { rewardTemplateId: "gain_essence", maxAttempts: 120 },
    });

    expect(journeyManifestIncludesTemplateIds(result.manifest, {
      rewardTemplateId: "gain_essence",
    })).toBe(true);
    expect(result.attempts.length).toBeGreaterThan(0);
  });

  it("searches deterministic attempts for a forced cost template id", () => {
    const result = generateNextJourneyWithDebugHarness({
      context: richFixtureContext(),
      drawContext: fixtureDrawContext(),
      debugForcing: { costTemplateId: "pay_essence", maxAttempts: 120 },
    });

    expect(journeyManifestIncludesTemplateIds(result.manifest, {
      costTemplateId: "pay_essence",
    })).toBe(true);
    expect(result.attempts.length).toBeGreaterThan(0);
  });

  it("throws a visible debug error for unknown ids", () => {
    expect(() =>
      generateNextJourneyWithDebugHarness({
        context: richFixtureContext(),
        drawContext: fixtureDrawContext(),
        debugForcing: { rewardTemplateId: "missing_reward" },
      }),
    ).toThrow(JourneyDebugHarnessError);

    expect(() =>
      generateNextJourneyWithDebugHarness({
        context: richFixtureContext(),
        drawContext: fixtureDrawContext(),
        debugForcing: { costTemplateId: "missing_cost" },
      }),
    ).toThrow(/missing_cost/);
  });
});
