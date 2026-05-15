// Generation pipeline tests.
//
// Two checks, both pinning bug classes the port is most likely to regress on:
//
//   1. Byte-stable generation: running `generateNextJourney` twice against
//      the same fixture context + draw context must yield manifests that
//      stringify (via `stableStringify`) to the exact same bytes. Catches
//      any random state that leaks across calls.
//
//   2. Forced-shape sweep: every registered shape plugin must succeed when
//      `forcedShapeId` pins it to itself, and the returned manifest's
//      `shapeId` must match. Catches port regressions where a shape's fill,
//      assembly, or validation diverges from the registry catalog.

import { describe, expect, it } from "vitest";

import { buildFixtureContext } from "./shapes/__shared__/fixture";
import { journeyShapePlugins } from "./shapes/registry";
import { generateNextJourney } from "./generate";
import { stableStringify } from "../util/stableJson";
import type { DrawContext } from "../util/rng";
import type { JourneyContext } from "./context";

function fixtureDrawContext(): DrawContext {
  return {
    seed: "fixture-seed",
    contentVersion: "test",
    rootJourneyIndex: 0,
  };
}

// Lifts the fixture's essence/omens high enough that every forced shape has
// the resources to pay its escalated-tier costs. flat_escalating_trade in
// particular ramps prices up to 120 essence and the default fixture only
// holds 80; without this lift the `unpayable_immediate_cost` validator
// rejects the manifest before the test can assert `shapeId` round-trips.
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

describe("generateNextJourney", () => {
  it("is byte-stable across repeated calls with the same inputs", () => {
    const context = richFixtureContext();
    const drawContext = fixtureDrawContext();

    const first = generateNextJourney({ context, drawContext });
    const second = generateNextJourney({ context, drawContext });

    expect(stableStringify(first)).toBe(stableStringify(second));
  });

  it("succeeds when every shape is forced individually", () => {
    const context = richFixtureContext();
    const drawContext = fixtureDrawContext();
    const plugins = journeyShapePlugins();

    expect(plugins.length).toBe(21);

    for (const plugin of plugins) {
      const manifest = generateNextJourney({
        context,
        drawContext,
        forcedShapeId: plugin.id,
      });

      expect(manifest.shapeId).toBe(plugin.id);
    }
  });
});
