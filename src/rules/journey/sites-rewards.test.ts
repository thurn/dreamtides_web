import { registerEnhancedRewardContracts } from "./enhanced-reward.contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Dreamsign, JourneyState } from "../../types/journey";
import { type FoldState } from "../fold-state";
import { isSiteVisited, registerSiteContentProvider } from "./sites";
import { SELECTION_RULES_VERSION } from "../../reward-selection";
import { testDreamsignId } from "../../types/test-identities";
import { reduce, dreamsign, SITE_ID, siteState, fakeProvider } from "./sites-fixtures";



afterEach(() => {
  registerSiteContentProvider(null);
});


// ---------------------------------------------------------------------------
// ACCEPT_ESSENCE
// ---------------------------------------------------------------------------

describe("ACCEPT_ESSENCE", () => {
  beforeEach(() => registerSiteContentProvider(fakeProvider));
  function opened(): FoldState {
    return reduce(siteState("Essence", { essence: 0 }), "OPEN_SITE", {
      siteId: SITE_ID,
      selectionRulesVersion: SELECTION_RULES_VERSION,
    }).state;
  }

  it("adds the runtime amount, marks accepted, and completes the site", () => {
    const state = opened();
    const amount = (state.journey.siteRuntime[SITE_ID] as { amount: number })
      .amount;
    const out = reduce(state, "ACCEPT_ESSENCE", { siteId: SITE_ID });
    expect(out.outcome).toBe("applied");
    expect(out.state.journey.essence).toBe(amount);
    expect(
      (out.state.journey.siteRuntime[SITE_ID] as { accepted: boolean })
        .accepted,
    ).toBe(true);
    expect(isSiteVisited(out.state.journey, SITE_ID)).toBe(true);
    expect(out.state.journey.screen.type).toBe("dreamscape");
  });

  it("generates and accepts the reward atomically when the site was not opened", () => {
    const state = siteState("Essence", { essence: 450 });
    const out = reduce(state, "ACCEPT_ESSENCE", { siteId: SITE_ID });
    expect(out.outcome).toBe("applied");
    const runtime = out.state.journey.siteRuntime[SITE_ID];
    expect(runtime?.kind).toBe("essence");
    if (runtime?.kind !== "essence")
      throw new Error("expected Essence runtime");
    expect(runtime.amount).toBeGreaterThanOrEqual(200);
    expect(runtime.amount).toBeLessThanOrEqual(300);
    expect(runtime.accepted).toBe(true);
    expect(out.state.journey.essence).toBe(
      state.journey.essence + runtime.amount,
    );
    expect(isSiteVisited(out.state.journey, SITE_ID)).toBe(true);
  });
});


// ---------------------------------------------------------------------------
// ACCEPT_REWARD / dreamsign offer / reject
// ---------------------------------------------------------------------------

describe("ACCEPT_REWARD (essence reward)", () => {
  function opened(essence = 0): FoldState {
    registerSiteContentProvider(fakeProvider);
    return reduce(siteState("Reward", { essence }), "OPEN_SITE", {
      siteId: SITE_ID,
      selectionRulesVersion: SELECTION_RULES_VERSION,
    }).state;
  }

  it("grants the essence reward and completes the site", () => {
    const state = opened();
    const amount = (
      state.journey.siteRuntime[SITE_ID] as {
        reward: { essenceAmount: number };
      }
    ).reward.essenceAmount;
    const out = reduce(state, "ACCEPT_REWARD", { siteId: SITE_ID });
    expect(out.outcome).toBe("applied");
    expect(out.state.journey.essence).toBe(amount);
    expect(isSiteVisited(out.state.journey, SITE_ID)).toBe(true);
  });
});


describe("ACCEPT_REWARD (Dreamsign reward at the cap)", () => {
  function openedAtCap(): FoldState {
    return siteState("Reward", {
      maxDreamsigns: 2,
      dreamsigns: [dreamsign("held-1"), dreamsign("held-2")],
      siteRuntime: {
        [SITE_ID]: {
          kind: "reward",
          reward: {
            rewardType: "dreamsign",
            dreamsign: dreamsign("reward-dreamsign"),
          },
          remainingDreamsignPoolIds: [],
          accepted: false,
        },
      },
    });
  }

  it("requires a purge slot, then replaces that held Dreamsign and completes the site", () => {
    const state = openedAtCap();

    const withoutReplacement = reduce(state, "ACCEPT_REWARD", {
      siteId: SITE_ID,
    });
    expect(withoutReplacement.outcome).toBe("bounced");
    expect(isSiteVisited(withoutReplacement.state.journey, SITE_ID)).toBe(false);

    const withReplacement = reduce(state, "ACCEPT_REWARD", {
      siteId: SITE_ID,
      purgeIndex: 1,
    });
    expect(withReplacement.outcome).toBe("applied");
    expect(
      withReplacement.state.journey.dreamsigns.map((sign) => sign.id),
    ).toEqual([
      state.journey.dreamsigns[0]?.id,
      testDreamsignId("reward-dreamsign"),
    ]);
    expect(isSiteVisited(withReplacement.state.journey, SITE_ID)).toBe(true);
  });
});


describe("dreamsign offer accept / reject", () => {
  function opened(overrides: Partial<JourneyState> = {}): FoldState {
    registerSiteContentProvider(fakeProvider);
    return reduce(siteState("DreamsignRevelation", overrides), "OPEN_SITE", {
      siteId: SITE_ID,
      selectionRulesVersion: SELECTION_RULES_VERSION,
    }).state;
  }

  it("accepts an offered dreamsign by id and appends it", () => {
    const state = opened();
    const offered = (
      state.journey.siteRuntime[SITE_ID] as {
        offeredDreamsigns: Dreamsign[];
      }
    ).offeredDreamsigns[0];
    const out = reduce(state, "ACCEPT_DREAMSIGN_OFFER", {
      siteId: SITE_ID,
      dreamsignId: offered.id,
    });
    expect(out.outcome).toBe("applied");
    expect(out.state.journey.dreamsigns.map((d) => d.id)).toContain(offered.id);
    expect(isSiteVisited(out.state.journey, SITE_ID)).toBe(true);
  });

  it("rejects the offer and completes the site", () => {
    const out = reduce(opened(), "REJECT_DREAMSIGN_OFFER", {
      siteId: SITE_ID,
    });
    expect(out.outcome).toBe("applied");
    expect(isSiteVisited(out.state.journey, SITE_ID)).toBe(true);
    expect(
      (out.state.journey.siteRuntime[SITE_ID] as { accepted: boolean })
        .accepted,
    ).toBe(true);
  });
});

registerEnhancedRewardContracts();
