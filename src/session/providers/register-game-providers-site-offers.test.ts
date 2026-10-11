// Real site content provider offers: the tutorial's authored opening
// Revelation Dreamsign, enhanced Shop pricing, and the one-use transfigure and
// free-shop modifiers a Shop consumes when it opens.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { JourneyState } from "../../types/journey";
import {
  clearGameProviders,
  registerGameProviders,
} from "./register-game-providers";
import { createSiteContentProvider } from "./site-provider";
import { parseSiteId } from "../../types/identifiers";
import { testExplorationActionId } from "../../types/test-identities";
import {
  makeJourneyContent,
  OPEN,
  siteOf,
  startedJourney,
} from "./register-game-providers.fixtures";

describe("registerGameProviders (real content providers)", () => {
  beforeAll(() => {
    registerGameProviders(makeJourneyContent());
  });
  afterAll(() => {
    clearGameProviders();
  });

  it("includes the authored Dreamsign in the tutorial's opening Revelation offer", () => {
    const content = makeJourneyContent();
    const started = startedJourney();
    const { startingNodeId } = started.atlas;
    if (started.resolvedPackage === null || startingNodeId === null) {
      throw new Error("expected a started journey");
    }
    const poolIds = content.dreamsignTemplates.map(({ id }) => id);
    const requiredId = poolIds[poolIds.length - 1];
    // The authored offer applies only to the opening node's Revelation site.
    const revelation = siteOf("revelation", "DreamsignRevelation");
    const openingNode = started.atlas.nodes[startingNodeId];

    const result = createSiteContentProvider(content).openSite({
      journey: {
        ...started,
        atlas: {
          ...started.atlas,
          nodes: {
            ...started.atlas.nodes,
            [startingNodeId]: {
              ...openingNode,
              sites: [revelation, ...openingNode.sites],
            },
          },
        },
        isTutorialJourney: true,
        remainingDreamsignPool: poolIds,
        resolvedPackage: {
          ...started.resolvedPackage,
          dreamsignPoolIds: poolIds,
          openingDreamsignOfferIds: [requiredId],
        },
      },
      site: revelation,
      rng: () => 0,
      ...OPEN,
    });

    expect(result?.runtime.kind).toBe("dreamsignOffer");
    if (result?.runtime.kind !== "dreamsignOffer") return;
    expect(result.runtime.offeredDreamsigns.map(({ id }) => id)).toContain(
      requiredId,
    );
  });

  it("uses standard card pricing for enhanced Shop inventory and restocks", () => {
    const content = makeJourneyContent();
    const journey = startedJourney();
    const shop = siteOf("enhanced-shop", "Shop", true);
    const provider = createSiteContentProvider(content);
    const { cardSlots } = content.economyData.shop.stock.specialtyShop;
    const { standardCard } = content.economyData.shop.prices;

    const opened = provider.openSite({ journey, site: shop, rng: () => 0, ...OPEN });
    if (opened?.runtime.kind !== "shop") throw new Error("expected a shop");
    const rerolled = provider.rerollShop({
      journey: {
        ...journey,
        siteRuntime: { ...journey.siteRuntime, [shop.id]: opened.runtime },
      },
      site: shop,
      rng: () => 0.5,
    });

    for (const slots of [opened.runtime.slots, rerolled?.slots ?? []]) {
      const cards = slots.filter(({ itemType }) => itemType === "card");
      expect(cards).toHaveLength(cardSlots);
      expect(cards.every(({ basePrice }) => basePrice === standardCard)).toBe(
        true,
      );
    }
  });

  it("consumes the one-use modifier while minting transfigured Shop slots", () => {
    const modifier = {
      kind: "transfigure-next-draft-or-shop" as const,
      sourceSiteId: parseSiteId("exploration-site"),
      sourceActionId: testExplorationActionId("exploration-action"),
    };

    const result = createSiteContentProvider(makeJourneyContent()).openSite({
      journey: { ...startedJourney(), siteOfferModifiers: [modifier] },
      site: siteOf("transfigured-shop", "Shop"),
      rng: () => 0,
      ...OPEN,
    });

    expect(result?.siteOfferModifiers).toEqual([]);
    expect(result?.runtime).toMatchObject({
      kind: "shop",
      transfiguredOfferSource: {
        siteId: modifier.sourceSiteId,
        actionId: modifier.sourceActionId,
      },
    });
    if (result?.runtime.kind !== "shop") return;
    const cards = result.runtime.slots.filter(
      (slot) => slot.itemType === "card",
    );
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every(({ transfiguration }) => transfiguration !== undefined)).toBe(
      true,
    );
  });

  it("binds one queued free-shop modifier only to a Card Shop, never a Bazaar", () => {
    const started = startedJourney();
    const [firstModifier, secondModifier] = ["one", "two"].map((suffix) => ({
      kind: "free-next-shop" as const,
      sourceSiteId: parseSiteId(`exploration-${suffix}`),
      sourceActionId: testExplorationActionId(`action-${suffix}`),
    }));
    const journey: JourneyState = {
      ...started,
      shopModifiers: {
        ...started.shopModifiers,
        freeNextShopModifiers: [firstModifier, secondModifier],
      },
    };
    const provider = createSiteContentProvider(makeJourneyContent());

    const bazaar = provider.openSite({
      journey,
      site: siteOf("bazaar", "DreamsignBazaar"),
      rng: () => 0,
      ...OPEN,
    });
    expect(bazaar?.runtime).not.toHaveProperty("freePurchaseSource");
    expect(bazaar?.shopModifiers).toBeUndefined();

    const shop = provider.openSite({
      journey,
      site: siteOf("shop", "Shop"),
      rng: () => 0,
      ...OPEN,
    });
    expect(shop?.runtime).toMatchObject({
      kind: "shop",
      freePurchaseSource: {
        sourceSiteId: firstModifier.sourceSiteId,
        sourceActionId: firstModifier.sourceActionId,
      },
    });
    expect(shop?.shopModifiers?.freeNextShopModifiers).toEqual([secondModifier]);
    expect(shop?.shopModifiers?.freePurchaseModifiers).toEqual(
      journey.shopModifiers.freePurchaseModifiers,
    );
  });

});
