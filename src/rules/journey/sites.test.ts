import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ShopSiteRuntime, SiteState, SiteType } from "../../types/journey";
import { registerSiteContentProvider } from "./sites";
import { SELECTION_RULES_VERSION } from "../../reward-selection";
import { parseDeckEntryId } from "../../types/identifiers";
import { parseSiteId } from "../../types/identifiers";
import { testExplorationActionId, testGuideId } from "../../types/test-identities";
import { reduce, makeEntry, SITE_ID, NODE_ID, makeSite, stateWithSites, siteState, fakeProvider, runtimeOf } from "./sites-fixtures";



afterEach(() => {
  registerSiteContentProvider(null);
});


describe("Random Site", () => {
  beforeEach(() => registerSiteContentProvider(fakeProvider));

  function homeRandomSite(): SiteState {
    return {
      ...makeSite("RandomSite", true),
      randomSite: {
        mode: "homeChoice",
        presentingGuideId: testGuideId("fixture-random-guide"),
        candidateSiteTypes: [
          "Shop",
          "Purge",
          "Augury",
          "Gamble",
          "Exploration",
        ],
      },
    };
  }

  it("persists three distinct deterministic home choices", () => {
    const first = reduce(stateWithSites([homeRandomSite()]), "OPEN_SITE", {
      siteId: SITE_ID,
      selectionRulesVersion: SELECTION_RULES_VERSION,
    });
    const replay = reduce(stateWithSites([homeRandomSite()]), "OPEN_SITE", {
      siteId: SITE_ID,
      selectionRulesVersion: SELECTION_RULES_VERSION,
    });
    expect(first.outcome).toBe("applied");
    expect(runtimeOf(first)).toEqual(runtimeOf(replay));
    const runtime = runtimeOf(first);
    expect(runtime?.kind).toBe("randomSite");
    if (runtime?.kind !== "randomSite")
      throw new Error("expected Random Site runtime");
    expect(runtime.offeredSiteTypes).toHaveLength(3);
    expect(new Set(runtime.offeredSiteTypes).size).toBe(3);
  });

  it("materializes a persisted single destination when entered", () => {
    const wrapper: SiteState = {
      ...makeSite("RandomSite", true),
      randomSite: {
        mode: "single",
        presentingGuideId: testGuideId("fixture-random-guide"),
        candidateSiteTypes: ["Exploration"],
        destinationSiteType: "Exploration",
      },
    };
    const base = stateWithSites([wrapper], {
      screen: { type: "dreamscape" },
    });
    const entered = reduce(base, "ENTER_SITE", { siteId: SITE_ID });
    expect(entered.outcome).toBe("applied");
    expect(entered.state.journey.atlas.nodes[NODE_ID].sites[0]).toMatchObject({
      id: SITE_ID,
      type: "Exploration",
      isEnhanced: true,
      randomSite: {
        presentingGuideId: testGuideId("fixture-random-guide"),
      },
    });
  });
});


// ---------------------------------------------------------------------------
// OPEN_SITE — generation determinism
// ---------------------------------------------------------------------------

describe("OPEN_SITE generation determinism", () => {
  const providerTypes: SiteType[] = [
    "Reward",
    "DreamsignRevelation",
    "Shop",
    "Transfiguration",
    "Duplication",
    "Gamble",
  ];

  for (const type of providerTypes) {
    it(`${type}: same seed+seq folds to a hash-identical runtime`, () => {
      registerSiteContentProvider(fakeProvider);
      const deck = [
        makeEntry({ entryId: parseDeckEntryId("deck-1"), cardNumber: 7 }),
      ];
      const a = reduce(siteState(type, { deck }), "OPEN_SITE", {
        siteId: SITE_ID,
        selectionRulesVersion: SELECTION_RULES_VERSION,
      });
      const b = reduce(siteState(type, { deck }), "OPEN_SITE", {
        siteId: SITE_ID,
        selectionRulesVersion: SELECTION_RULES_VERSION,
      });
      expect(a.outcome).toBe("applied");
      expect(b.outcome).toBe("applied");
      expect(runtimeOf(a)).toBeDefined();
      expect(JSON.stringify(runtimeOf(a))).toBe(JSON.stringify(runtimeOf(b)));
    });
  }

  it("applies a provider's T56 queue shift atomically with the Shop runtime", () => {
    const firstModifier = {
      kind: "free-next-shop" as const,
      sourceSiteId: parseSiteId("exploration-one"),
      sourceActionId: testExplorationActionId("action-one"),
    };
    const secondModifier = {
      kind: "free-next-shop" as const,
      sourceSiteId: parseSiteId("exploration-two"),
      sourceActionId: testExplorationActionId("action-two"),
    };
    registerSiteContentProvider({
      ...fakeProvider,
      openSite(input) {
        const generated = fakeProvider.openSite(input);
        if (generated === null || input.site.type !== "Shop") return generated;
        return {
          ...generated,
          runtime: {
            ...(generated.runtime as ShopSiteRuntime),
            freePurchaseSource: {
              sourceSiteId: firstModifier.sourceSiteId,
              sourceActionId: firstModifier.sourceActionId,
            },
          },
          shopModifiers: {
            ...input.journey.shopModifiers,
            freeNextShopModifiers: [secondModifier],
          },
        };
      },
    });
    const initial = siteState("Shop", {
      shopModifiers: {
        ...siteState("Shop").journey.shopModifiers,
        freeNextShopModifiers: [firstModifier, secondModifier],
      },
    });

    const opened = reduce(initial, "OPEN_SITE", {
      siteId: SITE_ID,
      selectionRulesVersion: SELECTION_RULES_VERSION,
    });
    const duplicate = reduce(opened.state, "OPEN_SITE", {
      siteId: SITE_ID,
      selectionRulesVersion: SELECTION_RULES_VERSION,
    });

    expect(opened.outcome).toBe("applied");
    expect(opened.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      kind: "shop",
      purchaseHistory: [],
      freePurchaseSource: {
        sourceSiteId: firstModifier.sourceSiteId,
        sourceActionId: firstModifier.sourceActionId,
      },
    });
    expect(opened.state.journey.shopModifiers.freeNextShopModifiers).toEqual([
      secondModifier,
    ]);
    expect(duplicate.outcome).toBe("bounced");
    expect(duplicate.state).toEqual(opened.state);
  });
});


// ---------------------------------------------------------------------------
// OPEN_SITE — idempotence
// ---------------------------------------------------------------------------

describe("OPEN_SITE idempotence", () => {
  beforeEach(() => registerSiteContentProvider(fakeProvider));

  it("bounces an OPEN_SITE that names no selection protocol", () => {
    const out = reduce(siteState("Essence"), "OPEN_SITE", { siteId: SITE_ID });
    expect(out.outcome).toBe("bounced");
    expect(runtimeOf(out)).toBeUndefined();
  });

  it("bounces a repeated OPEN_SITE without changing or regenerating runtime", () => {
    const first = reduce(siteState("Essence"), "OPEN_SITE", {
      siteId: SITE_ID,
      selectionRulesVersion: SELECTION_RULES_VERSION,
    });
    expect(first.outcome).toBe("applied");
    const second = reduce(first.state, "OPEN_SITE", {
      siteId: SITE_ID,
      selectionRulesVersion: SELECTION_RULES_VERSION,
    });
    expect(second.outcome).toBe("bounced");
    // Runtime is not regenerated/overwritten: state hash unchanged.
    expect(JSON.stringify(second.state.journey)).toBe(
      JSON.stringify(first.state.journey),
    );
    expect(second.state.journey.siteRuntime[SITE_ID]).toEqual(
      first.state.journey.siteRuntime[SITE_ID],
    );
  });
});
