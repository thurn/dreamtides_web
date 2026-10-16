import { afterEach, describe, expect, it } from "vitest";
import { foldEvents } from "../../eventlog/fold";
import type { GameEvent } from "../../eventlog/types";
import { makeAuguryTestCard, makeAuguryTestContent } from "../../journey_v2/testing/fixtures";
import { createSiteContentProvider } from "../../session/providers/site-provider";
import { createJourneyTransfigurationProvider } from "../../session/providers/journey-transfiguration-provider";
import { clearGameProviders } from "../../session/providers/register-game-providers";
import { transfigurationFixture } from "../../testing/transfiguration-fixture";
import { parseCardSubtype } from "../../types/card-identity";
import { testCardId, testDreamsignId } from "../../types/test-identities";
import type { ShopSiteRuntime } from "../../types/journey";
import type { FoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import { journeyShop, shopCardPurchaseQuote, shopOfferRevision } from "./journey-shop";
import { journeyTransfiguration, registerJourneyTransfigurationProvider } from "./journey-transfiguration";
import { createJourneyModifierRegistry } from "./modifier-registry";
import { registerSiteContentProvider } from "./sites";
import { cardSlot, ctx, makeSite, shopState, SITE_ID } from "./shop-fixtures";
import { event, GENESIS } from "./lifecycle-fixtures";

const FIRST = testDreamsignId("compound-first-card"), REFILL = testDreamsignId("compound-refill"), GLOW = testDreamsignId("compound-additional");
const discountPercent = 17;
const registry = createJourneyModifierRegistry([
  journeyShop(FIRST, { kind: "firstCardPurchase", discountPercent }),
  journeyShop(REFILL, { kind: "replacePurchasedItem" }),
  journeyTransfiguration(GLOW, { kind: "additionalRandomTransfiguration" }),
]);
const runtime = (state: FoldState) => state.journey.siteRuntime[SITE_ID] as ShopSiteRuntime;
function fixture() {
  const cards = [7711, 7712].map((cardNumber) => makeAuguryTestCard({ cardNumber, id: testCardId(`compound-card-${cardNumber}`),
    cardType: "Event", subtype: parseCardSubtype(""), spark: null, energyCost: 6, renderedText: "" }));
  const content = { ...makeAuguryTestContent({ cards }), transfigurationData: transfigurationFixture() };
  const provider = createSiteContentProvider(content, registry);
  registerSiteContentProvider(provider);
  registerJourneyTransfigurationProvider(createJourneyTransfigurationProvider(content));
  const copies = Object.fromEntries(cards.map((card) => [String(card.cardNumber), 4]));
  const state = shopState([cardSlot({ cardNumber: cards[0].cardNumber, basePrice: 100 }), cardSlot({ cardNumber: cards[0].cardNumber, basePrice: 50 })], {
    essence: 1000, dreamsigns: [FIRST, REFILL, GLOW].map((id) => ({ id, name: "Shared display name", effectDescription: "" })),
    draftState: { mode: "tides4", draftPoolCopiesByCard: { ...copies }, remainingCopiesByCard: { ...copies }, currentOffer: [], activeSiteId: null, sitePicksCompleted: 0, pickNumber: 1 },
  });
  const config = { ...GAME_ENGINE_CONFIG, genesisState: () => state,
    reducer: (s: FoldState, e: GameEvent, c: Parameters<typeof reduceGameEvent>[2]) => reduceGameEvent(s, e, c, registry) };
  const fold = (base: FoldState, seq: number, events: readonly { seq: number; event: GameEvent }[]) =>
    foldEvents(config, { ...GENESIS, seed: state.journey.seed }, { state: base, seq }, [...events], { devMode: false });
  return { state, provider, fold };
}
const purchase = (state: FoldState) => ({ siteId: SITE_ID, slotIndex: 0, expectedOffer: shopOfferRevision(runtime(state)) });
afterEach(clearGameProviders);

describe("compound first-card purchase, replenishment and original-application boundary", () => {
  it("commits one discounted preformed gain and refill, then buys the new ware at its ordinary quote without a Glow occasion", () => {
    const { state } = fixture(), original = structuredClone(state), site = makeSite("Shop");
    const quote = shopCardPurchaseQuote(state.journey, runtime(state), site, runtime(state).slots[0], registry);
    const first = reduceGameEvent(state, event("BUY_SHOP_SLOT", purchase(state)), ctx({ seq: 1, rng: () => 0 }), registry);
    expect(first.outcome).toBe("applied");
    expect(state).toEqual(original);
    expect(first.state.journey.essence).toBe(state.journey.essence - quote.pricePaid);
    const shelf = runtime(first.state), receipt = shelf.purchaseHistory[0];
    expect(receipt.firstCardPurchaseDiscounts).toEqual([{ dreamsignId: FIRST, heldIndex: 0, discountPercent }]);
    expect(receipt.item.kind).toBe("card");
    expect(first.state.journey.deck[0].transfiguration).not.toBeNull();
    expect(receipt.slotReplacement?.dreamsignId).toBe(REFILL);
    expect(receipt.slotReplacement?.replacement?.item.kind).toBe("card");
    expect(shelf.slots[0].purchased).toBe(false);
    expect(shelf.slots[1]).toEqual(runtime(state).slots[1]);
    expect(shelf.rerollCount).toBe(runtime(state).rerollCount);
    expect(first.state.journey.shopModifiers).toEqual(state.journey.shopModifiers);
    expect(first.state.journey).not.toHaveProperty("journeyDraw");
    expect(first.logRecords?.map((row) => row.fields.dreamsignId)).toEqual([FIRST, REFILL]);
    const secondQuote = shopCardPurchaseQuote(first.state.journey, shelf, site, shelf.slots[0], registry);
    expect(secondQuote.firstCardPurchase).toBe(false);
    const second = reduceGameEvent(first.state, event("BUY_SHOP_SLOT", purchase(first.state)), ctx({ seq: 2, rng: () => 0 }), registry);
    expect(second.outcome).toBe("applied");
    expect(second.state.journey.essence).toBe(first.state.journey.essence - secondQuote.pricePaid);
    expect(runtime(second.state).purchaseHistory[1].firstCardPurchaseDiscounts).toBeUndefined();
    expect(second.state.journey.deck[1].transfiguration).toBeNull();
    expect(new Set(second.state.journey.deck.map(({ entryId }) => entryId)).size).toBe(2);
    expect(second.state.journey).not.toHaveProperty("pendingJourneyLoop");
    expect(second.state.journey).not.toHaveProperty("journeyDraw");
  });

  it("contains a failed compound transaction and preserves the committed ordinal and offer identity through restart, stale refusal and replay", () => {
    const { state, provider, fold } = fixture(), saved = structuredClone(state), request = event("BUY_SHOP_SLOT", purchase(state));
    registerSiteContentProvider({ ...provider, replacePurchasedShopSlot: () => { throw new Error("synthetic replacement unavailable"); } });
    const failed = fold(state, 0, [{ seq: 1, event: request }]);
    expect(failed.state).toEqual(saved);
    expect(failed.outcomes[0]).toMatchObject({ outcome: "bounced", bounceReason: "fold_error" });
    expect(failed.outcomes[0].logRecords).toBeUndefined();
    registerSiteContentProvider(provider);
    const retry = { ...request, basedOnSeq: 1 };
    const accepted = fold(failed.state, 1, [{ seq: 2, event: retry }]);
    expect(accepted.outcomes[0].outcome).toBe("applied");
    const loaded = GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(accepted.state));
    expect(loaded).toEqual(accepted.state);
    const follow = [{ seq: 3, event: { ...request, basedOnSeq: 2 } }, { seq: 4, event: { ...event("BUY_SHOP_SLOT", purchase(loaded)), basedOnSeq: 3 } }];
    const resumed = fold(loaded, 2, follow);
    expect(resumed.outcomes.map(({ outcome }) => outcome)).toEqual(["bounced", "applied"]);
    expect(resumed.outcomes[0].logRecords).toBeUndefined();
    expect(runtime(resumed.state).purchaseHistory).toHaveLength(2);
    expect(runtime(resumed.state).purchaseHistory[1].firstCardPurchaseDiscounts).toBeUndefined();
    const replay = fold(failed.state, 1, [{ seq: 2, event: retry }, ...follow]);
    expect(replay.state).toEqual(resumed.state);
    expect(replay.outcomes.slice(1)).toEqual(resumed.outcomes);
    expect(GAME_ENGINE_CONFIG.hash(resumed.state)).toBe(GAME_ENGINE_CONFIG.hash(replay.state));
    expect(state).toEqual(saved);
  });
});
