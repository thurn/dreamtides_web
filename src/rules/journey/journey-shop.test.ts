import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { foldEvents } from "../../eventlog/fold";
import type { EventContext, GameEvent } from "../../eventlog/types";
import { makeAuguryTestCard, makeAuguryTestContent, makeAuguryTestDreamsignTemplate } from "../../journey_v2/testing/fixtures";
import { createSiteContentProvider } from "../../session/providers/site-provider";
import { clearGameProviders } from "../../session/providers/register-game-providers";
import { SELECTION_RULES_VERSION } from "../../reward-selection";
import { parseCardName, parseCardSubtype, EVENT_CARD_SUBTYPE } from "../../types/card-identity";
import { parseSiteId, type DreamsignId } from "../../types/identifiers";
import { testCardId, testDreamsignId, testExplorationActionId } from "../../types/test-identities";
import type { JourneyShopEffect, ShopSiteRuntime } from "../../types/journey";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import type { FoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import { createJourneyModifierRegistry, type JourneyModifierDefinition } from "./modifier-registry";
import { journeyShop, shopStockCounts } from "./journey-shop";
import { journeyDeckEntry } from "./journey-deck-entry";
import { journeyTransfiguration, registerJourneyTransfigurationProvider } from "./journey-transfiguration";
import { registerSiteContentProvider } from "./sites";
import { registerDeckContentProvider } from "./deck";
import { cardSlot, makeSite, shopState, stateWith, SITE_ID, ctx } from "./shop-fixtures";
import { poolDraftState } from "./draft-fixtures";
import { event, GENESIS } from "./lifecycle-fixtures";

const ORB = testDreamsignId("stock-source"), COIN = testDreamsignId("first-restock"), SHARD = testDreamsignId("purchase-form"), OTHER = testDreamsignId("unrelated");
const CRYSTAL = testDreamsignId("additional-form"), TOME = testDreamsignId("copy-event"), WARRIOR = testDreamsignId("warrior-bonus");
const sign = (id: DreamsignId) => ({ id, name: "Same synthetic name", effectDescription: "" });
const registry = createJourneyModifierRegistry([
  journeyShop(ORB, { kind: "additionalOptions", amount: 3 }),
  journeyShop(COIN, { kind: "firstRestockFree" }),
  journeyShop(SHARD, { kind: "purchasedCardTransfiguration" }),
]);
const cards = Array.from({ length: 30 }, (_, i) => makeAuguryTestCard({ id: testCardId(`shop-${i}`), cardNumber: i + 1, name: parseCardName("Same synthetic name") }));
const templates = Array.from({ length: 30 }, (_, i) => makeAuguryTestDreamsignTemplate({ id: testDreamsignId(`ware-${i}`), name: "Same synthetic name" }));
const baseContent = makeAuguryTestContent({ cards, dreamsignTemplates: templates });
const content = { ...baseContent, economyData: { ...baseContent.economyData, shop: { ...baseContent.economyData.shop,
  stock: { cardShop: { cardSlots: 2, dreamsignSlots: 0 }, specialtyShop: { cardSlots: 4, dreamsignSlots: 0 }, dreamsignBazaar: { cardSlots: 0, dreamsignSlots: 3 } },
  discounts: { slotCounts: [{ value: 0, weight: 1 }], percentages: [{ value: 0, weight: 1 }] },
  reroll: { standardPrice: 13, enhancedPrice: 5, maxPerVisit: 3 },
} } };
const copies = Object.fromEntries(cards.map((card) => [String(card.cardNumber), 2]));
function fixture(type: "Shop" | "DreamsignBazaar" = "Shop", held = [ORB], enhanced = false): FoldState {
  return stateWith([makeSite(type, { isEnhanced: enhanced })], { dreamsigns: held.map(sign), essence: 100,
    remainingDreamsignPool: templates.map((s) => s.id),
    draftState: poolDraftState({ draftPoolCopiesByCard: { ...copies }, remainingCopiesByCard: { ...copies }, activeSiteId: null, currentOffer: [], siteShownCardNumbers: [] }),
  });
}
function apply(state: FoldState, type: GameEvent["type"], payload: Record<string, unknown> = {}, context: Partial<EventContext> = {}, use = registry, actor = "alice") {
  return reduceGameEvent(state, event(type, { siteId: SITE_ID, ...payload }, actor), ctx(context), use);
}
const open = (state: FoldState) => apply(state, "OPEN_SITE", { selectionRulesVersion: SELECTION_RULES_VERSION });
const runtime = (state: FoldState) => state.journey.siteRuntime[SITE_ID] as ShopSiteRuntime;
function installForms() {
  registerJourneyTransfigurationProvider({ resolve: (entry) => ({ cardId: cards[entry.cardNumber - 1].id,
    cardType: entry.typeChange?.cardType ?? "Character", subtype: entry.typeChange?.subtype ?? parseCardSubtype("Warrior"),
    forms: entry.transfiguration !== null || entry.cardNumber === 30 ? [] : ["Kindled", "Empowered"],
  }) });
}
beforeEach(() => {
  registerSiteContentProvider(createSiteContentProvider(content, registry));
  installForms();
  registerDeckContentProvider({ resolveCardNumber: (id) => cards.find((c) => c.id === id)?.cardNumber ?? null, resolveDreamsign: sign });
});
afterEach(clearGameProviders);

describe("journeyShop stock contracts", () => {
  it.each(["Shop", "DreamsignBazaar"] as const)("uses injected physical source counts for %s initial and fresh stock", (type) => {
    for (const enhanced of [false, true]) for (const held of [[], [OTHER], [ORB], [ORB, ORB]]) {
      const before = fixture(type, held, enhanced), saved = structuredClone(before), result = open(before);
      const base = type === "DreamsignBazaar" ? 3 : enhanced ? 4 : 2;
      const extra = held.filter((id) => id === ORB).length * 3;
      expect(result.outcome).toBe("applied"); expect(runtime(result.state).slots).toHaveLength(base + extra);
      expect(runtime(result.state).slots.every((slot) => slot.itemType === (type === "Shop" ? "card" : "dreamsign"))).toBe(true);
      const logs = result.logRecords ?? [];
      expect(logs).toHaveLength(extra / 3);
      expect(logs.map((row) => row.fields.heldIndex)).toEqual(held.flatMap((id, i) => id === ORB ? [i] : []));
      if (extra > 0) expect(logs[logs.length - 1]?.fields.after).toMatchObject({ additionalOptions: extra, offeredOptions: base + extra });
      const rerolled = apply(result.state, "REROLL_SHOP");
      expect(runtime(rerolled.state).slots).toHaveLength(base + extra);
      expect(runtime(rerolled.state).rerollCount).toBe(1);
      expect(before).toEqual(saved);
      if (type === "DreamsignBazaar") expect(result.state.journey.remainingDreamsignPool).toHaveLength(templates.length - base - extra);
      else {
        // Initial SiteOpenResult omits draftState; Restock returns and persists the spent clone.
        expect(result.state.journey.draftState).toEqual(before.journey.draftState);
        expect(Object.values(rerolled.state.journey.draftState!.remainingCopiesByCard).reduce((a, b) => a + b, 0)).toBe(60 - base - extra);
      }
    }
  });
  it("keeps prepared shelves through source changes and quotes the next successful Restock live", () => {
    const prepared = open(fixture()).state, old = structuredClone(runtime(prepared));
    const lost = apply(prepared, "REMOVE_DREAMSIGN", { dreamsignId: ORB }).state;
    expect(runtime(lost)).toEqual(old); expect(open(lost).state).toBe(lost);
    expect(runtime(apply(lost, "REROLL_SHOP").state).slots).toHaveLength(2);
    const ordinary = open(fixture("Shop", [])).state;
    const gained = apply(ordinary, "ADD_DREAMSIGN", { dreamsignId: ORB }).state;
    expect(runtime(gained)).toEqual(runtime(ordinary));
    expect(runtime(apply(gained, "REROLL_SHOP").state).slots).toHaveLength(5);
    expect(apply(prepared, "SET_ESSENCE", { value: 0 }).logRecords).toBeUndefined();
  });
  it("preserves the other stock category and rejects unsafe descriptor arithmetic", () => {
    const source = fixture().journey;
    expect(shopStockCounts(source, makeSite("Shop"), { cardCount: 1, dreamsignCount: 2 }, registry)).toEqual({ cardCount: 4, dreamsignCount: 2 });
    expect(shopStockCounts(source, makeSite("DreamsignBazaar"), { cardCount: 1, dreamsignCount: 2 }, registry)).toEqual({ cardCount: 1, dreamsignCount: 5 });
    expect(() => shopStockCounts(source, makeSite("Shop"), { cardCount: Number.MAX_SAFE_INTEGER, dreamsignCount: 0 }, registry)).toThrow(RangeError);
    for (const amount of [-1, 0, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) expect(() => journeyShop(ORB, { kind: "additionalOptions", amount })).toThrow(RangeError);
    expect(() => journeyShop(ORB, { kind: "unknown" } as unknown as JourneyShopEffect)).toThrow(RangeError);
  });
  it("records short available supply without fabricating missing choices", () => {
    const before = fixture("DreamsignBazaar"); before.journey.remainingDreamsignPool = [templates[0].id];
    const out = open(before);
    expect(runtime(out.state).slots).toHaveLength(1);
    expect(out.logRecords?.[0].fields.after).toMatchObject({ additionalOptions: 3, offeredOptions: 1 });
  });
});

describe("journeyShop successful Restock ordering", () => {
  it.each(["Shop", "DreamsignBazaar"] as const)("uses one site ordinal with global token priority at %s", (type) => {
    const opened = open(fixture(type, [COIN, COIN])).state; opened.journey.essence = 0;
    const first = apply(opened, "REROLL_SHOP");
    expect(first.outcome).toBe("applied"); expect(first.state.journey.essence).toBe(0);
    expect(first.logRecords).toHaveLength(1); expect(first.logRecords?.[0].fields.heldIndex).toBe(0);
    expect(runtime(first.state).rerollCount).toBe(1);
    expect(apply(first.state, "REROLL_SHOP").state).toBe(first.state);
    const funded = { ...first.state, journey: { ...first.state.journey, essence: 30 } };
    const second = apply(funded, "REROLL_SHOP"); expect(second.state.journey.essence).toBe(17);
    expect(second.logRecords).toBeUndefined();
    const tokenBase = open(fixture(type, [COIN])).state;
    const tokens = { ...tokenBase, journey: { ...tokenBase.journey, shopModifiers: { ...tokenBase.journey.shopModifiers, freeRerolls: 1 } } };
    const spent = apply(tokens, "REROLL_SHOP");
    expect(spent.state.journey.shopModifiers.freeRerolls).toBe(0); expect(spent.state.journey.essence).toBe(100);
    expect(spent.logRecords).toBeUndefined();
    expect(apply(spent.state, "REROLL_SHOP").state.journey.essence).toBe(87);
  });
  it("does not reset after source loss/reacquisition, and independent sites start at zero", () => {
    const first = apply(open(fixture("Shop", [COIN])).state, "REROLL_SHOP").state;
    const lost = apply(first, "REMOVE_DREAMSIGN", { dreamsignId: COIN }).state;
    const gained = apply(lost, "ADD_DREAMSIGN", { dreamsignId: COIN }).state;
    expect(apply(gained, "REROLL_SHOP").state.journey.essence).toBe(87);
    const site2 = parseSiteId("site-2"), next = structuredClone(gained);
    Object.values(next.journey.atlas.nodes)[0].sites.push({ ...makeSite("Shop"), id: site2 });
    expect(apply(next, "OPEN_SITE", { siteId: site2, selectionRulesVersion: SELECTION_RULES_VERSION }).outcome).toBe("applied");
    const second = apply(next, "OPEN_SITE", { siteId: site2, selectionRulesVersion: SELECTION_RULES_VERSION }).state;
    expect(apply(second, "REROLL_SHOP", { siteId: site2 }).state.journey.essence).toBe(100);
  });
  it("keeps the authored limit and failed redraws transactional", () => {
    const before = open(fixture("Shop", [COIN])).state, saved = structuredClone(before);
    const provider = createSiteContentProvider(content, registry);
    registerSiteContentProvider({ ...provider, rerollShop: () => null });
    expect(apply(before, "REROLL_SHOP").state).toBe(before); expect(before).toEqual(saved);
    registerSiteContentProvider(provider);
    const limit = structuredClone(before); runtime(limit).rerollCount = 3;
    expect(apply(limit, "REROLL_SHOP").state).toBe(limit);
    registerSiteContentProvider(null); expect(apply(before, "REROLL_SHOP").state).toBe(before);
  });
});

describe("journeyShop purchased physical cards", () => {
  it.each(["alice", "bob"])("settles one legal form before gain observers and retains financial identity, actor=%s", (actor) => {
    const before = shopState([cardSlot({ cardNumber: 1, basePrice: 17, discountPercent: 0 })], { essence: 40, dreamsigns: [SHARD, SHARD].map(sign) });
    const rng = vi.fn(() => .75), out = apply(before, "BUY_SHOP_SLOT", { slotIndex: 0 }, { rng }, registry, actor);
    expect(out.outcome).toBe("applied"); expect(out.state.journey.essence).toBe(23);
    const entry = out.state.journey.deck[out.state.journey.deck.length - 1];
    expect(entry).toMatchObject({ cardNumber: 1, transfiguration: "Empowered", isBane: false });
    const receipt = runtime(out.state).purchaseHistory[0];
    expect(receipt.item).toMatchObject({ kind: "card", gainedEntryId: entry.entryId, journeyShopTransfiguration: {
      dreamsignId: SHARD, heldIndex: 0, entryId: entry.entryId, cardId: cards[0].id, before: null,
      type: "Empowered", applicableForms: ["Kindled", "Empowered"], drawIndex: 0,
    } });
    expect(receipt).toMatchObject({ pricePaid: 17, essenceBefore: 40, essenceAfter: 23 });
    expect(rng).toHaveBeenCalledExactlyOnceWith(0);
    expect(out.logRecords?.[0].fields.target).toMatchObject({ transfigurations: [{ entryId: entry.entryId, type: "Empowered", drawIndex: 0 }] });
    expect(apply(out.state, "BUY_SHOP_SLOT", { slotIndex: 0 }).state).toBe(out.state);
    expect(before.journey.deck).toHaveLength(0); expect(runtime(before).slots[0].purchased).toBe(false);
  });
  it("preserves prepared forms and empty eligible sets without drawing, with enhanced Shop positive and Bazaar negative controls", () => {
    for (const [cardNumber, transfiguration] of [[1, "Kindled"], [30, undefined]] as const) {
      const before = shopState([cardSlot({ cardNumber, ...(transfiguration === undefined ? {} : { transfiguration }) })], { essence: 200, dreamsigns: [SHARD].map(sign) });
      const rng = vi.fn(() => 0), out = apply(before, "BUY_SHOP_SLOT", { slotIndex: 0 }, { rng });
      expect(out.outcome).toBe("applied"); expect(out.state.journey.deck[0].transfiguration).toBe(transfiguration ?? null);
      expect(rng).not.toHaveBeenCalled(); expect(out.logRecords).toBeUndefined();
    }
    const enhanced = shopState([cardSlot()], { essence: 200, dreamsigns: [SHARD].map(sign) }); Object.values(enhanced.journey.atlas.nodes)[0].sites[0].isEnhanced = true;
    expect(apply(enhanced, "BUY_SHOP_SLOT", { slotIndex: 0 }).state.journey.deck[0].transfiguration).toBe("Kindled");
    const bazaar = shopState([cardSlot()], { essence: 200, dreamsigns: [SHARD].map(sign) }, "DreamsignBazaar");
    expect(apply(bazaar, "BUY_SHOP_SLOT", { slotIndex: 0 }).state.journey.deck[0].transfiguration).toBeNull();
    const signWare = shopState([{ itemType: "dreamsign", dreamsign: sign(OTHER), basePrice: 2, discountPercent: 0, purchased: false }], { essence: 200, dreamsigns: [SHARD].map(sign) }, "DreamsignBazaar");
    const rng = vi.fn(() => 0), bought = apply(signWare, "BUY_SHOP_SLOT", { slotIndex: 0 }, { rng });
    expect(bought.state.journey.dreamsigns.map((s) => s.id)).toEqual([SHARD, OTHER]); expect(rng).not.toHaveBeenCalled();
  });
  it.each([[SHARD, CRYSTAL, TOME, WARRIOR], [TOME, WARRIOR, CRYSTAL, SHARD]])("exposes the preformed gain to existing observers without a new transformation occurrence, held=%j", (...held) => {
    const use = createJourneyModifierRegistry([
      journeyShop(SHARD, { kind: "purchasedCardTransfiguration" }),
      journeyDeckEntry(CRYSTAL, { kind: "randomTransfiguration", minimumDeckSize: 0 }),
      journeyDeckEntry(WARRIOR, { kind: "warriorSpark", amount: 4 }),
      journeyTransfiguration(TOME, { kind: "copyTransfiguredEvent" }),
    ]);
    registerJourneyTransfigurationProvider({ resolve: (e) => ({ cardId: cards[0].id, cardType: "Event", subtype: EVENT_CARD_SUBTYPE, forms: e.transfiguration === null ? ["Inspired", "Enduring"] : [] }) });
    const before = shopState([cardSlot()], { essence: 200, dreamsigns: held.map(sign) });
    const rng = vi.fn(() => .9), out = apply(before, "BUY_SHOP_SLOT", { slotIndex: 0 }, { rng }, use);
    expect(out.state.journey.deck).toHaveLength(1); expect(out.state.journey.deck[0].transfiguration).toBe("Enduring");
    expect(out.state.journey.deck[0].sparkBonus).toBeUndefined(); expect(rng).toHaveBeenCalledTimes(1);
    expect(out.logRecords).toHaveLength(1); expect(out.logRecords?.[0].fields.dreamsignId).toBe(SHARD);
  });
  it("keeps queued free-purchase consumption and distinct physical copies of one card", () => {
    const base = shopState([cardSlot(), cardSlot()], { essence: 0, dreamsigns: [SHARD].map(sign) });
    const before = { ...base, journey: { ...base.journey, shopModifiers: { ...base.journey.shopModifiers, essenceDiscountPercent: 100, freePurchaseModifiers: [{ kind: "free-purchases" as const, initialCount: 2, remainingCount: 2, sourceSiteId: SITE_ID, sourceActionId: testExplorationActionId("free-counter") }] } } };
    const first = apply(before, "BUY_SHOP_SLOT", { slotIndex: 0 }).state;
    const second = apply(first, "BUY_SHOP_SLOT", { slotIndex: 1 }).state;
    expect(second.journey.shopModifiers.freePurchaseModifiers).toEqual([]);
    expect(runtime(second).purchaseHistory.map((r) => r.freePurchaseModifier?.remainingAfter)).toEqual([1, 0]);
    expect(second.journey.deck).toHaveLength(2); expect(new Set(second.journey.deck.map((e) => e.entryId)).size).toBe(2);
    expect(second.journey.deck.every((e) => e.transfiguration === "Kindled")).toBe(true);
    expect(runtime(second).purchaseHistory.map((r) => r.item.kind === "card" && r.item.gainedEntryId)).toEqual(second.journey.deck.map((e) => e.entryId));
  });
  it("refuses unavailable content, contains invalid RNG and preserves the original input", () => {
    const before = shopState([cardSlot()], { essence: 200, dreamsigns: [SHARD].map(sign) }), saved = structuredClone(before);
    registerJourneyTransfigurationProvider(null); expect(apply(before, "BUY_SHOP_SLOT", { slotIndex: 0 }).state).toBe(before);
    installForms();
    for (const value of [NaN, Infinity, -.1, 1]) expect(() => apply(before, "BUY_SHOP_SLOT", { slotIndex: 0 }, { rng: () => value })).toThrow(RangeError);
    expect(before).toEqual(saved);
    const rng = vi.fn(() => 0);
    for (const payload of [{ slotIndex: -1 }, { slotIndex: .5 }, { slotIndex: 99 }, { slotIndex: 0, siteId: "missing" }]) expect(apply(before, "BUY_SHOP_SLOT", payload, { rng }).state).toBe(before);
    expect(rng).not.toHaveBeenCalled();
    const poor = { ...before, journey: { ...before.journey, essence: 0 } };
    expect(apply(poor, "BUY_SHOP_SLOT", { slotIndex: 0 }, { rng }).state).toBe(poor); expect(rng).not.toHaveBeenCalled();
  });
});

describe("journeyShop fold failure, cold continuation and concurrent intents", () => {
  const config = (state: FoldState, use = registry) => ({ ...GAME_ENGINE_CONFIG, genesisState: () => state,
    reducer: (s: FoldState, e: GameEvent, c: EventContext) => reduceGameEvent(s, e, c, use) });
  const fold = (before: FoldState, events: { seq: number; event: GameEvent }[], use = registry) => foldEvents(config(before, use), GENESIS, { state: before, seq: 0 }, events, { devMode: false });
  it("contains stock provider failure, then recovers without spending the failed first Restock", () => {
    const before = open(fixture("Shop", [COIN])).state, saved = structuredClone(before);
    const provider = createSiteContentProvider(content, registry);
    registerSiteContentProvider({ ...provider, rerollShop: () => { throw new Error("synthetic stock failure"); } });
    const attempt = { seq: 1, event: event("REROLL_SHOP", { siteId: SITE_ID }) };
    const failed = fold(before, [attempt]);
    expect(failed.state).toEqual(saved); expect(failed.outcomes[0]).toMatchObject({ outcome: "bounced", bounceReason: "fold_error" });
    expect(failed.outcomes[0].logRecords).toBeUndefined();
    registerSiteContentProvider(provider);
    const recovered = fold(failed.state, [{ ...attempt, seq: 2 }]);
    expect(runtime(recovered.state).rerollCount).toBe(1); expect(recovered.state.journey.essence).toBe(saved.journey.essence);
  });
  it("rolls back a complete local purchase when a later real hook throws, retaining its ordinary successful diagnostic prefix on recovery", () => {
    const FAIL = testDreamsignId("late-failure"), before = shopState([cardSlot()], { essence: 200, dreamsigns: [SHARD, FAIL].map(sign) });
    let fail = true, observed: FoldState["journey"] | null = null;
    const hook: JourneyModifierDefinition = { dreamsignId: FAIL, afterJourneyEvent: ({ journey }) => { observed = journey; if (fail) throw new Error("synthetic post-domain failure"); return null; } };
    const use = createJourneyModifierRegistry([journeyShop(SHARD, { kind: "purchasedCardTransfiguration" }), hook]);
    const saved = structuredClone(before), attempt = { seq: 1, event: event("BUY_SHOP_SLOT", { siteId: SITE_ID, slotIndex: 0 }) };
    const failed = fold(before, [attempt], use);
    expect(observed!.essence).toBe(100); expect(observed!.deck[0].transfiguration).not.toBeNull();
    expect(observed!.siteRuntime[SITE_ID]).toMatchObject({ purchaseHistory: [{ pricePaid: 100 }], slots: [{ purchased: true }] });
    expect(failed.state).toEqual(saved); expect(failed.outcomes[0].bounceReason).toBe("fold_error"); expect(failed.outcomes[0].logRecords).toBeUndefined();
    fail = false;
    const recovered = fold(before, [attempt], use);
    expect(recovered.state.journey.deck).toHaveLength(1); expect(runtime(recovered.state).purchaseHistory).toHaveLength(1);
    expect(recovered.outcomes[0].logRecords?.[0].fields.dreamsignId).toBe(SHARD); expect(before).toEqual(saved);
  });
  it("continues exact accepted inputs from serialized shelves and purchase history and matches complete log replay", () => {
    const before = fixture("Shop", [ORB, COIN, SHARD]); before.journey.essence = 500;
    const intents = [event("OPEN_SITE", { siteId: SITE_ID, selectionRulesVersion: SELECTION_RULES_VERSION }),
      event("BUY_SHOP_SLOT", { siteId: SITE_ID, slotIndex: 0 }), event("REROLL_SHOP", { siteId: SITE_ID }), event("BUY_SHOP_SLOT", { siteId: SITE_ID, slotIndex: 0 })];
    const events = intents.map((e, i) => ({ seq: i + 1, event: { ...e, basedOnSeq: i } }));
    const all = fold(before, events);
    expect(all.outcomes.every((o) => o.outcome === "applied")).toBe(true);
    for (let prefix = 1; prefix < events.length; prefix++) {
      const partial = fold(before, events.slice(0, prefix));
      const loaded = GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(partial.state));
      const continued = foldEvents(config(before), GENESIS, { state: loaded, seq: prefix }, events.slice(prefix), { devMode: false });
      expect(continued.state).toEqual(all.state); expect(continued.outcomes).toEqual(all.outcomes.slice(prefix));
    }
    expect(GAME_ENGINE_CONFIG.hash(fold(before, events).state)).toBe(GAME_ENGINE_CONFIG.hash(all.state));
  });
  it.each(["BUY_SHOP_SLOT", "REROLL_SHOP"] as const)("commits only the first partner intent from a shared head for %s", (type) => {
    const before = open(fixture("Shop", [COIN, SHARD])).state;
    const first = event(type, { siteId: SITE_ID, slotIndex: 0 }, "alice"), second = event(type, { siteId: SITE_ID, slotIndex: 0 }, "bob");
    const out = fold(before, [{ seq: 1, event: first }, { seq: 2, event: second }]);
    expect(out.outcomes.map((o) => o.outcome)).toEqual(["applied", "bounced"]);
    expect(out.outcomes[1].bounceReason).toBe("partner_conflict");
    expect(out.state).toEqual(fold(before, [{ seq: 1, event: first }]).state);
  });
  it("does not generate a second stock shelf for a concurrent exempt open", () => {
    const provider = createSiteContentProvider(content, registry), generate = vi.fn(provider.openSite.bind(provider));
    registerSiteContentProvider({ ...provider, openSite: generate });
    const before = fixture(), a = event("OPEN_SITE", { siteId: SITE_ID, selectionRulesVersion: SELECTION_RULES_VERSION });
    const out = fold(before, [{ seq: 1, event: a }, { seq: 2, event: { ...a, actor: event("OPEN_SITE", {}, "bob").actor } }]);
    expect(out.outcomes.map((o) => o.outcome)).toEqual(["applied", "bounced"]); expect(generate).toHaveBeenCalledTimes(1);
  });
});
