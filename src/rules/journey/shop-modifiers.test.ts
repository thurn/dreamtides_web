import { afterEach, describe, expect, it } from "vitest";
import { MINIMAL_SITES_DATA } from "../../testing/atlas-fixtures";
import { NIGHTMARE_CARD_ID } from "../../data/nightmare";
import type { BattleModifier } from "../../types/journey";
import { completeJourneySite, isSiteVisited, registerSiteContentProvider } from "./sites";
import { testSiteContentProvider } from "./test-content-providers";
import { registerDeckContentProvider } from "./deck";
import { testGuideId } from "../../types/test-identities";
import { SITE_ID, NODE_ID, reduce, makeSite, cardSlot, shopModifiers, stateWith, shopState } from "./shop-fixtures";



afterEach(() => {
  registerSiteContentProvider(null);
  registerDeckContentProvider(null);
});


// ---------------------------------------------------------------------------
// GRANT_FREE_REROLLS / APPLY_SHOP_DISCOUNT
// ---------------------------------------------------------------------------

describe("shop modifier grants", () => {
  it("GRANT_FREE_REROLLS adds to the free-reroll pool", () => {
    const state = shopState([cardSlot()], {
      shopModifiers: shopModifiers({ freeRerolls: 1 }),
    });
    const result = reduce(state, "GRANT_FREE_REROLLS", { count: 2 });
    expect(result.outcome).toBe("applied");
    expect(result.state.journey.shopModifiers.freeRerolls).toBe(3);
  });

  it("APPLY_SHOP_DISCOUNT adds to the essence discount", () => {
    const state = shopState([cardSlot()], {
      shopModifiers: shopModifiers({ essenceDiscountPercent: 10 }),
    });
    const result = reduce(state, "APPLY_SHOP_DISCOUNT", { percent: 15 });
    expect(result.outcome).toBe("applied");
    expect(result.state.journey.shopModifiers.essenceDiscountPercent).toBe(25);
  });
});


// ---------------------------------------------------------------------------
// Battle modifiers
// ---------------------------------------------------------------------------

describe("battle modifiers", () => {
  it("PUSH_BATTLE_MODIFIER appends a reward-reduction modifier", () => {
    const modifier: BattleModifier = {
      kind: "reward_reduction_percent",
      percent: 25,
      battlesRemaining: 2,
      source: "augury",
    };
    const state = shopState([cardSlot()]);
    const result = reduce(state, "PUSH_BATTLE_MODIFIER", { modifier });
    expect(result.outcome).toBe("applied");
    expect(result.state.journey.battleModifiers).toEqual([modifier]);
  });

  it("PUSH_TEMPORARY_NIGHTMARE_GRANT adds Nightmare entries and a modifier", () => {
    registerDeckContentProvider({
      resolveCardNumber: (cardId) =>
        cardId === NIGHTMARE_CARD_ID ? 10002 : null,
      resolveDreamsign: () => null,
    });
    const state = shopState([cardSlot()]);
    const result = reduce(state, "PUSH_TEMPORARY_NIGHTMARE_GRANT", {
      cardId: NIGHTMARE_CARD_ID,
      count: 2,
      battlesRemaining: 1,
      source: "augury",
    });
    expect(result.outcome).toBe("applied");
    expect(result.state.journey.deck).toHaveLength(2);
    expect(result.state.journey.deck.every((e) => e.isBane)).toBe(true);
    expect(result.state.journey.deck.every((e) => e.cardNumber === 10002)).toBe(
      true,
    );
    const modifiers = result.state.journey.battleModifiers;
    expect(modifiers).toHaveLength(1);
    const mod = modifiers[0];
    expect(mod.kind).toBe("temporary_nightmare_grant");
    if (mod.kind === "temporary_nightmare_grant") {
      expect(mod.count).toBe(2);
      expect(mod.addedEntryIds).toHaveLength(2);
      expect(mod.addedEntryIds).toEqual(
        result.state.journey.deck.map((e) => e.entryId),
      );
    }
  });

});


// ---------------------------------------------------------------------------
// Dreamscape modifiers
// ---------------------------------------------------------------------------

describe("dreamscape modifiers", () => {
  it("BAN_SITE_TYPE appends a remove_shop_sites modifier that decrements over dreamscapes", () => {
    const state = shopState([cardSlot()]);
    const result = reduce(state, "BAN_SITE_TYPE", {
      siteType: "Shop",
      dreamscapesRemaining: 3,
    });
    expect(result.outcome).toBe("applied");
    const mods = result.state.journey.dreamscapeModifiers;
    expect(mods).toHaveLength(1);
    const mod = mods[0];
    expect(mod.kind).toBe("remove_shop_sites");
    expect(mod.dreamscapesRemaining).toBe(3);
  });

  it("BOOST_SITE_APPEARANCE appends a boost modifier with its dreamscape count", () => {
    const state = shopState([cardSlot()]);
    const result = reduce(state, "BOOST_SITE_APPEARANCE", {
      siteType: "Essence",
      percent: 50,
      dreamscapesRemaining: 2,
    });
    expect(result.outcome).toBe("applied");
    const mod = result.state.journey.dreamscapeModifiers[0];
    expect(mod.kind).toBe("boost_site_appearance");
    if (mod.kind === "boost_site_appearance") {
      expect(mod.siteType).toBe("Essence");
      expect(mod.percent).toBe(50);
      expect(mod.dreamscapesRemaining).toBe(2);
    }
  });
});


// ---------------------------------------------------------------------------
// Atlas edits
// ---------------------------------------------------------------------------

describe("atlas edits", () => {
  it("REPLACE_SITE_TYPE swaps a matching unvisited site for a new one", () => {
    const state = shopState([cardSlot()], {
      screen: { type: "dreamscape" },
    }); // node has one Shop site
    const result = reduce(state, "REPLACE_SITE_TYPE", {
      nodeId: NODE_ID,
      fromSiteType: "Shop",
      toSiteType: "Essence",
    });
    expect(result.outcome).toBe("applied");
    const node = result.state.journey.atlas.nodes[NODE_ID];
    expect(node.sites).toHaveLength(1);
    expect(node.sites[0].type).toBe("Essence");
    expect(node.sites[0].id).not.toBe(SITE_ID);
  });

  it("ADD_SITE_TO_DREAMSCAPE appends a new site to the node", () => {
    const state = shopState([cardSlot()]);
    const result = reduce(state, "ADD_SITE_TO_DREAMSCAPE", {
      nodeId: NODE_ID,
      siteType: "Essence",
    });
    expect(result.outcome).toBe("applied");
    const node = result.state.journey.atlas.nodes[NODE_ID];
    expect(node.sites).toHaveLength(2);
    expect(node.sites[1].type).toBe("Essence");
    expect(node.sites[1].isVisited).toBe(false);
  });

  it("uses configured Random Site destinations and presenting guide for Atlas edits", () => {
    registerSiteContentProvider(
      testSiteContentProvider({
        sitesData: {
          ...MINIMAL_SITES_DATA,
          randomSite: {
            ...MINIMAL_SITES_DATA.randomSite,
            destinations: ["Exploration"],
            guideId: testGuideId("fixture-random-guide"),
          },
        },
      }),
    );
    const state = shopState([cardSlot()]);
    const result = reduce(state, "ADD_SITE_TO_DREAMSCAPE", {
      nodeId: NODE_ID,
      siteType: "RandomSite",
    });
    expect(result.outcome).toBe("applied");
    expect(result.state.journey.atlas.nodes[NODE_ID].sites[1]).toMatchObject({
      type: "RandomSite",
      randomSite: {
        mode: "single",
        presentingGuideId: testGuideId("fixture-random-guide"),
        candidateSiteTypes: ["Exploration"],
        destinationSiteType: "Exploration",
      },
    });
  });
});


// ---------------------------------------------------------------------------
// Augury offers (provider-seam delegated)
// ---------------------------------------------------------------------------

describe("augury offers", () => {
  it("ACCEPT_AUGURY_OFFER delegates to the provider and applies its state", () => {
    const provider = testSiteContentProvider({
      resolveAugury({ journey, action }) {
        return action === "accept" ? { journey: { ...journey, essence: 499 }, purges: [] } : null;
      },
    });
    registerSiteContentProvider(provider);
    const state = stateWith([makeSite("Augury")]);
    const result = reduce(state, "ACCEPT_AUGURY_OFFER", {
      siteId: SITE_ID,
    });
    expect(result.outcome).toBe("applied");
    expect(result.state.journey.essence).toBe(499);
  });

  it("DECLINE_AUGURY delegates to the provider", () => {
    const provider = testSiteContentProvider({
      resolveAugury({ journey, action }) {
        return action === "decline"
          ? { journey: completeJourneySite(journey, SITE_ID), purges: [] }
          : null;
      },
    });
    registerSiteContentProvider(provider);
    const state = stateWith([makeSite("Augury")]);
    const result = reduce(state, "DECLINE_AUGURY", {
      siteId: SITE_ID,
    });
    expect(result.outcome).toBe("applied");
    expect(isSiteVisited(result.state.journey, SITE_ID)).toBe(true);
  });
});
