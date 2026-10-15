import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventContext, EngineConfig, GameEvent } from "../../eventlog/types";
import { createLocalLog, type LocalLogRecord } from "../../eventlog/local-log";
import { foldEvents } from "../../eventlog/fold";
import { LayerName } from "../../types/layer-name";
import { NIGHTMARE_CARD_ID } from "../../data/nightmare";
import { parseCardSubtype } from "../../types/card-identity";
import { parseCardTypeChangePredicateId, parseDeckEntryId, parseSiteId, type DreamsignId, type DeckEntryId } from "../../types/identifiers";
import { testCardId, testDreamsignId, testEventActor } from "../../types/test-identities";
import type { JourneyDuplicationEffect, RuntimeShopSlot, ShopSiteRuntime } from "../../types/journey";
import type { FoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import { FIXTURE_ENGINE, FIXTURE_POINTS_MODE, fixtureBattleInitProvider } from "../replay/fixture-providers";
import { journeyBattleOf } from "../battle/fold";
import { registerBattleInitProvider } from "../battle/journey-battle";
import { pendingEnginePrompt } from "../battle/engine-battle";
import { createEngine } from "../../engine";
import { energy, event as eventAbility } from "../../engine/dsl/builders";
import { gainPoints } from "../../engine/effects/primitives";
import { syntheticId, testCatalog } from "../../engine/testing/synthetic-cards";
import type { EngineCardDefinition } from "../../engine/catalog";
import { journeyDuplication } from "./journey-duplication";
import { journeyDeckEntry } from "./journey-deck-entry";
import { journeyShop } from "./journey-shop";
import { journeyPurge } from "./journey-purge";
import { journeyTransfiguration, registerJourneyTransfigurationProvider } from "./journey-transfiguration";
import { journeyOnGain } from "./journey-on-gain";
import { createJourneyModifierRegistry, type JourneyModifierDefinition } from "./modifier-registry";
import { makeEntry, makeSite, SITE_ID, stateWithSites } from "./sites-fixtures";
import { cardSlot, dreamsignSlot } from "./shop-fixtures";
import { ctx, event, GENESIS } from "./lifecycle-fixtures";
import { registerDeckContentProvider } from "./deck";
import { registerSiteContentProvider } from "./sites";
import { testSiteContentProvider } from "./test-content-providers";
import { beginBattle, clear, RED, DOLL, SLUG, SLIME, sign } from "./journey-on-gain-fixtures";

const SPIDER = testDreamsignId("optional-copy"), MIRROR = testDreamsignId("first-purchase-copy"), SHELL = testDreamsignId("site-copy-count");
const CRYSTAL = testDreamsignId("gain-form"), WARRIOR = testDreamsignId("gain-spark"), RAVEN = testDreamsignId("prevent-copy"), SHARD = testDreamsignId("purchase-form"), TOME = testDreamsignId("copy-formed-event"), OTHER = testDreamsignId("unrelated-copy");
const definitions = [journeyDuplication(SPIDER, { kind: "afterBattleDuplication" }), journeyDuplication(MIRROR, { kind: "firstCardPurchaseDuplication" }), journeyDuplication(SHELL, { kind: "duplicationSiteCopies", copies: 4 }),
  journeyDeckEntry(CRYSTAL, { kind: "randomTransfiguration", minimumDeckSize: 30 }), journeyDeckEntry(WARRIOR, { kind: "warriorSpark", amount: 2 }), journeyDeckEntry(RAVEN, { kind: "preventNightmare" }), journeyShop(SHARD, { kind: "purchasedCardTransfiguration" }), journeyTransfiguration(TOME, { kind: "copyTransfiguredEvent" }),
  journeyPurge(SLUG, { kind: "afterBattlePurge", maxCount: 2 }), journeyTransfiguration(SLIME, { kind: "afterBattleTransfiguration", maxCount: 3 }), journeyOnGain(RED, { kind: "afterBattleDreamsignChoice", offerCount: 3 }), journeyOnGain(DOLL, { kind: "copyOwnedDreamsignOnGain" })];
const registry = createJourneyModifierRegistry(definitions);
function forms() {
  registerJourneyTransfigurationProvider({ resolve: (entry) => ({ cardId: entry.cardNumber === 99 ? NIGHTMARE_CARD_ID : testCardId(`copy-${String(entry.cardNumber)}`), cardType: entry.typeChange?.cardType ?? "Character", subtype: entry.typeChange?.subtype ?? parseCardSubtype("Warrior"), forms: entry.transfiguration === null ? ["Empowered"] : [] }) });
  registerDeckContentProvider({ resolveCardNumber: (id) => id === NIGHTMARE_CARD_ID ? 99 : 1, resolveDreamsign: sign });
}
beforeEach(forms);
afterEach(clear);
const apply = (s: FoldState, type: GameEvent["type"], payload: Record<string, unknown> = {}, context: Partial<EventContext> = {}, use = registry) => reduceGameEvent(s, event(type, payload), ctx(context), use);
function accepted(s: FoldState, type: GameEvent["type"], payload: Record<string, unknown> = {}, context: Partial<EventContext> = {}) {
  const out = apply(s, type, payload, context); expect(out.outcome).toBe("applied"); return out.state;
}
function site(held: readonly DreamsignId[] = [], enhanced = false, size = 2) {
  const deck = Array.from({ length: size }, (_, n) => makeEntry({ entryId: parseDeckEntryId(`entry-${String(n)}`), cardNumber: 1 }));
  return stateWithSites([makeSite("Duplication", enhanced)], { dreamsigns: held.map(sign), deck,
    siteRuntime: { [SITE_ID]: { kind: "cardChoice", choiceKind: "duplication", entryIds: deck.slice(0, 2).map((entry) => entry.entryId), acceptedEntryIds: [] } } });
}
function shop(held: readonly DreamsignId[] = [], slots: RuntimeShopSlot[] = [dreamsignSlot("unrelated"), cardSlot({ cardNumber: 1 }), cardSlot({ cardNumber: 1 })]) {
  const state = stateWithSites([makeSite("Shop")], { essence: 1000, dreamsigns: held.map(sign), siteRuntime: { [SITE_ID]: { kind: "shop", slots, purchaseHistory: [], rerollCount: 0, remainingDreamsignPoolIds: [] } } });
  state.journey.atlas.nodes[state.journey.currentDreamscape!].layer = LayerName.One;
  return state;
}
const buy = (s: FoldState, slotIndex: number, seq = 10) => accepted(s, "BUY_SHOP_SLOT", { siteId: SITE_ID, slotIndex }, { seq });
function payload(s: FoldState, entryId: DeckEntryId | null = null) {
  if (s.journey.screen.type !== "journeyDuplication") throw new Error("Missing earned copy");
  const choice = s.journey.screen.choice, source = choice.sources[choice.index];
  if (source.kind !== "duplication") throw new Error("Wrong earned purpose");
  return { siteId: choice.siteId, dreamsignId: source.dreamsignId, heldIndex: source.heldIndex, choiceIndex: choice.index, earnedSeq: source.earnedSeq, entryId };
}
function ended(held: readonly DreamsignId[], outcome: "atlas" | "journeyComplete" | "defeat" | "draw" = "atlas") {
  const loser: EngineCardDefinition = { id: syntheticId(0x268), cardType: "event", costs: [energy(0)], spark: null, subtype: "", speed: "standard", status: "authored", abilities: () => [eventAbility(gainPoints(1, "opponent"))] };
  const engine = outcome === "defeat" ? createEngine(testCatalog([loser])) : FIXTURE_ENGINE;
  let s = beginBattle(held, () => {
    if (outcome !== "defeat" && outcome !== "draw") return;
    const provider = fixtureBattleInitProvider();
    registerBattleInitProvider({ ...provider, engine, beginBattle: (input) => {
      const start = provider.beginBattle(input); return start === null ? null : { ...start, engineInit: { ...start.engineInit, turnLimit: 1,
        ...(outcome === "defeat" ? { decks: { ...start.engineInit.decks, player: Array.from({ length: 10 }, () => ({ cardId: loser.id })) } } : {}) } };
    } });
  });
  forms();
  s = { ...s, journey: { ...s.journey, deck: [makeEntry({ entryId: parseDeckEntryId("battle-copy-card") })], remainingDreamsignPool: [], ...(outcome === "journeyComplete" ? { atlas: { ...s.journey.atlas, layers: [s.journey.atlas.layers[0]] } } : {}) } };
  if (outcome === "draw") {
    for (let i = 0; i < 12 && journeyBattleOf(s.battle)?.engine.slice.committed.result === null; i++) {
      const board = journeyBattleOf(s.battle)!.engine.slice.committed;
      const side = (["player", "enemy"] as const).find((candidate) => engine.legalActions(board, candidate).some((action) => action.kind === "pass"));
      if (side === undefined) throw new Error("No synthetic pass"); s = accepted(s, "BATTLE_ACTION", { side, action: { kind: "pass" } });
    }
  } else {
    const board = journeyBattleOf(s.battle)!.engine.slice.committed;
    s = accepted(s, "BATTLE_ACTION", { side: "player", action: { kind: "play", card: board.sides.player.hand[0], from: "hand" } });
    if (outcome !== "defeat") {
      const prompt = pendingEnginePrompt(s.battle, engine); if (prompt === null) throw new Error("Missing synthetic prompt");
      s = accepted(s, "BATTLE_ANSWER", { side: "player", promptId: prompt.prompt.id, value: FIXTURE_POINTS_MODE });
    }
  }
  return { before: s, after: accepted(s, "END_BATTLE", {}, { seq: 30 }) };
}

describe("journeyDuplication physical copy contracts", () => {
  it("validates exact catalog descriptors", () => {
    for (const descriptor of [{ kind: "unknown" }, { kind: "duplicationSiteCopies", copies: 0 }, { kind: "duplicationSiteCopies", copies: 1.5 }]) expect(() => journeyDuplication(SHELL, descriptor as JourneyDuplicationEffect)).toThrow(RangeError);
  });
  it.each([false, true])("copies the current D39 entry in one batch with stable identities, enhanced=%s", (enhanced) => {
    for (const held of [[], [SHELL], [SHELL, SHELL]]) {
      const initial = site(held, enhanced), source = initial.journey.deck[0];
      initial.journey.deck[0] = { ...source, transfiguration: "Empowered", isBane: true, sparkBonus: 7, typeChange: { predicateId: parseCardTypeChangePredicateId("copy-type"), cardType: "Event", subtype: parseCardSubtype(""), label: "" }, keywordModification: { fast: true, energyCostReduction: 3, reclaim: 2, setReclaim: 1 }, statOverride: { spark: 91 } };
      const saved = structuredClone(initial), count = held.length === 0 ? 1 : 4;
      const result = apply(initial, "ACCEPT_DUPLICATION_CHOICE", { siteId: SITE_ID, entryId: source.entryId });
      expect(result.outcome).toBe("applied"); expect(initial).toEqual(saved);
      expect(result.state.journey.deck).toHaveLength(2 + count);
      const { statOverride: _debug, ...expected } = initial.journey.deck[0];
      for (const copy of result.state.journey.deck.slice(2)) expect({ ...copy, entryId: source.entryId }).toEqual(expected);
      expect(new Set(result.state.journey.deck.map((entry) => entry.entryId)).size).toBe(2 + count);
      expect(result.logRecords?.[0].fields).toMatchObject({ requestedCopyCount: count, attemptedCopies: Array.from({ length: count }, () => ({ cardId: testCardId("copy-1") })) });
      expect(apply(result.state, "ACCEPT_DUPLICATION_CHOICE", { siteId: SITE_ID, entryId: source.entryId }).state).toBe(result.state);
      expect(apply(initial, "ACCEPT_DUPLICATION_CHOICE", { siteId: SITE_ID, entryId: source.entryId }).state).toEqual(result.state);
    }
  });
  it("uses current held replacement sources and presents all four additions to the threshold together", () => {
    let s = site([SHELL], false, 26);
    s = accepted(s, "REMOVE_DREAMSIGN", { dreamsignId: SHELL });
    expect(accepted(s, "ACCEPT_DUPLICATION_CHOICE", { siteId: SITE_ID, entryId: "entry-0" }).journey.deck).toHaveLength(27);
    s = accepted(s, "ADD_DREAMSIGN", { dreamsignId: SHELL });
    s = accepted(s, "ADD_DREAMSIGN", { dreamsignId: CRYSTAL });
    const after = accepted(s, "ACCEPT_DUPLICATION_CHOICE", { siteId: SITE_ID, entryId: "entry-0" });
    expect(after.journey.deck).toHaveLength(30); expect(after.journey.deck.slice(26).every((entry) => entry.transfiguration === "Empowered")).toBe(true);
    expect(after.journey.deck.slice(0, 26).every((entry) => entry.transfiguration === null)).toBe(true);
  });
  it("keeps the accepted site and diagnostic attempts when Nightmare gains are prevented", () => {
    const s = site([SHELL, RAVEN]); s.journey.deck[0] = { ...s.journey.deck[0], cardNumber: 99, isBane: true };
    const out = apply(s, "ACCEPT_DUPLICATION_CHOICE", { siteId: SITE_ID, entryId: "entry-0" });
    expect(out.outcome).toBe("applied"); expect(out.state.journey.deck).toEqual(s.journey.deck);
    expect(out.state.journey.siteRuntime[SITE_ID]).toMatchObject({ acceptedEntryIds: ["entry-0"] });
    expect(out.logRecords?.[0].fields).toMatchObject({ requestedCopyCount: 4 });
    expect(out.logRecords?.find((row) => row.fields.dreamsignId === RAVEN)?.fields.after).toMatchObject({ prevented: 4 });
  });
  it("refuses missing, unoffered and repeated physical targets without spending the visit", () => {
    const s = site([SHELL]); s.journey.deck.push(makeEntry({ entryId: parseDeckEntryId("not-offered") }));
    for (const entryId of ["missing", "not-offered", null, 7]) expect(apply(s, "ACCEPT_DUPLICATION_CHOICE", { siteId: SITE_ID, entryId }).state).toBe(s);
  });
  it("duplicates only the first successful CARD receipt, separately per physical source and site", () => {
    let s = shop([MIRROR, MIRROR]); s = buy(s, 0);
    expect(s.journey.deck).toHaveLength(0);
    const poor = { ...s, journey: { ...s.journey, essence: 0 } };
    expect(apply(poor, "BUY_SHOP_SLOT", { siteId: SITE_ID, slotIndex: 1 }).state).toBe(poor);
    s = buy(s, 1, 11); expect(s.journey.deck).toHaveLength(3);
    const purchased = s.journey.deck[0]; expect(s.journey.deck.every((entry) => entry.cardNumber === purchased.cardNumber)).toBe(true);
    expect(apply(s, "BUY_SHOP_SLOT", { siteId: SITE_ID, slotIndex: 1 }).state).toBe(s);
    s = accepted(s, "LOAD_STATE", { snapshot: JSON.parse(JSON.stringify(s.journey)) });
    s = buy(s, 2, 12); expect(s.journey.deck).toHaveLength(4);
    const nextId = parseSiteId("independent-shop"), nodeId = s.journey.currentDreamscape!;
    const runtime = s.journey.siteRuntime[SITE_ID] as ShopSiteRuntime;
    s = { ...s, journey: { ...s.journey, atlas: { ...s.journey.atlas, nodes: { ...s.journey.atlas.nodes, [nodeId]: { ...s.journey.atlas.nodes[nodeId], sites: [...s.journey.atlas.nodes[nodeId].sites, { ...makeSite("Shop"), id: nextId }] } } }, siteRuntime: { ...s.journey.siteRuntime, [nextId]: { ...runtime, slots: [cardSlot({ cardNumber: 1 })], purchaseHistory: [] } } } };
    expect(accepted(s, "BUY_SHOP_SLOT", { siteId: nextId, slotIndex: 0 }, { seq: 13 }).journey.deck).toHaveLength(7);
  });
  it("preserves settled purchased forms and gain bonuses without supplying a new transformation occasion", () => {
    registerJourneyTransfigurationProvider({ resolve: () => ({ cardId: testCardId("formed-event"), cardType: "Event", subtype: parseCardSubtype(""), forms: ["Empowered"] }) });
    const formed = buy(shop([MIRROR, SHARD, TOME, CRYSTAL], [cardSlot({ cardNumber: 1 })]), 0);
    expect(formed.journey.deck).toHaveLength(2); expect(formed.journey.deck.every((entry) => entry.transfiguration === "Empowered")).toBe(true);
    forms();
    const s = shop([MIRROR, SHARD, CRYSTAL, WARRIOR], [cardSlot({ cardNumber: 1 })]);
    const out = buy(s, 0); expect(out.journey.deck).toHaveLength(2);
    expect(out.journey.deck.map((entry) => entry.transfiguration)).toEqual(["Empowered", "Empowered"]);
    expect(out.journey.deck.map((entry) => entry.sparkBonus)).toEqual([2, 4]);
    const missing = shop([], [cardSlot({ cardNumber: 1 }), cardSlot({ cardNumber: 1 })]);
    const gained = accepted(buy(missing, 0), "ADD_DREAMSIGN", { dreamsignId: MIRROR });
    expect(buy(gained, 1, 11).journey.deck).toHaveLength(2);
  });
  it("keeps a consumed first-card receipt when the purchased Nightmare is prevented and applies source loss", () => {
    const denied = buy(shop([MIRROR, RAVEN], [cardSlot({ cardNumber: 99 }), cardSlot({ cardNumber: 1 })]), 0);
    expect(denied.journey.deck).toHaveLength(0);
    expect(buy(denied, 1, 11).journey.deck).toHaveLength(1);
    const lost = accepted(shop([MIRROR], [cardSlot({ cardNumber: 1 })]), "REMOVE_DREAMSIGN", { dreamsignId: MIRROR });
    expect(buy(lost, 0).journey.deck).toHaveLength(1);
    const bazaar = shop([MIRROR], [dreamsignSlot("unrelated")]);
    const nodeId = bazaar.journey.currentDreamscape!;
    bazaar.journey.atlas.nodes[nodeId].sites[0].type = "DreamsignBazaar";
    expect(buy(bazaar, 0).journey.deck).toHaveLength(0);
  });
  it("retains first-card history through a successful Restock", () => {
    registerSiteContentProvider(testSiteContentProvider({ rerollShop: () => ({ slots: [cardSlot({ cardNumber: 1 })], remainingDreamsignPoolIds: [], remainingDreamsignPool: [], draftState: null }) }));
    const first = buy(shop([MIRROR], [cardSlot({ cardNumber: 1 })]), 0);
    const restocked = accepted(first, "REROLL_SHOP", { siteId: SITE_ID }, { seq: 11 });
    expect(buy(restocked, 0, 12).journey.deck).toHaveLength(3);
  });
  it.each(["atlas", "journeyComplete", "defeat", "draw"] as const)("preserves every earned kind, loss/reload and exact %s continuation in both held orders", (outcome) => {
    for (const held of [[SPIDER, SLUG, SLIME, RED, SPIDER], [RED, SLIME, SLUG, SPIDER, SPIDER]]) {
      let { after: s } = ended(held, outcome); const balance = s.journey.essence, summary = s.journey.failureSummary;
      const firstChoice = s.journey.screen; expect(firstChoice.type).toBe(held[0] === SPIDER ? "journeyDuplication" : "journeyDreamsign");
      if (!("choice" in firstChoice) || firstChoice.choice.kind !== "afterBattle") throw new Error("Missing earned batch");
      expect(firstChoice.choice.sources.map((source) => source.dreamsignId)).toEqual(held);
      s = accepted(s, "REMOVE_DREAMSIGN", { dreamsignId: SPIDER }); s = accepted(s, "REMOVE_DREAMSIGN", { dreamsignId: SPIDER });
      for (let n = 0; n < held.length; n++) {
        s = accepted(s, "LOAD_STATE", { snapshot: JSON.parse(JSON.stringify(s.journey)) });
        const screen = s.journey.screen; if (!("choice" in screen) || screen.choice.kind !== "afterBattle") throw new Error("Missing cursor");
        const choice = screen.choice, source = choice.sources[choice.index];
        const common = { siteId: choice.siteId, dreamsignId: source.dreamsignId, heldIndex: source.heldIndex, choiceIndex: choice.index };
        if (source.kind === "duplication") s = accepted(s, "RESOLVE_JOURNEY_DUPLICATION", { ...common, earnedSeq: source.earnedSeq, entryId: n === 0 ? s.journey.deck[0].entryId : null });
        else if (source.kind === "dreamsign") s = accepted(s, "RESOLVE_AFTER_BATTLE_DREAMSIGN", { ...common, earnedSeq: source.earnedSeq, offeredDreamsignId: null });
        else s = accepted(s, source.kind === "transfiguration" ? "RESOLVE_JOURNEY_TRANSFIGURATION" : "RESOLVE_JOURNEY_PURGE", { ...common, entryIds: [] });
      }
      expect(s.journey.screen.type).toBe(outcome === "defeat" || outcome === "draw" ? "journeyFailed" : outcome);
      expect(s.journey.essence).toBe(balance); expect(s.journey.failureSummary).toEqual(summary); expect(s.battle).toBeNull();
    }
  });
  it("suspends a later Spider permission under an acquired mandatory Dreamsign copy and restores it after load", () => {
    const { before } = ended([RED, SPIDER]);
    const withOffer = { ...before, journey: { ...before.journey, remainingDreamsignPool: [DOLL] } };
    let s = accepted(withOffer, "END_BATTLE", {}, { seq: 31 });
    if (s.journey.screen.type !== "journeyDreamsign" || s.journey.screen.choice.kind !== "afterBattle") throw new Error("Missing offer");
    const choice = s.journey.screen.choice, source = choice.sources[0]; if (source.kind !== "dreamsign") throw new Error("Missing source");
    s = accepted(s, "RESOLVE_AFTER_BATTLE_DREAMSIGN", { siteId: choice.siteId, dreamsignId: RED, heldIndex: 0, choiceIndex: 0, earnedSeq: source.earnedSeq, offeredDreamsignId: DOLL }, { seq: 32 });
    expect(s.journey.screen).toMatchObject({ type: "journeyDreamsign", choice: { kind: "copy", continuation: { type: "journeyDuplication" } } });
    s = accepted(s, "LOAD_STATE", { snapshot: JSON.parse(JSON.stringify(s.journey)) });
    s = accepted(s, "RESOLVE_DREAMSIGN_COPY", { sourceDreamsignId: DOLL, heldIndex: 2, choiceIndex: 0, permissionSeq: 32, targetHeldIndex: 0, expectedTargetDreamsignId: RED });
    expect(s.journey.screen.type).toBe("journeyDuplication");
    expect(accepted(s, "RESOLVE_JOURNEY_DUPLICATION", payload(s)).journey.screen.type).toBe("atlas");
  });
  it("rejects stale permissions, foreign physical IDs, navigation, forged loads and competing actors atomically", () => {
    const { after: s } = ended([SPIDER]), body = payload(s, s.journey.deck[0].entryId), rng = vi.fn(() => 0);
    for (const patch of [{ earnedSeq: 29 }, { heldIndex: 9 }, { choiceIndex: 1 }, { dreamsignId: OTHER }, { siteId: SITE_ID }, { entryId: "missing" }, { entryId: undefined }, { entryId: [] }]) expect(apply(s, "RESOLVE_JOURNEY_DUPLICATION", { ...body, ...patch }, { rng }).state).toBe(s);
    expect(apply(s, "COMPLETE_SITE", { siteId: body.siteId }).state).toBe(s);
    for (const intervening of ["unknown" as const, [{ seq: 2, actor: testEventActor("partner"), type: "ADD_DREAMSIGN" as const }]]) expect(apply(s, "RESOLVE_JOURNEY_DUPLICATION", body, { intervening, rng }).state).toBe(s);
    if (s.journey.screen.type !== "journeyDuplication") throw new Error("Missing choice");
    for (const patch of [{ index: 9 }, { sources: [] }, { sources: [{ kind: "duplication", dreamsignId: OTHER, heldIndex: 0, earnedSeq: 30 }] }, { sources: [{ ...s.journey.screen.choice.sources[0], earnedSeq: -1 }] }, { returnTo: "journeyFailed" }]) expect(apply(s, "LOAD_STATE", { snapshot: { ...s.journey, screen: { ...s.journey.screen, choice: { ...s.journey.screen.choice, ...patch } } } }).state).toBe(s);
    const settled = accepted(s, "RESOLVE_JOURNEY_DUPLICATION", body); expect(settled.journey.deck).toHaveLength(s.journey.deck.length + 1);
    expect(apply(settled, "RESOLVE_JOURNEY_DUPLICATION", body, { rng }).state).toBe(settled); expect(rng).not.toHaveBeenCalled();
  });
  it.each(["site", "purchase", "earned"] as const)("contains an error after %s copies without partial writes, then retries and replays", (kind) => {
    const initial = kind === "site" ? site([SHELL, OTHER]) : kind === "purchase" ? shop([MIRROR, OTHER], [cardSlot({ cardNumber: 1 })]) : ended([SPIDER, OTHER]).after;
    const saved = structuredClone(initial); let fail = true;
    const type = kind === "site" ? "ACCEPT_DUPLICATION_CHOICE" : kind === "purchase" ? "BUY_SHOP_SLOT" : "RESOLVE_JOURNEY_DUPLICATION";
    const fault: JourneyModifierDefinition = { dreamsignId: OTHER, afterJourneyEvent: ({ eventType }) => { if (fail && eventType === type) throw new Error("synthetic after-copy error"); return null; } };
    const use = createJourneyModifierRegistry([...definitions, fault]);
    const config: EngineConfig<FoldState> = { ...GAME_ENGINE_CONFIG, genesisState: () => initial, reducer: (s, e, c) => reduceGameEvent(s, e, c, use) };
    const log = createLocalLog({ config, genesis: GENESIS, localActor: testEventActor("copy-player"), now: () => ctx().timestamp, devMode: false });
    const rows: LocalLogRecord<FoldState>[] = []; log.subscribe((row) => rows.push(row));
    const body = kind === "site" ? { siteId: SITE_ID, entryId: "entry-0" } : kind === "purchase" ? { siteId: SITE_ID, slotIndex: 0 } : payload(initial, initial.journey.deck[0].entryId);
    log.append({ type, payload: body }); expect(log.state()).toBe(initial);
    expect(rows[0]).toMatchObject({ outcome: "bounced", bounceReason: "fold_error" }); expect(rows[0].logRecords).toBeUndefined();
    fail = false; log.append({ type, payload: body }); expect(log.state().journey.deck).toHaveLength(initial.journey.deck.length + (kind === "site" ? 4 : kind === "purchase" ? 2 : 1));
    expect(initial).toEqual(saved);
    expect(foldEvents(config, GENESIS, { seq: 1, state: initial }, log.events().filter(({ seq }) => seq > 1)).state).toEqual(log.state());
  });
});
