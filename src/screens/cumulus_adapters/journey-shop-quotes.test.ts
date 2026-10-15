import { afterEach, describe, expect, it } from "vitest";
import { economyFixture } from "../../testing/economy-fixture";
import { testDreamsignId } from "../../types/test-identities";
import type { ShopSiteRuntime } from "../../types/journey";
import { journeyShop } from "../../rules/journey/journey-shop";
import { createJourneyModifierRegistry } from "../../rules/journey/modifier-registry";
import { reduceGameEvent } from "../../rules/reducer";
import { testSiteContentProvider } from "../../rules/journey/test-content-providers";
import { registerSiteContentProvider } from "../../rules/journey/sites";
import { cardSlot, shopState, makeSite, SITE_ID, ctx } from "../../rules/journey/shop-fixtures";
import { event } from "../../rules/journey/lifecycle-fixtures";
import { buildCardShopRestock } from "./card-shop-view-model";
import { buildDreamsignBazaarRestock } from "./dreamsign-bazaar-view-model";

const COIN = testDreamsignId("quote-first-free"), OTHER = testDreamsignId("quote-other");
const registry = createJourneyModifierRegistry([journeyShop(COIN, { kind: "firstRestockFree" })]);
const reroll = { standardPrice: 19, enhancedPrice: 7, maxPerVisit: 3 };
const economy = { ...economyFixture(), shop: { ...economyFixture().shop, reroll } };
afterEach(() => registerSiteContentProvider(null));

describe("authoritative journeyShop Restock quote and payment", () => {
  it.each(["Shop", "DreamsignBazaar"] as const)("keeps %s affordance, real payment and global-token consumption identical", (type) => {
    const build = type === "Shop" ? buildCardShopRestock : buildDreamsignBazaarRestock;
    for (const enhanced of [false, true]) for (const held of [[], [OTHER], [COIN], [COIN, COIN]])
      for (const ordinal of [0, 1, 3]) for (const freeRerolls of [0, 1]) for (const essence of [0, 30]) {
        const initial = shopState([cardSlot()], { essence, dreamsigns: held.map((id) => ({ id, name: "Same fixture name", effectDescription: "" })) }, type);
        const before = { ...initial, journey: { ...initial.journey, shopModifiers: { ...initial.journey.shopModifiers, freeRerolls } } };
        const site = makeSite(type, { isEnhanced: enhanced });
        Object.values(before.journey.atlas.nodes)[0].sites[0] = site;
        const runtime = before.journey.siteRuntime[SITE_ID] as ShopSiteRuntime;
        runtime.rerollCount = ordinal;
        registerSiteContentProvider(testSiteContentProvider({ economyData: economy, rerollShop: ({ journey }) => ({
          slots: [cardSlot()], remainingDreamsignPool: [], remainingDreamsignPoolIds: [], draftState: journey.draftState,
        }) }));
        const view = build(reroll, runtime, site, essence, before.journey, registry);
        const expected = freeRerolls > 0 || ordinal === 0 && held.includes(COIN) ? 0 : enhanced ? 7 : 19;
        expect(view.price).toBe(expected);
        expect(view.state).toBe(ordinal >= reroll.maxPerVisit ? "used" : expected <= essence ? "available" : "unaffordable");
        const saved = structuredClone(before);
        const result = reduceGameEvent(before, event("REROLL_SHOP", { siteId: SITE_ID }), ctx(), registry);
        if (view.state === "available") {
          expect(result.outcome).toBe("applied"); expect(result.state.journey.essence).toBe(essence - view.price);
          expect(result.state.journey.shopModifiers.freeRerolls).toBe(Math.max(0, freeRerolls - 1));
          expect((result.state.journey.siteRuntime[SITE_ID] as ShopSiteRuntime).rerollCount).toBe(ordinal + 1);
        } else expect(result.state).toBe(before);
        expect(before).toEqual(saved);
      }
  });
  it("preserves the ordinary optional-input contract and naturally free enhanced quotes", () => {
    const state = shopState([cardSlot()]), runtime = state.journey.siteRuntime[SITE_ID] as ShopSiteRuntime;
    expect(buildCardShopRestock(reroll, runtime, makeSite("Shop"), 30)).toMatchObject({ price: 19, state: "available" });
    const freeConfig = { ...reroll, enhancedPrice: 0 };
    expect(buildDreamsignBazaarRestock(freeConfig, runtime, makeSite("DreamsignBazaar", { isEnhanced: true }), 0, state.journey, registry)).toMatchObject({ price: 0, state: "available" });
    runtime.rerollCount = 3;
    expect(buildCardShopRestock(freeConfig, runtime, makeSite("Shop", { isEnhanced: true }), 0, state.journey, registry)).toMatchObject({ price: 0, state: "used" });
  });
});
