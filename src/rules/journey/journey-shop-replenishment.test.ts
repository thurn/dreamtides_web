import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { foldEvents } from "../../eventlog/fold";
import { decodeEvent, encodeEvent } from "../../eventlog/wire";
import type { DraftState } from "../../types/draft";
import type { EventContext, GameEvent } from "../../eventlog/types";
import { parseCardSubtype } from "../../types/card-identity";
import { testCardId, testDreamsignId, testExplorationActionId } from "../../types/test-identities";
import { parseDeckEntryId, type DreamsignId } from "../../types/identifiers";
import type { RuntimeShopSlot, ShopSiteRuntime } from "../../types/journey";
import { clearGameProviders } from "../../session/providers/register-game-providers";
import { buildShopPurchaseLogs } from "../../screens/cumulus_adapters/shop-purchase-logging-view-model";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import type { FoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import { createJourneyModifierRegistry, type JourneyModifierDefinition } from "./modifier-registry";
import { journeyShop } from "./journey-shop";
import { journeyOnGain } from "./journey-on-gain";
import { journeyDeckEntry } from "./journey-deck-entry";
import { journeyDuplication } from "./journey-duplication";
import { registerJourneyTransfigurationProvider } from "./journey-transfiguration";
import { registerSiteContentProvider, type ShopSlotReplacementResult } from "./sites";
import { registerDeckContentProvider } from "./deck";
import { testSiteContentProvider } from "./test-content-providers";
import { cardSlot, dreamsignSlot, shopState, shopModifiers, SITE_ID, ctx } from "./shop-fixtures";
import { event, GENESIS } from "./lifecycle-fixtures";

const SOURCE = testDreamsignId("refill-source"), OTHER = testDreamsignId("refill-other"), WARE = testDreamsignId("ware");
const FORM = testDreamsignId("purchase-form"), GAIN = testDreamsignId("acquired-form"), COPY = testDreamsignId("purchase-copy");
const sign = (id: DreamsignId) => ({ id, name: "Same synthetic name", effectDescription: "" });
const definition = (id = SOURCE) => journeyShop(id, { kind: "replacePurchasedItem" });
const registry = createJourneyModifierRegistry([definition(), definition(OTHER)]);
const runtime = (state: FoldState) => state.journey.siteRuntime[SITE_ID] as ShopSiteRuntime;
const rev = (state: FoldState) => ({ purchaseCount: runtime(state).purchaseHistory.length, rerollCount: runtime(state).rerollCount });
const identity = (slot: RuntimeShopSlot) => slot.itemType === "card"
  ? { kind: "card" as const, cardId: testCardId(`refill-${slot.cardNumber}`), cardNumber: slot.cardNumber, transfiguration: slot.transfiguration ?? null }
  : { kind: "dreamsign" as const, dreamsignId: slot.dreamsign.id };
const draft = (): DraftState => ({ mode: "tides4", draftPoolCopiesByCard: { 7: 2 }, remainingCopiesByCard: { 7: 2 },
  currentOffer: [], activeSiteId: null, sitePicksCompleted: 0, pickNumber: 1 });
const fullDraft = (): DraftState => ({ ...draft(), currentOffer: [7, 8], currentOfferCount: 2, activeSiteId: SITE_ID,
  siteShownCardNumbers: [7, 8], currentOfferTransfigurations: { 7: "Kindled", 8: "Inspired" },
  transfiguredOfferSource: { siteId: SITE_ID, actionId: testExplorationActionId("draft-bound") }, openingDraftOffers: { 1: [7, 8] } });
const supply = (state: DraftState | null) => state === null ? { mode: null } : { mode: state.mode,
  distinctRemaining: Object.values(state.remainingCopiesByCard).filter((n) => n > 0).length,
  copiesRemaining: Object.values(state.remainingCopiesByCard).reduce((sum, n) => sum + n, 0) };
function result(journey: FoldState["journey"], purchased: RuntimeShopSlot, slot: RuntimeShopSlot | null): ShopSlotReplacementResult {
  return { slot, purchasedItem: identity(purchased), replacementItem: slot === null ? null : identity(slot),
    remainingDreamsignPoolIds: [WARE], remainingDreamsignPool: [WARE], draftState: journey.draftState,
    draftSupplyBefore: supply(journey.draftState), draftSupplyAfter: supply(journey.draftState) };
}
function provider(slot?: RuntimeShopSlot | null) {
  return testSiteContentProvider({ replacePurchasedShopSlot: ({ journey, site, purchasedSlot, random }) => {
    random(); return result(journey, purchasedSlot, slot === undefined ? site.type === "Shop" ? cardSlot({ basePrice: 7 }) : dreamsignSlot("ware", { basePrice: 7 }) : slot);
  }, rerollShop: ({ journey }) => ({ slots: [cardSlot({ basePrice: 7 })], remainingDreamsignPoolIds: [], remainingDreamsignPool: [], draftState: journey.draftState }) });
}
function fixture(category: "Shop" | "DreamsignBazaar" = "Shop", held = [SOURCE]) {
  return shopState(category === "Shop" ? [cardSlot({ basePrice: 11 }), cardSlot({ basePrice: 13 })]
    : [dreamsignSlot("ware", { basePrice: 11 }), dreamsignSlot("other-ware", { basePrice: 13 })],
  { essence: 1000, dreamsigns: held.map(sign), draftState: draft() }, category);
}
const buy = (state: FoldState, payload = {}, use = registry, context: Partial<EventContext> = {}) =>
  reduceGameEvent(state, event("BUY_SHOP_SLOT", { siteId: SITE_ID, slotIndex: 0, expectedOffer: rev(state), ...payload }), ctx(context), use);
const config = (initial: FoldState, use = registry) => ({ ...GAME_ENGINE_CONFIG, genesisState: () => initial,
  reducer: (state: FoldState, e: GameEvent, context: EventContext) => reduceGameEvent(state, e, context, use) });
const fold = (initial: FoldState, events: { seq: number; event: GameEvent }[], use = registry) =>
  foldEvents(config(initial, use), { ...GENESIS, seed: initial.journey.seed }, { state: initial, seq: 0 }, events, { devMode: false });
beforeEach(() => {
  registerSiteContentProvider(provider());
  registerDeckContentProvider({ resolveCardNumber: () => 7, resolveDreamsign: sign });
  registerJourneyTransfigurationProvider({ resolve: (entry) => ({ cardId: testCardId(`refill-${entry.cardNumber}`), cardType: "Event", subtype: parseCardSubtype("Event"), forms: entry.transfiguration === null ? ["Kindled", "Inspired"] : [] }) });
});
afterEach(clearGameProviders);

describe("purchase-bound shop vacancy replacement", () => {
  it.each(["Shop", "DreamsignBazaar"] as const)("replaces only the purchased position in normal/enhanced %s", (category) => {
    for (const enhanced of [false, true]) {
      const initial = fixture(category, [SOURCE, OTHER, SOURCE]);
      Object.values(initial.journey.atlas.nodes)[0].sites[0].isEnhanced = enhanced;
      const snapshot = structuredClone(initial), rng = vi.fn<EventContext["rng"]>(() => .25), out = buy(initial, {}, registry, { rng });
      expect(out.outcome).toBe("applied"); expect(initial).toEqual(snapshot);
      expect(runtime(out.state).slots[0]).toMatchObject({ purchased: false, basePrice: 7 });
      expect(runtime(out.state).slots[1]).toEqual(runtime(initial).slots[1]);
      expect(runtime(out.state).rerollCount).toBe(0); expect(out.state.journey.shopModifiers).toEqual(initial.journey.shopModifiers);
      expect(runtime(out.state).purchaseHistory).toHaveLength(1); expect(out.state.journey.essence).toBe(989);
      expect(runtime(out.state).purchaseHistory[0]).toMatchObject({ expectedOffer: { purchaseCount: 0, rerollCount: 0 },
        slotReplacement: { dreamsignId: SOURCE, heldIndex: 0, revisionAfter: { purchaseCount: 1, rerollCount: 0 }, drawIndices: [0] } });
      expect(out.logRecords).toHaveLength(1); expect(out.logRecords?.[0].fields).toMatchObject({ dreamsignId: SOURCE, heldIndex: 0,
        target: { shopReplacements: [{ purchased: identity(runtime(initial).slots[0]), replacement: { item: identity(runtime(out.state).slots[0]) } }] } });
      expect(rng).toHaveBeenCalledExactlyOnceWith(0);
      expect(category === "Shop" ? out.state.journey.deck.length : out.state.journey.dreamsigns.length).toBe(category === "Shop" ? 1 : 4);
      const second = buy(out.state, {}, registry, { seq: 43 });
      expect(runtime(second.state).purchaseHistory).toHaveLength(2); expect(second.state.journey.essence).toBe(982);
    }
  });
  it("consumes one FIFO free purchase but no Restock charge", () => {
    const base = fixture(); const initial = { ...base, journey: { ...base.journey, shopModifiers: shopModifiers({ freeRerolls: 3,
      freePurchaseModifiers: [{ kind: "free-purchases", sourceSiteId: SITE_ID, sourceActionId: testExplorationActionId("free"), initialCount: 2, remainingCount: 2 }] }) } };
    const out = buy(initial);
    expect(out.state.journey.essence).toBe(1000); expect(out.state.journey.shopModifiers.freeRerolls).toBe(3);
    expect(out.state.journey.shopModifiers.freePurchaseModifiers[0].remainingCount).toBe(1);
    expect(runtime(out.state).purchaseHistory[0].freePurchaseModifier?.remainingAfter).toBe(1);
  });
  it("gains the source before reacting, while losing it removes the reaction", () => {
    const gained = fixture("DreamsignBazaar", []); runtime(gained).slots[0] = dreamsignSlot("refill-source", { basePrice: 11 });
    const missing = buy(gained, { expectedOffer: undefined }); expect(missing.state).toBe(gained);
    expect(runtime(buy(gained).state).purchaseHistory[0].slotReplacement?.dreamsignId).toBe(SOURCE);
    const lost = fixture("DreamsignBazaar"); lost.journey.maxDreamsigns = 1;
    const out = buy(lost, { purgeIndex: 0, expectedOffer: undefined });
    expect(out.outcome).toBe("applied"); expect(runtime(out.state).slots[0].purchased).toBe(true);
    expect(runtime(out.state).purchaseHistory[0].slotReplacement).toBeUndefined();
  });
  it("uses frozen post-domain sources across earlier hook holdings changes", () => {
    const early = testDreamsignId("early-hook");
    for (const adding of [false, true]) {
      const mutation: JourneyModifierDefinition = { dreamsignId: early, afterJourneyEvent: ({ journey }) => ({
        journey: { ...journey, dreamsigns: adding ? [...journey.dreamsigns, sign(SOURCE)] : journey.dreamsigns.filter(({ id }) => id !== SOURCE) }, before: {}, after: {} }) };
      const use = createJourneyModifierRegistry([mutation, definition()]);
      const initial = fixture("Shop", adding ? [early] : [early, SOURCE]);
      const out = buy(initial, {}, use);
      expect(runtime(out.state).purchaseHistory[0].slotReplacement?.heldIndex).toBe(adding ? undefined : 1);
    }
  });
  it("records exhausted supply once with an unavailable purchased position", () => {
    const exhausted = { ...draft(), draftPoolCopiesByCard: {}, remainingCopiesByCard: {} };
    registerSiteContentProvider(testSiteContentProvider({ replacePurchasedShopSlot: ({ journey, purchasedSlot }) => ({
      ...result(journey, purchasedSlot, null), draftState: exhausted, draftSupplyAfter: supply(exhausted),
    }) })); const base = fixture(), initial = { ...base, journey: { ...base.journey, draftState: exhausted } }, out = buy(initial);
    expect(out.outcome).toBe("applied"); expect(out.state.journey.essence).toBe(989);
    expect(runtime(out.state).slots[0].purchased).toBe(true);
    expect(runtime(out.state).purchaseHistory[0].slotReplacement?.replacement).toBeNull();
    expect(out.state.journey.draftState).toEqual(exhausted); expect(initial.journey.draftState).toEqual(exhausted);
    expect(out.logRecords).toHaveLength(1); expect(runtime(out.state).slots[1]).toEqual(runtime(initial).slots[1]);
  });
});

describe("captured offer refusal and compatibility", () => {
  it("rejects stale repeated UUID buys and source-loss absent revisions before randomness", () => {
    const initial = fixture(), first = buy(initial).state, rng = vi.fn(() => 0);
    const stale = buy(first, { expectedOffer: rev(initial) }, registry, { rng });
    expect(stale.state).toBe(first); expect(rng).not.toHaveBeenCalled();
    const lost = { ...first, journey: { ...first.journey, dreamsigns: [] } };
    expect(buy(lost, { expectedOffer: undefined }, registry, { rng }).state).toBe(lost);
    expect(buy(lost, {}, registry, { rng }).outcome).toBe("applied"); expect(rng).not.toHaveBeenCalled();
  });
  it("rejects an old pending revision after Restock without resetting purchase history", () => {
    const initial = fixture(), first = buy(initial).state;
    const restocked = reduceGameEvent(first, event("REROLL_SHOP", { siteId: SITE_ID }), ctx(), registry).state;
    expect(runtime(restocked).purchaseHistory).toEqual(runtime(first).purchaseHistory);
    const rng = vi.fn(() => 0);
    expect(buy(restocked, { expectedOffer: rev(first) }, registry, { rng }).state).toBe(restocked);
    expect(rng).not.toHaveBeenCalled(); expect(buy(restocked).outcome).toBe("applied");
  });
  it("refuses malformed, wrong-screen, poor and invalid-cap inputs without payment or provider calls", () => {
    const initial = fixture(), rng = vi.fn(() => 0), saved = structuredClone(initial);
    for (const expectedOffer of [null, [], "bad", {}, { purchaseCount: -1, rerollCount: 0 }, { purchaseCount: 0, rerollCount: .5 }, { purchaseCount: 0, rerollCount: 0, extra: 1 }]) {
      expect(buy(initial, { expectedOffer }, registry, { rng }).state).toBe(initial);
    }
    for (const payload of [{ slotIndex: -1 }, { slotIndex: 20 }, { purgeIndex: "bad" }, { siteId: "missing" }]) expect(buy(initial, payload, registry, { rng }).state).toBe(initial);
    const wrong = { ...initial, journey: { ...initial.journey, screen: { type: "dreamscape" as const } } };
    expect(buy(wrong, {}, registry, { rng }).state).toBe(wrong);
    const poor = { ...initial, journey: { ...initial.journey, essence: 0 } }; expect(buy(poor, {}, registry, { rng }).state).toBe(poor);
    const capped = fixture("DreamsignBazaar"); capped.journey.maxDreamsigns = 1;
    expect(buy(capped, {}, registry, { rng }).state).toBe(capped); expect(buy(capped, { purgeIndex: 2 }, registry, { rng }).state).toBe(capped);
    expect(initial).toEqual(saved); expect(rng).not.toHaveBeenCalled();
    // Cancelling the local pending overlay submits no event; this is the saved boundary.
    expect(runtime(initial).purchaseHistory).toEqual([]);
  });
  it("preserves ordinary absent-field legacy bytes and accepts the explicit callback field", () => {
    const legacy = fixture("Shop", []), out = buy(legacy, { expectedOffer: undefined });
    expect(out.outcome).toBe("applied"); expect(runtime(out.state).purchaseHistory[0].expectedOffer).toBeUndefined();
    const receipt = runtime(buy(legacy).state).purchaseHistory[0];
    expect(buildShopPurchaseLogs([receipt], new Map())[0]).toMatchObject({ expectedOffer: { purchaseCount: 0, rerollCount: 0 }, chargedPrice: 11 });
    expect(buildShopPurchaseLogs(runtime(out.state).purchaseHistory, new Map())[0]).not.toHaveProperty("expectedOffer");
    expect(GAME_ENGINE_CONFIG.encode(GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(out.state)))).toBe(GAME_ENGINE_CONFIG.encode(out.state));
  });
});

describe("composition and atomic persisted purchase", () => {
  it("continues domain form and acquired-form draw indices before refill", () => {
    const use = createJourneyModifierRegistry([definition(), journeyOnGain(GAIN, { kind: "randomTransfigurationOnGain", numerator: 1, denominator: 1 })]);
    const initial = fixture("DreamsignBazaar"); runtime(initial).slots[0] = dreamsignSlot("acquired-form", { basePrice: 11 });
    initial.journey.deck = [{ entryId: parseDeckEntryId("deck-old"), cardNumber: 7, transfiguration: null, isBane: false }];
    const rng = vi.fn<EventContext["rng"]>(() => .25), out = buy(initial, {}, use, { rng });
    expect(out.state.journey.deck[0].transfiguration).toBe("Kindled");
    expect(runtime(out.state).purchaseHistory[0].slotReplacement?.drawIndices).toEqual([2]);
    expect(rng.mock.calls.map(([index]) => index)).toEqual([0, 1, 2]);
    const forms = createJourneyModifierRegistry([journeyShop(FORM, { kind: "purchasedCardTransfiguration" }), definition(),
      journeyDeckEntry(GAIN, { kind: "randomTransfiguration", minimumDeckSize: 1 }), journeyDuplication(COPY, { kind: "firstCardPurchaseDuplication" })]);
    const card = fixture("Shop", [FORM, SOURCE, GAIN, COPY]), draws = vi.fn<EventContext["rng"]>(() => .25), bought = buy(card, {}, forms, { rng: draws });
    expect(bought.state.journey.deck).toHaveLength(2); expect(bought.state.journey.deck.every((entry) => entry.transfiguration === "Kindled")).toBe(true);
    expect(runtime(bought.state).purchaseHistory[0].slotReplacement?.drawIndices).toEqual([1]);
    expect(draws.mock.calls.map(([index]) => index)).toEqual([0, 1]);
  });
  it("preserves an acquired choice while replenishing without phantom gains", () => {
    const choice = testDreamsignId("copy-choice"), use = createJourneyModifierRegistry([definition(), journeyOnGain(choice, { kind: "copyOwnedDreamsignOnGain" })]);
    const initial = fixture("DreamsignBazaar"); runtime(initial).slots[0] = dreamsignSlot("copy-choice", { basePrice: 11 });
    const out = buy(initial, {}, use);
    expect(out.state.journey.screen.type).toBe("journeyDreamsign"); expect(out.state.journey.dreamsigns).toHaveLength(2);
    expect(runtime(out.state).purchaseHistory).toHaveLength(1); expect(runtime(out.state).purchaseHistory[0].slotReplacement).toBeDefined();
  });
  it("rolls back missing, refused, malformed or throwing replacement providers", () => {
    for (const method of [undefined, () => null, () => { throw new Error("provider failure"); }, () => ({ slot: cardSlot() }) as never]) {
      const initial = fixture(), saved = structuredClone(initial);
      registerSiteContentProvider(testSiteContentProvider({ replacePurchasedShopSlot: method }));
      const out = fold(initial, [{ seq: 1, event: event("BUY_SHOP_SLOT", { siteId: SITE_ID, slotIndex: 0, expectedOffer: rev(initial) }) }]);
      expect(out.state).toEqual(saved); expect(out.outcomes[0]).toMatchObject({ outcome: "bounced", bounceReason: "fold_error" });
      expect(out.outcomes[0].logRecords).toBeUndefined(); expect(initial).toEqual(saved);
    }
    registerSiteContentProvider(null); const initial = fixture();
    expect(fold(initial, [{ seq: 1, event: event("BUY_SHOP_SLOT", { siteId: SITE_ID, slotIndex: 0, expectedOffer: rev(initial) }) }]).state).toBe(initial);
  });
  it.each([false, true])("rolls back a Card Shop provider discarding its draft with exhaustion=%s", (empty) => {
    const initial = fixture(), saved = structuredClone(initial);
    registerSiteContentProvider(testSiteContentProvider({ replacePurchasedShopSlot: ({ journey, purchasedSlot }) => ({
      ...result(journey, purchasedSlot, empty ? null : cardSlot()), draftState: null,
    }) }));
    const out = fold(initial, [{ seq: 1, event: event("BUY_SHOP_SLOT", { siteId: SITE_ID, slotIndex: 0, expectedOffer: rev(initial) }) }]);
    expect(out.state).toEqual(saved); expect(out.outcomes[0]).toMatchObject({ outcome: "bounced", bounceReason: "fold_error" });
    expect(out.outcomes[0].logRecords).toBeUndefined(); expect(initial).toEqual(saved);
  });
  it("atomically rejects malformed returned draft metadata, copies and independently valid summaries", () => {
    const valid = fullDraft(), missing = (key: string) => Object.fromEntries(Object.entries(valid).filter(([field]) => field !== key));
    const badDrafts: unknown[] = [
      ...["mode", "currentOffer", "activeSiteId", "pickNumber", "sitePicksCompleted", "draftPoolCopiesByCard", "remainingCopiesByCard",
        "currentOfferCount", "siteShownCardNumbers", "currentOfferTransfigurations", "transfiguredOfferSource", "openingDraftOffers"].map(missing),
      ...["draftPoolCopiesByCard", "remainingCopiesByCard"].flatMap((field) => [
        ...[-1, "2", .5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity].map((count) => ({ ...valid, [field]: { 7: count } })),
        ...["bad", "07", "7.0", "-1", "9007199254740992"].map((key) => ({ ...valid, [field]: { [key]: 1 } })),
        { ...valid, [field]: { 7: Number.MAX_SAFE_INTEGER, 8: 1 } }, { ...valid, [field]: new Date(0) },
      ]),
      { ...valid, remainingCopiesByCard: { 8: 1 } }, { ...valid, remainingCopiesByCard: { 7: 3 } },
      { ...valid, draftPoolCopiesByCard: { 7: 3 } }, { ...valid, mode: "other" }, { ...valid, currentOffer: [8, 7] },
      { ...valid, activeSiteId: null }, { ...valid, pickNumber: 2 }, { ...valid, sitePicksCompleted: 1 },
      { ...valid, currentOfferCount: 3 }, { ...valid, siteShownCardNumbers: [8, 7] },
      { ...valid, currentOfferTransfigurations: { 7: "Inspired", 8: "Inspired" } },
      { ...valid, transfiguredOfferSource: { siteId: SITE_ID, actionId: testExplorationActionId("changed") } },
      { ...valid, openingDraftOffers: { 1: [8, 7] } }, { ...valid, extra: true },
      { ...valid, extra: undefined }, { ...valid, extra: () => 0 }, { ...valid, extra: Symbol("bad") },
      { ...valid, currentOffer: [NaN] },
    ];
    const cyclic: Record<string, unknown> = { ...valid }; cyclic.extra = cyclic; badDrafts.push(cyclic);
    const malformed: Record<string, unknown>[] = badDrafts.map((draftState) => ({ draftState }));
    malformed.push({ draftState: valid, draftSupplyBefore: { mode: "tides4", distinctRemaining: 1, copiesRemaining: 3 } },
      { draftState: valid, draftSupplyAfter: { mode: "tides4", distinctRemaining: 0, copiesRemaining: 0 } });
    for (const fields of malformed) {
      const base = fixture(), initial = { ...base, journey: { ...base.journey, draftState: valid } }, saved = structuredClone(initial);
      registerSiteContentProvider(testSiteContentProvider({ replacePurchasedShopSlot: ({ journey, purchasedSlot }) => ({
        ...result(journey, purchasedSlot, cardSlot()), ...fields,
      }) }));
      const out = fold(initial, [{ seq: 1, event: event("BUY_SHOP_SLOT", { siteId: SITE_ID, slotIndex: 0, expectedOffer: rev(initial) }) }]);
      expect(out.state).toEqual(saved); expect(out.outcomes[0]).toMatchObject({ outcome: "bounced", bounceReason: "fold_error" });
      expect(out.outcomes[0].logRecords).toBeUndefined(); expect(initial).toEqual(saved);
    }
  });
  it("preserves canonical optional metadata through remaining-only spending, regeneration and zero supply", () => {
    for (const regenerating of [false, true]) {
      const base = fixture(), before = { ...fullDraft(), draftPoolCopiesByCard: { 7: 2, 8: 0 }, remainingCopiesByCard: regenerating ? {} : { 7: 2, 8: 0 } };
      const initial = { ...base, journey: { ...base.journey, draftState: before } }, saved = structuredClone(initial);
      const after: DraftState = { openingDraftOffers: before.openingDraftOffers, transfiguredOfferSource: before.transfiguredOfferSource,
        currentOfferTransfigurations: { 8: "Inspired", 7: "Kindled" }, siteShownCardNumbers: before.siteShownCardNumbers,
        sitePicksCompleted: before.sitePicksCompleted, pickNumber: before.pickNumber, activeSiteId: before.activeSiteId,
        currentOfferCount: before.currentOfferCount, currentOffer: before.currentOffer,
        remainingCopiesByCard: { 7: 1, 8: 0 }, draftPoolCopiesByCard: { 8: 0, 7: 2 }, mode: "tides4" };
      registerSiteContentProvider(testSiteContentProvider({ replacePurchasedShopSlot: ({ journey, purchasedSlot }) => ({
        ...result(journey, purchasedSlot, cardSlot()), draftState: after, draftSupplyAfter: supply(after),
      }) }));
      const out = buy(initial); expect(out.outcome).toBe("applied"); expect(out.state.journey.draftState).toEqual(after); expect(initial).toEqual(saved);
    }
    const base = fixture(), zero = { ...draft(), draftPoolCopiesByCard: { 7: 0 }, remainingCopiesByCard: { 7: 0 } };
    const initial = { ...base, journey: { ...base.journey, draftState: zero } }; registerSiteContentProvider(provider(null));
    const out = buy(initial); expect(out.outcome).toBe("applied"); expect(out.state.journey.draftState).toEqual(zero);
    const bazaar = fixture("DreamsignBazaar"), absent = { ...bazaar, journey: { ...bazaar.journey, draftState: null } };
    registerSiteContentProvider(provider()); expect(buy(absent).outcome).toBe("applied");
  });
  it("rolls back a late hook after speculative stock/pool/payment writes and permits recovery", () => {
    const failId = testDreamsignId("late-failure"); let failing = true;
    const hook: JourneyModifierDefinition = { dreamsignId: failId, afterJourneyEvent: () => { if (failing) throw new Error("late failure"); return null; } };
    const use = createJourneyModifierRegistry([definition(), hook]), base = fixture("Shop", [SOURCE, failId]);
    const initial = { ...base, journey: { ...base.journey, shopModifiers: shopModifiers({ freePurchaseModifiers: [{ kind: "free-purchases", sourceSiteId: SITE_ID,
      sourceActionId: testExplorationActionId("rollback"), initialCount: 1, remainingCount: 1 }] }) } };
    const saved = structuredClone(initial), request = event("BUY_SHOP_SLOT", { siteId: SITE_ID, slotIndex: 0, expectedOffer: rev(initial) });
    const failed = fold(initial, [{ seq: 1, event: request }], use);
    expect(failed.state).toEqual(saved); expect(failed.outcomes[0].logRecords).toBeUndefined(); failing = false;
    const recovered = fold(failed.state, [{ seq: 2, event: request }], use);
    expect(recovered.outcomes[0].outcome).toBe("applied"); expect(runtime(recovered.state).purchaseHistory).toHaveLength(1);
    expect(recovered.state.journey.shopModifiers.freePurchaseModifiers).toEqual([]); expect(initial).toEqual(saved);
  });
  it("round-trips each committed boundary and rejects corrupted new saved fields", () => {
    const initial = fixture(), requests = [0, 1].map((purchaseCount, index) => ({ seq: index + 1,
      event: { ...event("BUY_SHOP_SLOT", { siteId: SITE_ID, slotIndex: 0, expectedOffer: { purchaseCount, rerollCount: 0 } })} }));
    const whole = fold(initial, requests), prefix = fold(initial, requests.slice(0, 1));
    const decoded = GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(prefix.state));
    const resumed = foldEvents(config(initial), { ...GENESIS, seed: initial.journey.seed }, { state: decoded, seq: 1 }, requests.slice(1), { devMode: false });
    expect(resumed.state).toEqual(whole.state); expect(GAME_ENGINE_CONFIG.hash(resumed.state)).toBe(GAME_ENGINE_CONFIG.hash(whole.state));
    expect(decodeEvent(encodeEvent(requests[0].event))).toEqual(requests[0].event);
    for (const bad of [null, [], { wrong: true }, { ...runtime(prefix.state).purchaseHistory[0].slotReplacement, heldIndex: -1 },
      { ...runtime(prefix.state).purchaseHistory[0].slotReplacement, dreamsignId: "" },
      { ...runtime(prefix.state).purchaseHistory[0].slotReplacement, drawIndices: [0, 0] },
      { ...runtime(prefix.state).purchaseHistory[0].slotReplacement, revisionAfter: { purchaseCount: 9, rerollCount: 0 } }]) {
      const malformed = structuredClone(prefix.state); (runtime(malformed).purchaseHistory[0] as unknown as Record<string, unknown>).slotReplacement = bad;
      expect(() => GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(malformed))).toThrow();
      expect(reduceGameEvent(initial, event("LOAD_STATE", { snapshot: malformed.journey }), ctx(), registry).state).toBe(initial);
    }
    expect(reduceGameEvent(initial, event("LOAD_STATE", { snapshot: prefix.state.journey }), ctx(), registry).outcome).toBe("applied");
  });
  it.each(["Shop", "DreamsignBazaar"] as const)("rejects crossed saved replacement categories for %s", (category) => {
    const initial = fixture(category), accepted = buy(initial).state;
    expect(GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(accepted))).toEqual(accepted);
    expect(reduceGameEvent(initial, event("LOAD_STATE", { snapshot: accepted.journey }), ctx(), registry).outcome).toBe("applied");
    const shelf = runtime(accepted), receipt = shelf.purchaseHistory[0], applied = receipt.slotReplacement!;
    const crossed = { ...applied, replacement: { ...applied.replacement!, item:
      category === "Shop" ? identity(dreamsignSlot("crossed")) : identity(cardSlot()) } };
    const malformed = { ...accepted, journey: { ...accepted.journey, siteRuntime: { ...accepted.journey.siteRuntime,
      [SITE_ID]: { ...shelf, purchaseHistory: [{ ...receipt, slotReplacement: crossed }] } } } };
    expect(() => GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(malformed))).toThrow();
    expect(reduceGameEvent(initial, event("LOAD_STATE", { snapshot: malformed.journey }), ctx(), registry).state).toBe(initial);
  });
  it("applies one purchase and refuses a stale second buy of the same offer", () => {
    const initial = fixture(), payload = { siteId: SITE_ID, slotIndex: 0, expectedOffer: rev(initial) };
    const out = fold(initial, [1, 2].map((seq) => ({ seq, event: event("BUY_SHOP_SLOT", payload) })));
    expect(out.outcomes.map(({ outcome }) => outcome)).toEqual(["applied", "bounced"]);
    expect(out.outcomes[1].bounceReason).toBe("invalid_action");
    expect(runtime(out.state).purchaseHistory).toHaveLength(1); expect(out.state.journey.essence).toBe(989);
  });
});
