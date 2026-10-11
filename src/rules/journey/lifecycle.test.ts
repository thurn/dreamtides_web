import { testJourneyMutationSource } from "../../types/test-identities";
import { afterEach, describe, expect, it } from "vitest";
import type { DreamscapeModifier } from "../../types/journey";
import { LayerName } from "../../types/layer-name";
import { type FoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import { registerJourneyLifecycleContentProvider } from "./lifecycle";
import { parseAtlasNodeId } from "../../types/identifiers";
import { parseSiteId } from "../../types/identifiers";
import { ctx, event, apply, genesis, withAtlasSite } from "./lifecycle-fixtures";



afterEach(() => {
  registerJourneyLifecycleContentProvider(null);
});


// ---------------------------------------------------------------------------
// Essence floor
// ---------------------------------------------------------------------------

describe("essence floor", () => {
  it("ADJUST_ESSENCE allows arbitrary gains and floors losses at zero", () => {
    const start = genesis();
    const up = apply(start, "ADJUST_ESSENCE", { delta: 10_000 });
    expect(up.journey.essence).toBe(start.journey.essence + 10_000);
    const down = apply(up, "ADJUST_ESSENCE", { delta: -10_000 });
    expect(down.journey.essence).toBe(start.journey.essence);
  });

  it("SET_ESSENCE allows arbitrary non-negative values and floors at zero", () => {
    const start = genesis();
    expect(apply(start, "SET_ESSENCE", { value: 10_000 }).journey.essence).toBe(
      10_000,
    );
    expect(apply(start, "SET_ESSENCE", { value: -5 }).journey.essence).toBe(0);
  });
});


// ---------------------------------------------------------------------------
// Limits & completion
// ---------------------------------------------------------------------------

describe("limits and completion", () => {
  it("SET_MAX_DREAMSIGNS sets the value", () => {
    expect(
      apply(genesis(), "SET_MAX_DREAMSIGNS", { value: 7 }).journey
        .maxDreamsigns,
    ).toBe(7);
  });

  it("SET_MAX_DREAMSIGNS clamps a negative value to 0", () => {
    expect(
      apply(genesis(), "SET_MAX_DREAMSIGNS", { value: -5 }).journey
        .maxDreamsigns,
    ).toBe(0);
  });
});


// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

describe("navigation", () => {
  it("ENTER_SITE validates and enters a site in the current dreamscape", () => {
    const base = genesis();
    const state = {
      ...base,
      journey: {
        ...withAtlasSite(
          base.journey,
          parseAtlasNodeId("node-1"),
          parseSiteId("site-1"),
        ),
        currentDreamscape: parseAtlasNodeId("node-1"),
        screen: { type: "dreamscape" as const },
      },
    };
    const siteScreen = apply(state, "ENTER_SITE", {
      siteId: parseSiteId("site-1"),
    });
    expect(siteScreen.journey.screen).toEqual({
      type: "site",
      siteId: parseSiteId("site-1"),
    });

    expect(
      reduceGameEvent(
        state,
        event("ENTER_SITE", { siteId: parseSiteId("unknown") }),
        ctx(),
      ).outcome,
    ).toBe("bounced");
  });

  it("DISMISS_STARTING_DECK_POPUP flips the flag", () => {
    const state = apply(genesis(), "DISMISS_STARTING_DECK_POPUP", {});
    expect(state.journey.hasSeenStartingDeckPopup).toBe(true);
  });
});


// ---------------------------------------------------------------------------
// TRAVEL_TO_DREAMSCAPE — modifier decrement
// ---------------------------------------------------------------------------

describe("TRAVEL_TO_DREAMSCAPE", () => {
  function modifier(remaining: number, source: string): DreamscapeModifier {
    return {
      kind: "remove_shop_sites",
      dreamscapesRemaining: remaining,
      source: testJourneyMutationSource(source),
    };
  }

  it("decrements dreamscapeModifiers and drops zeroed entries when advancing", () => {
    const base = genesis();
    const state: FoldState = {
      ...base,
      journey: {
        ...base.journey,
        atlas: {
          ...base.journey.atlas,
          currentNodeId: parseAtlasNodeId("node-a"),
          nodes: {
            [parseAtlasNodeId("node-a")]: {
              ...withAtlasSite(
                base.journey,
                parseAtlasNodeId("node-a"),
                parseSiteId("site-a"),
              ).atlas.nodes[parseAtlasNodeId("node-a")],
              forwardIds: [parseAtlasNodeId("node-b")],
            },
            [parseAtlasNodeId("node-b")]: {
              ...withAtlasSite(
                base.journey,
                parseAtlasNodeId("node-b"),
                parseSiteId("site-b"),
              ).atlas.nodes[parseAtlasNodeId("node-b")],
              layer: LayerName.Two,
              backwardIds: [parseAtlasNodeId("node-a")],
            },
          },
        },
        currentDreamscape: parseAtlasNodeId("node-a"),
        screen: { type: "atlas" },
        dreamscapeModifiers: [modifier(1, "one"), modifier(2, "two")],
      },
    };
    const next = apply(state, "TRAVEL_TO_DREAMSCAPE", {
      nodeId: parseAtlasNodeId("node-b"),
    });
    expect(next.journey.currentDreamscape).toBe("node-b");
    expect(next.journey.dreamscapeModifiers).toEqual([modifier(1, "two")]);
    expect(next.journey.screen).toEqual({ type: "dreamscape" });
  });
});
