import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { foldEvents } from "../../eventlog/fold";
import type { EventContext, GameEvent } from "../../eventlog/types";
import { NIGHTMARE_CARD_ID } from "../../data/nightmare";
import { parseCardSubtype } from "../../types/card-identity";
import { parseSiteId, type DreamsignId } from "../../types/identifiers";
import { testCardId, testDreamsignId, testExplorationActionId } from "../../types/test-identities";
import type { JourneyShopEffect, ShopSiteRuntime } from "../../types/journey";
import { clearGameProviders } from "../../session/providers/register-game-providers";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import type { FoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import { createJourneyModifierRegistry, type JourneyModifierDefinition } from "./modifier-registry";
import { journeyShop, shopCardPurchaseQuote } from "./journey-shop";
import { journeyDeckEntry } from "./journey-deck-entry";
import { journeyTransfiguration, registerJourneyTransfigurationProvider } from "./journey-transfiguration";
import { registerSiteContentProvider } from "./sites";
import { registerDeckContentProvider } from "./deck";
import { testSiteContentProvider } from "./test-content-providers";
import { cardSlot, dreamsignSlot, makeSite, shopState, shopModifiers, shopRuntime, SITE_ID, ctx } from "./shop-fixtures";
import { event, GENESIS } from "./lifecycle-fixtures";

const FIRST = testDreamsignId("first-card"), SECOND = testDreamsignId("second-first-card"), SHARD = testDreamsignId("all-card-forms");
const PREVENT = testDreamsignId("prevent-nightmare"), COPY = testDreamsignId("copy-event"), OTHER = testDreamsignId("unrelated-first-card");
const sign = (id: DreamsignId) => ({ id, name: "Same synthetic name", effectDescription: "" });
const first = (id = FIRST, discountPercent = 17) => journeyShop(id, { kind: "firstCardPurchase", discountPercent });
const registry = createJourneyModifierRegistry([first(), first(SECOND, 23), journeyShop(SHARD, { kind: "purchasedCardTransfiguration" })]);
const runtime = (state: FoldState, siteId = SITE_ID) => state.journey.siteRuntime[siteId] as ShopSiteRuntime;
const buy = (state: FoldState, slotIndex = 0, context: Partial<EventContext> = {}, use = registry, payload = {}, actor = "alice") =>
  reduceGameEvent(state, event("BUY_SHOP_SLOT", { siteId: SITE_ID, slotIndex, ...payload }, actor), ctx(context), use);
function fixture(held = [FIRST], enhanced = false) {
  const state = shopState([cardSlot({ basePrice: 31, discountPercent: 7 }), cardSlot({ basePrice: 31 })], {
    essence: 200, dreamsigns: held.map(sign), shopModifiers: shopModifiers({ essenceDiscountPercent: 11 }),
  });
  Object.values(state.journey.atlas.nodes)[0].sites[0].isEnhanced = enhanced;
  return state;
}
function forms() {
  registerJourneyTransfigurationProvider({ resolve: (entry) => ({ cardId: entry.cardNumber === 99 ? NIGHTMARE_CARD_ID : testCardId(`first-card-${entry.cardNumber}`),
    cardType: "Event", subtype: parseCardSubtype("Event"), forms: entry.transfiguration !== null || entry.cardNumber === 30 ? [] : ["Kindled", "Inspired"] }) });
}
beforeEach(() => {
  forms();
  registerDeckContentProvider({ resolveCardNumber: () => 7, resolveDreamsign: sign });
  registerSiteContentProvider(testSiteContentProvider({ rerollShop: ({ journey }) => ({ slots: [cardSlot({ basePrice: 31 })],
    remainingDreamsignPool: [], remainingDreamsignPoolIds: [], draftState: journey.draftState }) }));
});
afterEach(clearGameProviders);

describe("first successful card purchase pricing and attribution", () => {
  it.each([false, true])("quotes and charges each physical held source additively, enhanced=%s", (enhanced) => {
    const before = fixture([FIRST, SECOND, FIRST, OTHER], enhanced), saved = structuredClone(before);
    const quote = shopCardPurchaseQuote(before.journey, runtime(before), makeSite("Shop", { isEnhanced: enhanced }), runtime(before).slots[0], registry);
    expect(quote).toMatchObject({ firstCardPurchase: true, priceBeforeFree: 8, pricePaid: 8,
      discounts: [{ dreamsignId: FIRST, heldIndex: 0, discountPercent: 17 }, { dreamsignId: SECOND, heldIndex: 1, discountPercent: 23 }, { dreamsignId: FIRST, heldIndex: 2, discountPercent: 17 }] });
    const rng = vi.fn(() => .75), out = buy(before, 0, { rng });
    expect(out.state.journey.essence).toBe(192); expect(out.state.journey.deck[0].transfiguration).toBe("Inspired");
    expect(runtime(out.state).purchaseHistory[0]).toMatchObject({ siteId: SITE_ID, priceBeforeFree: 8, pricePaid: 8,
      firstCardPurchaseDiscounts: quote.discounts, item: { journeyShopTransfiguration: { dreamsignId: FIRST, heldIndex: 0, drawIndex: 0 } } });
    expect(out.logRecords?.map((r) => [r.fields.dreamsignId, r.fields.heldIndex])).toEqual([[FIRST, 0], [SECOND, 1], [FIRST, 2]]);
    expect(out.logRecords?.every((r) => r.event === "journey_modifier_applied")).toBe(true);
    expect(out.logRecords?.[0].fields).toMatchObject({ before: { basePrice: 31, slotDiscountPercent: 7, essenceDiscountPercent: 11, discountPercent: 17 },
      after: { priceBeforeFree: 8, pricePaid: 8, essence: 192 }, target: { siteIds: [SITE_ID], transfigurations: [{ type: "Inspired", drawIndex: 0 }] } });
    expect(out.logRecords?.[1].fields.target).toEqual({ siteIds: [SITE_ID] });
    expect(rng).toHaveBeenCalledExactlyOnceWith(0); expect(before).toEqual(saved);
    const second = buy(out.state, 1);
    expect(runtime(second.state).purchaseHistory[1]).toMatchObject({ pricePaid: 28 });
    expect(runtime(second.state).purchaseHistory[1].firstCardPurchaseDiscounts).toBeUndefined();
    expect(second.state.journey.deck[1].transfiguration).toBeNull(); expect(second.logRecords).toBeUndefined();
  });
  it("clamps discounts and consumes FIFO free charges even for an already free price", () => {
    const base = fixture([FIRST, SECOND, FIRST, SECOND, FIRST]);
    const state = { ...base, journey: { ...base.journey, shopModifiers: { ...base.journey.shopModifiers,
      freePurchaseModifiers: [{ kind: "free-purchases" as const, initialCount: 2, remainingCount: 2,
        sourceSiteId: SITE_ID, sourceActionId: testExplorationActionId("first-free") }] } } };
    const a = buy(state).state, b = buy(a, 1).state;
    expect(runtime(a).purchaseHistory[0]).toMatchObject({ priceBeforeFree: 0, pricePaid: 0, freePurchaseModifier: { remainingBefore: 2, remainingAfter: 1 } });
    expect(runtime(b).purchaseHistory[1]).toMatchObject({ priceBeforeFree: 28, pricePaid: 0, freePurchaseModifier: { remainingAfter: 0 } });
    expect(b.journey.essence).toBe(200); expect(b.journey.shopModifiers.freePurchaseModifiers).toEqual([]);
    const freeVisit = fixture(); runtime(freeVisit).freePurchaseSource = { sourceSiteId: SITE_ID, sourceActionId: testExplorationActionId("free-visit") };
    expect(runtime(buy(freeVisit).state).purchaseHistory[0]).toMatchObject({ priceBeforeFree: 20, pricePaid: 0 });
  });
  it("excludes Bazaar and Dreamsign receipts while retaining the Card Shop card ordinal", () => {
    const bazaar = shopState([cardSlot({ basePrice: 31 })], { essence: 100, dreamsigns: [FIRST].map(sign) }, "DreamsignBazaar");
    const bought = buy(bazaar); expect(bought.state.journey.essence).toBe(69); expect(bought.state.journey.deck[0].transfiguration).toBeNull();
    expect(bought.logRecords).toBeUndefined();
    const mixed = fixture(); runtime(mixed).slots.unshift(dreamsignSlot("ware", { basePrice: 1 }));
    const signBuy = buy(mixed).state;
    expect(runtime(signBuy).purchaseHistory[0].firstCardPurchaseDiscounts).toBeUndefined();
    expect(runtime(buy(signBuy, 1).state).purchaseHistory[1].pricePaid).toBe(20);
  });
  it("retains per-site history through Restock, shelf refill, source loss, reacquisition and late gain", () => {
    const initial = fixture(), a = buy(initial).state;
    const lost = reduceGameEvent(a, event("REMOVE_DREAMSIGN", { dreamsignId: FIRST }), ctx(), registry).state;
    const regained = reduceGameEvent(lost, event("ADD_DREAMSIGN", { dreamsignId: FIRST }), ctx(), registry).state;
    const restocked = reduceGameEvent(regained, event("REROLL_SHOP", { siteId: SITE_ID }), ctx(), registry).state;
    expect(runtime(restocked).purchaseHistory).toEqual(runtime(a).purchaseHistory);
    expect(runtime(buy(restocked).state).purchaseHistory[1].pricePaid).toBe(28);
    const refill = structuredClone(a); runtime(refill).slots = [cardSlot({ basePrice: 31 })];
    expect(runtime(buy(refill).state).purchaseHistory[1].pricePaid).toBe(28);
    const late = buy(fixture([])).state; late.journey.dreamsigns = [sign(FIRST)];
    expect(runtime(buy(late, 1).state).purchaseHistory[1].pricePaid).toBe(28);
    const fresh = fixture([]); fresh.journey.dreamsigns = [sign(FIRST)];
    expect(runtime(buy(fresh).state).purchaseHistory[0].pricePaid).toBe(20);
    const secondSite = parseSiteId("site-second-visit"), moved = structuredClone(a);
    Object.values(moved.journey.atlas.nodes)[0].sites.push(makeSite("Shop", { id: secondSite }));
    moved.journey.screen = { type: "site", siteId: secondSite }; moved.journey.siteRuntime[secondSite] = shopRuntime([cardSlot({ basePrice: 31 })]);
    const out = buy(moved, 0, {}, registry, { siteId: secondSite });
    expect(runtime(out.state, secondSite).purchaseHistory[0].pricePaid).toBe(22);
  });
  it("leaves the ordinal and resources intact for poor, malformed, stale, cancelled and partner-conflicting attempts", () => {
    const before = fixture(), rng = vi.fn(() => 0), saved = structuredClone(before);
    for (const payload of [{ slotIndex: -1 }, { slotIndex: .5 }, { slotIndex: 99 }, { siteId: "missing" }, { purgeIndex: "bad" }]) {
      expect(buy(before, 0, { rng }, registry, payload).state).toBe(before);
    }
    const poor = fixture(); poor.journey.essence = 19;
    expect(buy(poor, 0, { rng }).state).toBe(poor);
    const conflict = buy(before, 0, { rng, intervening: [{ seq: 1, type: "BUY_SHOP_SLOT", actor: event("BUY_SHOP_SLOT", {}, "bob").actor }] });
    expect(conflict.state).toBe(before); expect(conflict.bounceReason).toBe("partner_conflict");
    // Cancelling before submission emits no buy event; the persisted shelf stays eligible.
    expect(shopCardPurchaseQuote(before.journey, runtime(before), makeSite("Shop"), runtime(before).slots[0], registry).firstCardPurchase).toBe(true);
    expect(rng).not.toHaveBeenCalled(); expect(before).toEqual(saved);
    const out = buy(before).state; expect(buy(out).state).toBe(out); expect(runtime(out).purchaseHistory).toHaveLength(1);
  });
});

describe("initial forms and successful first-card receipts", () => {
  it.each([[SHARD, FIRST, SECOND], [FIRST, SHARD, SECOND]])("selects one source in held order while logging all discounts, held=%j", (...held) => {
    const before = fixture(held), rng = vi.fn(() => 0), out = buy(before, 0, { rng });
    expect(runtime(out.state).purchaseHistory[0].item).toMatchObject({ journeyShopTransfiguration: { dreamsignId: held[0], heldIndex: 0 } });
    expect(out.logRecords?.map((r) => r.fields.dreamsignId)).toEqual(held.filter((id, index) => id !== SHARD || index === 0));
    expect(rng).toHaveBeenCalledTimes(1);
  });
  it("preserves preformed gains without provider or occurrence and skips empty eligible forms without a draw", () => {
    const before = fixture(); runtime(before).slots[0] = cardSlot({ basePrice: 31, transfiguration: "Kindled" });
    registerJourneyTransfigurationProvider(null); const rng = vi.fn(() => 0), a = buy(before, 0, { rng });
    expect(a.outcome).toBe("applied"); expect(a.state.journey.deck[0].transfiguration).toBe("Kindled");
    expect(runtime(a.state).purchaseHistory[0].firstCardPurchaseDiscounts).toHaveLength(1);
    forms(); const empty = fixture(); runtime(empty).slots[0] = cardSlot({ cardNumber: 30, basePrice: 31 });
    expect(buy(empty, 0, { rng }).state.journey.deck[0].transfiguration).toBeNull(); expect(rng).not.toHaveBeenCalled();
    const copying = createJourneyModifierRegistry([first(), journeyTransfiguration(COPY, { kind: "copyTransfiguredEvent" })]);
    const eventCard = buy(fixture([FIRST, COPY]), 0, { rng }, copying);
    expect(eventCard.state.journey.deck).toHaveLength(1);
    expect(eventCard.logRecords?.map((r) => r.fields.dreamsignId)).toEqual([FIRST]);
  });
  it("counts a paid successful receipt when an existing prohibition prevents the gained card", () => {
    const use = createJourneyModifierRegistry([first(), journeyDeckEntry(PREVENT, { kind: "preventNightmare" })]);
    const before = fixture([FIRST, PREVENT]); runtime(before).slots[0] = cardSlot({ cardNumber: 99, basePrice: 31 });
    const a = buy(before, 0, {}, use);
    expect(a.outcome).toBe("applied"); expect(a.state.journey.deck).toHaveLength(0);
    expect(runtime(a.state).purchaseHistory[0]).toMatchObject({ pricePaid: 22, firstCardPurchaseDiscounts: [{ dreamsignId: FIRST }] });
    expect(runtime(buy(a.state, 1, {}, use).state).purchaseHistory[1].pricePaid).toBe(28);
  });
  it("refuses missing content atomically and contains invalid draws without publishing partial state", () => {
    const before = fixture(), saved = structuredClone(before); registerJourneyTransfigurationProvider(null);
    expect(buy(before).state).toBe(before);
    expect(buy(fixture([])).outcome).toBe("applied");
    forms(); for (const value of [NaN, Infinity, -.1, 1]) expect(() => buy(before, 0, { rng: () => value })).toThrow(RangeError);
    expect(before).toEqual(saved);
  });
  it("rejects invalid catalog percentages", () => {
    for (const discountPercent of [NaN, Infinity, -1, 101]) expect(() => first(FIRST, discountPercent)).toThrow(RangeError);
    expect(() => journeyShop(FIRST, { kind: "unsupported" } as unknown as JourneyShopEffect)).toThrow(RangeError);
  });
});

describe("atomic purchase fold and restart", () => {
  const config = (state: FoldState, use = registry) => ({ ...GAME_ENGINE_CONFIG, genesisState: () => state,
    reducer: (s: FoldState, e: GameEvent, c: EventContext) => reduceGameEvent(s, e, c, use) });
  const fold = (before: FoldState, events: { seq: number; event: GameEvent }[], use = registry) =>
    foldEvents(config(before, use), GENESIS, { state: before, seq: 0 }, events, { devMode: false });
  it("rolls back provider failure and a late hook error with payment, charges, receipts and source logs", () => {
    const before = fixture(), saved = structuredClone(before), attempt = { seq: 1, event: event("BUY_SHOP_SLOT", { siteId: SITE_ID, slotIndex: 0 }) };
    registerJourneyTransfigurationProvider({ resolve: () => { throw new Error("synthetic form provider failure"); } });
    const failed = fold(before, [attempt]);
    expect(failed.state).toEqual(saved); expect(failed.outcomes[0]).toMatchObject({ outcome: "bounced", bounceReason: "fold_error" });
    expect(failed.outcomes[0].logRecords).toBeUndefined(); forms();
    const FAIL = testDreamsignId("late-first-card-failure"); let fail = true;
    const hook: JourneyModifierDefinition = { dreamsignId: FAIL, afterJourneyEvent: () => { if (fail) throw new Error("synthetic later failure"); return null; } };
    const use = createJourneyModifierRegistry([first(), hook]), base = fixture([FIRST, FAIL]);
    const withHook = { ...base, journey: { ...base.journey, shopModifiers: { ...base.journey.shopModifiers,
      freePurchaseModifiers: [{ kind: "free-purchases" as const, initialCount: 1, remainingCount: 1,
        sourceSiteId: SITE_ID, sourceActionId: testExplorationActionId("rollback-free") }] } } };
    const original = structuredClone(withHook), rolledBack = fold(withHook, [attempt], use);
    expect(rolledBack.state).toEqual(original); expect(rolledBack.outcomes[0].logRecords).toBeUndefined();
    fail = false; const success = fold(rolledBack.state, [{ ...attempt, seq: 2 }], use);
    expect(runtime(success.state).purchaseHistory).toHaveLength(1); expect(success.state.journey.shopModifiers.freePurchaseModifiers).toEqual([]);
    expect(success.outcomes[0].logRecords?.[0].fields.dreamsignId).toBe(FIRST); expect(withHook).toEqual(original);
  });
  it("replays exactly through every serialized successful receipt boundary", () => {
    const before = fixture(), events = [0, 1].map((slotIndex, i) => ({ seq: i + 1,
      event: { ...event("BUY_SHOP_SLOT", { siteId: SITE_ID, slotIndex }), basedOnSeq: i } }));
    const all = fold(before, events);
    expect(all.outcomes.every((o) => o.outcome === "applied")).toBe(true);
    const prefix = fold(before, events.slice(0, 1)), loaded = GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(prefix.state));
    const continued = foldEvents(config(before), GENESIS, { state: loaded, seq: 1 }, events.slice(1), { devMode: false });
    expect(continued.state).toEqual(all.state); expect(continued.outcomes).toEqual(all.outcomes.slice(1));
    expect(fold(before, events).state).toEqual(all.state);
  });
  it("accepts one concurrent partner purchase from a shared head", () => {
    const before = fixture(), out = fold(before, ["alice", "bob"].map((actor, i) => ({ seq: i + 1,
      event: event("BUY_SHOP_SLOT", { siteId: SITE_ID, slotIndex: 0 }, actor) })));
    expect(out.outcomes.map((o) => o.outcome)).toEqual(["applied", "bounced"]);
    expect(out.outcomes[1].bounceReason).toBe("partner_conflict"); expect(runtime(out.state).purchaseHistory).toHaveLength(1);
    expect(out.state).toEqual(fold(before, [{ seq: 1, event: event("BUY_SHOP_SLOT", { siteId: SITE_ID, slotIndex: 0 }) }]).state);
  });
});
