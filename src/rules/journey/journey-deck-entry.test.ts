import "./journey-character-transfiguration.contracts";

import { makeAuguryTestCard, makeAuguryTestContent } from "../../journey_v2/testing/fixtures";
import { createSiteContentProvider } from "../../session/providers/site-provider";
import { buildExplorationRuntime } from "../../session/providers/exploration-provider";
import { createJourneyTransfigurationProvider } from "../../session/providers/journey-transfiguration-provider";
import { rewardForResolution } from "../../screens/cumulus_adapters/exploration-resolution-view-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalLog } from "../../eventlog/local-log";
import { foldEvents } from "../../eventlog/fold";
import type { EngineConfig } from "../../eventlog/types";
import { NIGHTMARE_CARD_ID } from "../../data/nightmare";
import { parseCardSubtype, EVENT_CARD_SUBTYPE } from "../../types/card-identity";
import { parseDeckEntryId, parseCardTypeChangePredicateId, type DreamsignId } from "../../types/identifiers";
import { testCardId, testDreamsignId, testExplorationActionId, testAvatarId } from "../../types/test-identities";
import type { DeckEntry, ExplorationResolution, ExplorationSiteRuntime, JourneyDeckEntryEffect } from "../../types/journey";
import { createJourneyModifierRegistry, type JourneyModifierDefinition } from "./modifier-registry";
import { journeyDeckEntry } from "./journey-deck-entry";
import { journeyTransfiguration, registerJourneyTransfigurationProvider } from "./journey-transfiguration";
import { registerDeckContentProvider } from "./deck";
import { registerSiteContentProvider } from "./sites";
import { registerJourneyLifecycleContentProvider } from "./lifecycle";
import { clearGameProviders } from "../../session/providers/register-game-providers";
import { testSiteContentProvider, testJourneyLifecycleContentProvider } from "./test-content-providers";
import { makeEntry, makeSite, SITE_ID, stateWithSites } from "./sites-fixtures";
import { ctx, event, GENESIS } from "./lifecycle-fixtures";
import { reduceGameEvent } from "../reducer";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import type { FoldState } from "../fold-state";
import type { GameEventType } from "../events";
import { SELECTION_RULES_VERSION } from "../../reward-selection";

const ACORN = testDreamsignId("gain-warrior"), CRYSTAL = testDreamsignId("gain-random-form"), RAVEN = testDreamsignId("prevent-bane"), TOME = testDreamsignId("copy-form");
const WARRIOR = testCardId("same-name-warrior"), OTHER = testCardId("same-name-event"), BLANK = testCardId("no-form-card");
const sign = (id: DreamsignId) => ({ id, name: "same fixture name", effectDescription: "" });
const entry = (token: string, cardNumber = 1, extra: Partial<DeckEntry> = {}) => makeEntry({ entryId: parseDeckEntryId(token), cardNumber, ...extra });
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const last = <T,>(items: readonly T[]) => items[items.length - 1];
const definitions: readonly JourneyModifierDefinition[] = [
  journeyDeckEntry(ACORN, { kind: "warriorSpark", amount: 1 }),
  journeyDeckEntry(CRYSTAL, { kind: "randomTransfiguration", minimumDeckSize: 30 }),
  journeyDeckEntry(RAVEN, { kind: "preventNightmare" }),
  journeyTransfiguration(TOME, { kind: "copyTransfiguredEvent" }),
];
const registry = createJourneyModifierRegistry(definitions);
const initial = (held: readonly DreamsignId[] = [], count = 0) => stateWithSites([makeSite("Exploration")], {
  deck: Array.from({ length: count }, (_, i) => entry(`old-${String(i)}`, 4)), dreamsigns: held.map(sign), essence: 20,
});
function install() {
  registerDeckContentProvider({ resolveCardNumber: (id) => id === WARRIOR ? 1 : id === OTHER ? 2 : id === NIGHTMARE_CARD_ID ? 3 : id === BLANK ? 4 : null,
    resolveDreamsign: sign });
  registerJourneyTransfigurationProvider({ resolve: (e) => {
    const type = e.typeChange?.cardType ?? (e.cardNumber === 1 ? "Character" : "Event");
    return { cardId: e.cardNumber === 1 ? WARRIOR : e.cardNumber === 2 ? OTHER : e.cardNumber === 3 ? NIGHTMARE_CARD_ID : BLANK,
      cardType: type, subtype: e.typeChange?.subtype ?? (e.cardNumber === 1 ? parseCardSubtype("Warrior") : EVENT_CARD_SUBTYPE),
      forms: e.transfiguration !== null || e.cardNumber === 4 ? [] : type === "Character" ? ["Kindled"] : ["Inspired", "Enduring"] };
  } });
}
const apply = (state: FoldState, type: GameEventType, payload: Record<string, unknown> = {}, overrides: Parameters<typeof ctx>[0] = {}, actor = "alice", modifiers = registry) =>
  reduceGameEvent(state, event(type, payload, actor), ctx(overrides), modifiers);
function accepted(...args: Parameters<typeof apply>) { const out = apply(...args); expect(out.outcome).toBe("applied"); return out.state; }
function runtime(resolution: ExplorationResolution | null): ExplorationSiteRuntime {
  return { kind: "exploration", encounterCardId: OTHER, selectionRulesVersion: SELECTION_RULES_VERSION, actionOffers: [], resolution };
}
function resolution(ids: readonly DeckEntry[]) : ExplorationResolution {
  return { actionId: testExplorationActionId("synthetic-gain"), gainedCardIds: ids.map((e) => e.cardNumber === 3 ? NIGHTMARE_CARD_ID : WARRIOR), gainedEntryIds: ids.map((e) => e.entryId),
    gainedDreamsignIds: [], purgedCardIds: [], affectedEntryIds: [], essenceGained: 0, nightmareGains: ids.filter((e) => e.cardNumber === 3).map((e) => ({ entryId: e.entryId, cardId: NIGHTMARE_CARD_ID })) };
}
function compound(state: FoldState, gains: readonly DeckEntry[], held = state.journey.dreamsigns) {
  state.journey.screen = { type: "site", siteId: SITE_ID };
  state.journey.siteRuntime[SITE_ID] = runtime(null);
  registerSiteContentProvider(testSiteContentProvider({ resolveExploration: ({ journey }) => ({ purges: [], journey: { ...journey, essence: 13, dreamsigns: [...held],
    deck: [...journey.deck.map((e) => ({ ...e, keywordModification: { fast: true } })), ...gains], siteRuntime: { ...journey.siteRuntime, [SITE_ID]: runtime(resolution(gains)) } } }) }));
  return apply(state, "RESOLVE_EXPLORATION_CHOICE", { siteId: SITE_ID, actionId: "synthetic-gain", selectionRulesVersion: SELECTION_RULES_VERSION });
}
beforeEach(install);
afterEach(clearGameProviders);

describe("journeyDeckEntry public gain contracts", () => {
  it.each(["alice", "bob"])("gives each new warrior physical entry one bonus per held copy, actor=%s", (actor) => {
    const before = initial([ACORN, ACORN]); before.journey.deck.push(entry("source", 1, { sparkBonus: 5, keywordModification: { reclaim: 2 } }));
    const out = apply(before, "DUPLICATE_DECK_ENTRY", { entryId: "source" }, {}, actor);
    expect(out.outcome).toBe("applied"); expect(out.state.journey.deck[0]).toEqual(before.journey.deck[0]);
    expect(out.state.journey.deck[1]).toMatchObject({ cardNumber: 1, sparkBonus: 7, keywordModification: { reclaim: 2 } });
    expect(out.state.journey.deck[1].entryId).not.toBe(before.journey.deck[0].entryId);
    expect(out.logRecords?.map((r) => r.fields.target)).toMatchObject([{ sparkChanges: [{ before: 5, after: 6, cardId: WARRIOR }] }, { sparkChanges: [{ before: 6, after: 7 }] }]);
    expect(before.journey.deck).toHaveLength(1);
  });
  it("uses current D39 type/subtype instead of printed UUID or name", () => {
    const before = initial([ACORN]);
    before.journey.deck.push(entry("event-as-warrior", 2, { typeChange: { predicateId: parseCardTypeChangePredicateId("warrior"), cardType: "Character", subtype: parseCardSubtype("Warrior"), label: "" } }));
    before.journey.deck.push(entry("warrior-as-event", 1, { typeChange: { predicateId: parseCardTypeChangePredicateId("event"), cardType: "Event", subtype: EVENT_CARD_SUBTYPE, label: "" } }));
    const warrior = accepted(before, "DUPLICATE_DECK_ENTRY", { entryId: "event-as-warrior" });
    expect(last(warrior.journey.deck)?.sparkBonus).toBe(1);
    expect(last(accepted(warrior, "DUPLICATE_DECK_ENTRY", { entryId: "warrior-as-event" }).journey.deck)?.sparkBonus).toBeUndefined();
    expect(last(accepted(before, "ADD_CARD", { cardId: OTHER }).journey.deck)?.sparkBonus).toBeUndefined();
  });
  it.each([28, 29, 30])("tests the post-addition boundary from %i cards with logged independent draw", (size) => {
    const rng = vi.fn(() => .9);
    const out = apply(initial([CRYSTAL], size), "ADD_CARD", { cardId: OTHER }, { rng });
    expect(last(out.state.journey.deck)?.transfiguration).toBe(size < 29 ? null : "Enduring");
    expect(rng).toHaveBeenCalledTimes(size < 29 ? 0 : 1);
    if (size >= 29) expect(out.logRecords?.[0].fields.target).toMatchObject({ transfigurations: [{ cardId: OTHER, drawIndex: 0, applicableForms: ["Inspired", "Enduring"], type: "Enduring" }] });
  });
  it("uses one batch threshold after prohibited gains are filtered", () => {
    const rng = vi.fn(() => 0);
    const out = compound(initial([CRYSTAL, RAVEN], 28), [entry("bane", 3, { isBane: true }), entry("a", 1)]);
    expect(out.state.journey.deck).toHaveLength(29); expect(last(out.state.journey.deck)?.transfiguration).toBeNull();
    expect(out.state.journey.essence).toBe(13); expect(out.state.journey.deck[0].keywordModification).toEqual({ fast: true });
    const batch = compound(initial([CRYSTAL], 28), [entry("a", 1), entry("b", 1)]);
    expect(batch.state.journey.deck.slice(-2).map((e) => e.transfiguration)).toEqual(["Kindled", "Kindled"]);
    expect(rng).not.toHaveBeenCalled();
  });
  it("retains existing forms, consumes no draws for ineligible entries, and makes duplicate Crystal grants idempotent", () => {
    const rng = vi.fn(() => .9), before = initial([CRYSTAL, CRYSTAL], 30);
    const formed = accepted(before, "ADD_CARD", { cardId: OTHER, transfiguration: "Inspired" }, { rng });
    expect(last(formed.journey.deck)?.transfiguration).toBe("Inspired");
    expect(last(accepted(formed, "ADD_CARD", { cardId: BLANK }, { rng }).journey.deck)?.transfiguration).toBeNull();
    expect(rng).not.toHaveBeenCalled();
    expect(last(accepted(before, "ADD_CARD", { cardId: OTHER }, { rng }).journey.deck)?.transfiguration).toBe("Enduring");
    expect(rng).toHaveBeenCalledTimes(1);
  });
  it.each([[ACORN, TOME], [TOME, ACORN]].map((held) => [held]))("ignores a modifier-produced Event copy with only a Warrior subtype, held order=%s", (held) => {
    const before = initial(held); before.journey.deck.push(entry("transformed", 2, { typeChange: { predicateId: parseCardTypeChangePredicateId("current-event"), cardType: "Event", subtype: parseCardSubtype("Warrior"), label: "" } }));
    // An Event subtype alone is not a Character warrior.
    registerSiteContentProvider(testSiteContentProvider({ resolveExploration: ({ journey }) => ({ purges: [], journey: { ...journey, deck: journey.deck.map((e) => ({ ...e, transfiguration: "Inspired" })) } }) }));
    before.journey.screen = { type: "site", siteId: SITE_ID }; before.journey.siteRuntime[SITE_ID] = runtime(null);
    const out = apply(before, "RESOLVE_EXPLORATION_CHOICE", { siteId: SITE_ID });
    expect(out.state.journey.deck).toHaveLength(2); expect(out.state.journey.deck[1].sparkBonus).toBeUndefined();
  });
  it.each([[CRYSTAL, TOME, TOME], [TOME, TOME, CRYSTAL]].map((held) => [held]))("feeds a genuine Crystal transformation to each Tome once, order=%s", (held) => {
    const rng = vi.fn(() => 0);
    const out = apply(initial(held, 29), "ADD_CARD", { cardId: OTHER }, { rng });
    expect(out.state.journey.deck).toHaveLength(32);
    const added = out.state.journey.deck.slice(29);
    expect(added.every((e) => e.cardNumber === 2 && e.transfiguration === "Inspired")).toBe(true);
    expect(new Set(added.map((e) => e.entryId)).size).toBe(3); expect(rng).toHaveBeenCalledTimes(1);
  });
  it("continues after every existing domain RNG index while preserving its values", () => {
    const late = testDreamsignId("rng-following-add");
    const custom = createJourneyModifierRegistry([...definitions, { dreamsignId: late, afterJourneyEvent: ({ journey }) => ({ journey: { ...journey, deck: [...journey.deck, entry("rng-added", 2)] }, before: { added: 0 }, after: { added: 1 } }) }]);
    const before = initial([CRYSTAL, late], 31);
    before.journey.deck.push(...["bane-1", "bane-2", "bane-3"].map((id) => entry(id, 3, { isBane: true })));
    const seen: number[] = [];
    const out = apply(before, "PURGE_RANDOM_NIGHTMARE_CARDS", { count: 3 }, { rng: (index) => { seen.push(index); return index === 3 ? .9 : .25; } }, "alice", custom);
    expect(out.outcome).toBe("applied"); expect(seen).toEqual([0, 1, 2, 3]);
    expect(out.state.journey.deck.some((e) => e.isBane)).toBe(false);
    expect(last(out.state.journey.deck)?.transfiguration).toBe("Enduring");
  });
  it("does not retrospectively reprocess an earlier gain after a later modifier raises deck size", () => {
    const late = testDreamsignId("late-add");
    const custom = createJourneyModifierRegistry([...definitions, { dreamsignId: late, afterJourneyEvent: ({ journey }) => ({ journey: { ...journey, deck: [...journey.deck, entry("late", 4)] }, before: { added: 0 }, after: { added: 1 } }) }]);
    const out = apply(initial([CRYSTAL, late], 28), "ADD_CARD", { cardId: OTHER }, {}, "alice", custom);
    expect(out.state.journey.deck).toHaveLength(30); expect(out.state.journey.deck[28].transfiguration).toBeNull();
  });
  it("excludes initial deck assembly and administrative loads/type edits", () => {
    const before = initial([ACORN, CRYSTAL], 30);
    registerJourneyLifecycleContentProvider(testJourneyLifecycleContentProvider({ startJourney: ({ journey }) => ({ ...journey, deck: [...journey.deck, entry("starter", 1)] }) }));
    before.journey.currentDreamscape = null;
    before.journey.screen = { type: "journeyStart" };
    before.journey.atlas = { ...before.journey.atlas, nodes: {}, currentNodeId: null, startingNodeId: null };
    const started = accepted(before, "START_JOURNEY", { avatarId: testAvatarId("start-avatar") });
    expect(last(started.journey.deck)).toMatchObject({ transfiguration: null }); expect(last(started.journey.deck)?.sparkBonus).toBeUndefined();
    const snapshot = { ...before.journey, deck: [...before.journey.deck, entry("loaded", 1)] };
    expect(last(accepted(before, "LOAD_STATE", { snapshot }).journey.deck)?.sparkBonus).toBeUndefined();
  });
  it("contains a provider failure after domain mutation and permits one idempotent retry/replay", () => {
    const before = initial([ACORN]); let fail = true;
    registerJourneyTransfigurationProvider({ resolve: () => { if (fail) throw new Error("synthetic gain lookup failure"); return { cardId: WARRIOR, cardType: "Character", subtype: parseCardSubtype("Warrior"), forms: ["Kindled"] }; } });
    const config: EngineConfig<FoldState> = { ...GAME_ENGINE_CONFIG, genesisState: () => before, reducer: (s,e,c) => reduceGameEvent(s,e,c,registry) };
    const log = createLocalLog({ config, genesis: GENESIS, localActor: event("ADD_CARD", {}).actor, now: () => ctx().timestamp, devMode: false });
    log.append({ type: "ADD_CARD", payload: { cardId: WARRIOR } });  expect(log.state()).toBe(before);
    fail = false; log.append({ type: "ADD_CARD", payload: { cardId: WARRIOR } }); expect(log.state().journey.deck).toHaveLength(1);
    expect(log.state().journey.deck[0].sparkBonus).toBe(1);
    const restored = foldEvents(config, GENESIS, { seq: 1, state: before }, [...log.events()].filter(({ seq }) => seq > 1)); expect(restored.state).toEqual(log.state());
  });
});

describe("Nightmare prevention saved transaction contracts", () => {
  it.each(["unregistered", "nonprevent", "unrelated-copy-source"])("rejects an incoherent prevention source on public LOAD_STATE: %s", (kind) => {
    const before = compound(initial([RAVEN]), [entry("blocked", 3, { isBane: true })]).state;
    const snapshot = clone(before.journey);
    const resolution = (snapshot.siteRuntime[SITE_ID] as ExplorationSiteRuntime).resolution!;
    const receipt = resolution.preventedNightmareGains![0];
    resolution.preventedNightmareGains = [{ ...receipt,
      ...(kind === "unregistered" ? { dreamsignId: testDreamsignId("unknown-preventer") } : {}),
      ...(kind === "nonprevent" ? { dreamsignId: ACORN } : {}),
      ...(kind === "unrelated-copy-source" ? { sourceEntryId: parseDeckEntryId("unrelated-source"), sourceCardId: NIGHTMARE_CARD_ID } : {}),
    }];
    const loaded = apply(before, "LOAD_STATE", { snapshot });
    expect(loaded.outcome).toBe("bounced");
    expect(loaded.state).toBe(before);
    expect(loaded.logRecords).toBeUndefined();
  });
  it.each(["alice", "bob"])("keeps old Nightmares and blocks fresh UUID attempts including legacy isBane payload, actor=%s", (actor) => {
    const before = initial([RAVEN, RAVEN]); before.journey.deck.push(entry("old-bane", 3, { isBane: true }));
    const out = apply(before, "ADD_CARD", { cardId: WARRIOR, isBane: true }, {}, actor);
    expect(out.outcome).toBe("applied"); expect(out.state.journey.deck).toEqual(before.journey.deck);
    expect(out.logRecords).toHaveLength(1); expect(out.logRecords?.[0].fields.target).toMatchObject({ prevented: [{ cardId: NIGHTMARE_CARD_ID, dreamsignId: RAVEN, heldIndex: 0 }] });
    expect(accepted(before, "ADD_CARD", { cardId: WARRIOR }, {}, actor).journey.deck).toHaveLength(2);
  });
  it("removes only the fresh temporary grant while preserving prior modifiers and IDs", () => {
    const seed = initial([RAVEN]); seed.journey.deck.push(entry("old-bane", 3, { isBane: true }));
    const before = { ...seed, journey: { ...seed.journey, battleModifiers: [{ kind: "temporary_nightmare_grant" as const, count: 1, battlesRemaining: 2, addedEntryIds: [parseDeckEntryId("old-bane")], source: "journey_debug_editor" as const }] } };
    const out = apply(before, "PUSH_TEMPORARY_NIGHTMARE_GRANT", { cardId: NIGHTMARE_CARD_ID, count: 2, battlesRemaining: 2, source: "journey_debug_editor" });
    expect(out.outcome).toBe("applied"); expect(out.state.journey.deck).toEqual(before.journey.deck); expect(out.state.journey.battleModifiers).toEqual(before.journey.battleModifiers);
  });
  it("keeps compound costs and benefits while normalizing the exact fresh receipt; gaining or losing protection uses final holdings", () => {
    const before = initial(); before.journey.deck.push(entry("old", 1));
    const out = compound(before, [entry("a", 1), entry("bane", 3, { isBane: true })], [sign(RAVEN), sign(ACORN)]);
    expect(out.state.journey.essence).toBe(13); expect(out.state.journey.deck).toHaveLength(2); expect(out.state.journey.deck[0].keywordModification?.fast).toBe(true);
    expect(out.state.journey.deck[1].sparkBonus).toBe(1);
    expect(out.state.journey.siteRuntime[SITE_ID]).toMatchObject({ resolution: { gainedCardIds: [WARRIOR], gainedEntryIds: ["a"], nightmareGains: [], preventedNightmareGains: [{ entryId: "bane", cardId: NIGHTMARE_CARD_ID, dreamsignId: RAVEN, heldIndex: 0 }] } });
    expect(compound(initial([RAVEN]), [entry("unprotected", 3, { isBane: true })], []).state.journey.deck).toHaveLength(1);
  });
  it("accepts valid, legacy and source-lost receipts on public LOAD_STATE and deterministic replay", () => {
    const out = compound(initial([RAVEN]), [entry("blocked", 3, { isBane: true })]);
    const snapshot = clone(out.state.journey); snapshot.dreamsigns = [];
    expect(apply(out.state, "LOAD_STATE", { snapshot }).outcome).toBe("applied");
    delete (snapshot.siteRuntime[SITE_ID] as ExplorationSiteRuntime).resolution!.preventedNightmareGains;
    expect(apply(out.state, "LOAD_STATE", { snapshot }).outcome).toBe("applied");
    registerDeckContentProvider(null);
    expect(apply(out.state, "LOAD_STATE", { snapshot: clone(out.state.journey) }).outcome).toBe("applied");
    expect(apply(out.state, "LOAD_STATE", { snapshot }).outcome).toBe("applied");
    expect(apply(out.state, "LOAD_STATE", { snapshot: clone(out.state.journey) }).state.journey.siteRuntime[SITE_ID]).toEqual(out.state.journey.siteRuntime[SITE_ID]);
  });
  it.each([null, {}, [{ entryId: 4 }], [{ entryId: "blocked", cardId: WARRIOR, dreamsignId: RAVEN, heldIndex: 0 }], [{ entryId: "blocked", cardId: NIGHTMARE_CARD_ID, dreamsignId: RAVEN, heldIndex: -1 }], [{ entryId: "blocked", cardId: NIGHTMARE_CARD_ID, dreamsignId: RAVEN, heldIndex: .5 }]])("rejects malformed prevention receipt %j atomically", (receipt) => {
    const before = compound(initial([RAVEN]), [entry("blocked", 3, { isBane: true })]).state;
    const copy = clone(before.journey), runtime = copy.siteRuntime[SITE_ID] as ExplorationSiteRuntime;
    const snapshot = { ...copy, siteRuntime: { ...copy.siteRuntime, [SITE_ID]: { ...runtime, resolution: { ...runtime.resolution, preventedNightmareGains: receipt } } } };
    expect(apply(before, "LOAD_STATE", { snapshot }).state).toBe(before);
  });
  it.each(["duplicate", "in-deck", "gained-entry", "nightmare-gain"])("rejects contradictory prevented identity: %s", (kind) => {
    const before = compound(initial([RAVEN]), [entry("blocked", 3, { isBane: true })]).state;
    const snapshot = clone(before.journey), receipt = (snapshot.siteRuntime[SITE_ID] as ExplorationSiteRuntime).resolution!;
    if (kind === "duplicate") receipt.preventedNightmareGains = [...receipt.preventedNightmareGains!, receipt.preventedNightmareGains![0]];
    if (kind === "in-deck") snapshot.deck.push(entry("blocked", 3));
    if (kind === "gained-entry") receipt.gainedEntryIds!.push(parseDeckEntryId("blocked"));
    if (kind === "nightmare-gain") receipt.nightmareGains = [...receipt.nightmareGains!, { entryId: parseDeckEntryId("blocked"), cardId: NIGHTMARE_CARD_ID }];
    expect(apply(before, "LOAD_STATE", { snapshot }).state).toBe(before);
  });
  it("rejects malformed/stale gameplay without modifier logs or random draws", () => {
    const before = initial([ACORN, CRYSTAL, RAVEN], 30), rng = vi.fn(() => 0);
    for (const [type, payload] of [["ADD_CARD", { cardId: "unknown" }], ["DUPLICATE_DECK_ENTRY", { entryId: "gone" }], ["RESOLVE_EXPLORATION_CHOICE", { siteId: "foreign" }]] as const) {
      const out = apply(before, type, payload, { rng }); expect(out.state).toBe(before); expect(out.logRecords).toBeUndefined();
    }
    expect(rng).not.toHaveBeenCalled();
  });
  it.each([{ kind: "warriorSpark", amount: -1 }, { kind: "randomTransfiguration", minimumDeckSize: .5 }] as JourneyDeckEntryEffect[])("rejects invalid catalog numeric clauses %j", (effect) => expect(() => journeyDeckEntry(ACORN, effect)).toThrow(RangeError));
});


describe("actual prepared Exploration additions and public reward models", () => {
  it.each([{ held: [], sparks: { [WARRIOR]: 2, [OTHER]: 4 }, form: null }, { held: [ACORN, CRYSTAL], sparks: { [WARRIOR]: 5, [OTHER]: 9 }, form: "Kindled" }])("presents the effective fresh single replacement for held sources $held", ({ held, sparks, form }) => {
    const old = makeAuguryTestCard({ id: WARRIOR, cardNumber: 1, cardType: "Character", subtype: "Warrior", energyCost: 1, spark: 2 });
    const replacement = makeAuguryTestCard({ id: OTHER, cardNumber: 2, cardType: "Character", subtype: "Warrior", energyCost: 3, spark: 4 });
    const blank = makeAuguryTestCard({ id: BLANK, cardNumber: 4, cardType: "Event", subtype: "" });
    const action = { id: testExplorationActionId("effective-single-replacement"), label: "Synthetic", effectKind: "replace-selected" as const,
      predicate: "character" as const, count: 1, canonicalMechanicId: "replace-deck-entry" as const, selectionPolicyId: "card-fit-quality" as const };
    const base = makeAuguryTestContent({ cards: [old, replacement, blank] });
    const content = { ...base, exploration: { ...base.exploration, encounters: [{ cardId: BLANK, prose: "Synthetic", actions: [action] }] } };
    let before = initial(held, 30); before.journey.deck.push(entry("selected", 1), entry("retained", 1));
    const prepared = buildExplorationRuntime(before.journey, makeSite("Exploration"), content, () => 0, BLANK)!;
    const selected = parseDeckEntryId(Object.keys(prepared.actionOffers[0].replacementCardIdByEntryId)[0]);
    before.journey.siteRuntime[SITE_ID] = prepared;
    registerSiteContentProvider(createSiteContentProvider(content));
    registerJourneyTransfigurationProvider({ resolve: (e) => {
      const card = content.cardDatabase.get(e.cardNumber)!;
      return { cardId: card.id, cardType: card.cardType, subtype: card.subtype, forms: e.transfiguration === null && card.cardType === "Character" ? ["Kindled"] : [] };
    } });
    before = accepted(before, "ADD_CARD", { cardId: OTHER });
    const existingReplacement = last(before.journey.deck).entryId;
    before = accepted(before, "SET_DECK_ENTRY_STAT_OVERRIDE", { entryId: existingReplacement, override: { spark: 77 } });
    const out = apply(before, "RESOLVE_EXPLORATION_CHOICE", { siteId: SITE_ID, actionId: action.id, selectionRulesVersion: SELECTION_RULES_VERSION, selection: { entryIds: [selected] } });
    expect(out.outcome).toBe("applied");
    const fresh = out.state.journey.deck.filter((e) => !before.journey.deck.some((old) => old.entryId === e.entryId));
    expect(fresh).toHaveLength(1);
    const resolved = out.state.journey.siteRuntime[SITE_ID] as ExplorationSiteRuntime;
    expect(resolved.resolution?.gainedEntryIds).toEqual(fresh.map((e) => e.entryId));
    const card = content.cardDatabase.get(fresh[0].cardNumber)!;
    expect(before.journey.deck.filter((e) => e.cardNumber === fresh[0].cardNumber && e.entryId !== selected)).not.toHaveLength(0);
    const model = rewardForResolution(resolved, SITE_ID, out.state.journey, content, null, [action], [], (id) => registry.lookup(id));
    expect(model).toMatchObject({ objects: { cards: [{ cardId: card.id, displaySnapshot: { spark: sparks[card.id] } }] } });
    expect(out.state.journey.deck.filter((e) => before.journey.deck.some((old) => old.entryId === e.entryId))).toEqual(before.journey.deck.filter((e) => e.entryId !== selected));
    if (form !== null) expect(model).toMatchObject({ objects: { cards: [{ transfiguration: { type: form } }] } });
    else expect(fresh[0].transfiguration).toBeNull();
  });

  it.each(["copy-selected-card", "copy-selected-cards", "copy-random-cards", "purge-and-copy"] as const)("presents actual surviving copies after %s Nightmare attempts", (kind) => {
    const warrior = makeAuguryTestCard({ id: WARRIOR, cardNumber: 1, cardType: kind === "copy-random-cards" ? "Event" : "Character", subtype: kind === "copy-random-cards" ? "" : "Warrior" });
    const bane = makeAuguryTestCard({ id: NIGHTMARE_CARD_ID, cardNumber: 3, cardType: "Event", subtype: "", renderedText: "Bane." });
    const actionId = testExplorationActionId(kind);
    const action = { id: actionId, label: "Synthetic choice", effectKind: kind, ...(kind === "copy-random-cards" ? { predicate: "event" as const } : {}),
      ...((kind === "copy-selected-cards" || kind === "copy-random-cards") ? { count: 2 } : { count: 1 }) };
    const base = makeAuguryTestContent({ cards: [warrior, bane] });
    const content = { ...base, exploration: { ...base.exploration, encounters: [{ cardId: WARRIOR, prose: "Synthetic", actions: [action] }] } };
    const before = initial([RAVEN]); before.journey.deck.push(entry("old-bane", 3, { isBane: true }), entry("warrior", 1));
    const site = makeSite("Exploration");
    const prepared = buildExplorationRuntime(before.journey, site, content, () => 0, WARRIOR)!;
    before.journey.siteRuntime[SITE_ID] = prepared;
    registerSiteContentProvider(createSiteContentProvider(content));
    registerJourneyTransfigurationProvider(createJourneyTransfigurationProvider(content));
    const selection = kind === "copy-selected-card" ? { entryIds: ["old-bane"] } : kind === "copy-selected-cards" ? { entryIds: ["old-bane", "warrior"] } : kind === "purge-and-copy" ? { purgeEntryId: "warrior", copyEntryId: "old-bane" } : {};
    const out = apply(before, "RESOLVE_EXPLORATION_CHOICE", { siteId: SITE_ID, actionId, selectionRulesVersion: SELECTION_RULES_VERSION, selection });
    expect(out.outcome).toBe("applied");
    const resolved = out.state.journey.siteRuntime[SITE_ID] as ExplorationSiteRuntime;
    expect(resolved.resolution?.preventedNightmareGains).toMatchObject([{ sourceEntryId: "old-bane", sourceCardId: NIGHTMARE_CARD_ID }]);
    const model = rewardForResolution(resolved, SITE_ID, out.state.journey, content, null, [action], [], (id) => registry.lookup(id));
    expect(model).not.toBeNull();
    expect(model).toMatchObject({ count: kind === "copy-selected-cards" || kind === "copy-random-cards" ? 1 : 0 });
    const forged = structuredClone(resolved); forged.resolution!.preventedNightmareGains = [{ ...forged.resolution!.preventedNightmareGains![0], sourceCardId: WARRIOR }];
    expect(rewardForResolution(forged, SITE_ID, out.state.journey, content, null, [action], [], (id) => registry.lookup(id))).toBeNull();
    expect(apply(out.state, "LOAD_STATE", { snapshot: clone(out.state.journey) }).outcome).toBe("applied");
    if (kind === "purge-and-copy") {
      const victim = clone(out.state.journey), receipt = (victim.siteRuntime[SITE_ID] as ExplorationSiteRuntime).resolution!;
      receipt.selection = { ...receipt.selection, entryIds: ["warrior"] };
      receipt.preventedNightmareGains = [{ ...receipt.preventedNightmareGains![0], sourceEntryId: parseDeckEntryId("warrior") }];
      expect(apply(out.state, "LOAD_STATE", { snapshot: victim }).state).toBe(out.state);
      expect(rewardForResolution(victim.siteRuntime[SITE_ID] as ExplorationSiteRuntime, SITE_ID, victim, content, null, [action], [], (id) => registry.lookup(id))).toBeNull();
    }
    for (const missing of ["sourceEntryId", "sourceCardId", "both"] as const) {
      const stripped = clone(out.state.journey), resolved = (stripped.siteRuntime[SITE_ID] as ExplorationSiteRuntime).resolution!;
      const { sourceEntryId, sourceCardId, ...receipt } = resolved.preventedNightmareGains![0];
      resolved.preventedNightmareGains = [{ ...receipt, ...(missing === "sourceEntryId" ? { sourceCardId } : {}), ...(missing === "sourceCardId" ? { sourceEntryId } : {}) }];
      const rejected = apply(out.state, "LOAD_STATE", { snapshot: stripped });
      expect(rejected.state).toBe(out.state); expect(rejected.logRecords).toBeUndefined();
      expect(rewardForResolution(stripped.siteRuntime[SITE_ID] as ExplorationSiteRuntime, SITE_ID, stripped, content, null, [action], [], (id) => registry.lookup(id))).toBeNull();
    }
    if (kind === "copy-selected-cards") {
      const forged = clone(out.state.journey), receipt = (forged.siteRuntime[SITE_ID] as ExplorationSiteRuntime).resolution!;
      receipt.preventedNightmareGains = [{ ...receipt.preventedNightmareGains![0], sourceEntryId: parseDeckEntryId("warrior") }];
      const rng = vi.fn(() => 0), rejected = apply(out.state, "LOAD_STATE", { snapshot: forged }, { rng });
      expect(rejected.state).toBe(out.state); expect(rejected.logRecords).toBeUndefined(); expect(rng).not.toHaveBeenCalled();
      expect(rewardForResolution(forged.siteRuntime[SITE_ID] as ExplorationSiteRuntime, SITE_ID, forged, content, null, [action], [], (id) => registry.lookup(id))).toBeNull();
    }
    if (kind === "copy-selected-card") {
      const snapshot = clone(out.state.journey), rng = vi.fn(() => 0);
      for (const availability of ["absent", "unresolved", "throws"] as const) {
        const resolveCardNumber = vi.fn(() => { if (availability === "throws") throw new Error("synthetic identity unavailable"); return null; });
        registerDeckContentProvider(availability === "absent" ? null : { resolveCardNumber, resolveDreamsign: sign });
        const rejected = apply(out.state, "LOAD_STATE", { snapshot }, { rng });
        expect(rejected.state).toBe(out.state); expect(rejected.logRecords).toBeUndefined(); expect(rng).not.toHaveBeenCalled();
      }
      install();
      expect(apply(out.state, "LOAD_STATE", { snapshot }).outcome).toBe("applied");
      let modified = accepted(out.state, "TRANSFIGURE_CARD", { entryId: "old-bane", transfiguration: "Enduring" });
      modified = accepted(modified, "SET_DECK_ENTRY_TYPE", { entryId: "old-bane", typeChange: { predicateId: parseCardTypeChangePredicateId("changed-source"), cardType: "Character", subtype: parseCardSubtype("Warrior"), label: "Synthetic" } });
      modified = accepted(modified, "SET_DECK_ENTRY_KEYWORDS", { entryId: "old-bane", keywords: { fast: true } });
      modified = accepted(modified, "SET_DECK_ENTRY_STAT_OVERRIDE", { entryId: "old-bane", override: { spark: 9 } });
      expect(apply(modified, "LOAD_STATE", { snapshot: clone(modified.journey) }).outcome).toBe("applied");
    }
    const sourceLost = accepted(out.state, "REMOVE_DREAMSIGN", { dreamsignId: RAVEN });
    const sourcePurged = accepted(sourceLost, "REMOVE_DECK_ENTRY", { entryId: "old-bane" });
    const resolveCardNumber = vi.fn(() => { throw new Error("gone source needs no identity lookup"); });
    registerDeckContentProvider({ resolveCardNumber, resolveDreamsign: sign });
    expect(apply(sourcePurged, "LOAD_STATE", { snapshot: clone(sourcePurged.journey) }).outcome).toBe("applied");
    expect(resolveCardNumber).not.toHaveBeenCalled();
    install();
  });
  it("loads the copied Nightmare companion rather than the purged target of a prepared compound", () => {
    const ordinary = makeAuguryTestCard({ id: OTHER, cardNumber: 2, cardType: "Event", subtype: "", energyCost: 2, isFast: false });
    const bane = makeAuguryTestCard({ id: NIGHTMARE_CARD_ID, cardNumber: 3, cardType: "Event", subtype: "", energyCost: 2, isFast: false });
    const action = { id: testExplorationActionId("compound-companion-copy"), label: "Synthetic", effectKind: "purge-one-transfigure-and-copy-others" as const,
      canonicalMechanicId: "transfigure-deck-entry" as const, selectionPolicyId: "uniform" as const, offerCount: 4 as const, transfiguration: "Enduring" as const };
    const base = makeAuguryTestContent({ cards: [ordinary, bane] });
    const content = { ...base, exploration: { ...base.exploration, encounters: [{ cardId: OTHER, prose: "Synthetic", actions: [action] }] } };
    const before = initial([RAVEN]); before.journey.deck.push(entry("purged", 2), entry("companion", 3, { isBane: true }), entry("other-a", 2), entry("other-b", 2));
    const runtime = buildExplorationRuntime(before.journey, makeSite("Exploration"), content, () => 0, OTHER)!;
    before.journey.siteRuntime[SITE_ID] = runtime;
    registerSiteContentProvider(createSiteContentProvider(content)); registerJourneyTransfigurationProvider(createJourneyTransfigurationProvider(content));
    const intent = { siteId: SITE_ID, actionId: action.id, selectionRulesVersion: SELECTION_RULES_VERSION, selection: { entryIds: ["purged"] } };
    const out = apply(before, "RESOLVE_EXPLORATION_CHOICE", intent);
    expect(out.outcome).toBe("applied");
    const resolved = out.state.journey.siteRuntime[SITE_ID] as ExplorationSiteRuntime;
    expect(resolved.resolution?.preventedNightmareGains).toMatchObject([{ sourceEntryId: "companion", sourceCardId: NIGHTMARE_CARD_ID }]);
    expect(apply(out.state, "LOAD_STATE", { snapshot: clone(out.state.journey) }).outcome).toBe("applied");
    expect(apply(before, "RESOLVE_EXPLORATION_CHOICE", intent).state).toEqual(out.state);
    expect(rewardForResolution(resolved, SITE_ID, out.state.journey, content, null, [action], [], (id) => registry.lookup(id))).toMatchObject({ kind: "compound-card-mutation" });
    for (const source of ["purged", "unrelated", "wrong-printing", "missing-offer", "unsupported-offer", "pairless"] as const) {
      const forged = clone(out.state.journey), runtime = forged.siteRuntime[SITE_ID] as ExplorationSiteRuntime;
      const receipt = runtime.resolution!.preventedNightmareGains![0];
      if (source === "missing-offer") runtime.actionOffers = [];
      else if (source === "unsupported-offer") runtime.actionOffers = [{ ...runtime.actionOffers[0], canonicalMechanicId: "gain-card", preparation: undefined }];
      else if (source === "pairless") {
        const { sourceEntryId: _entry, sourceCardId: _card, ...scalar } = receipt;
        runtime.resolution!.preventedNightmareGains = [scalar];
      } else runtime.resolution!.preventedNightmareGains = [{ ...receipt, ...(source === "wrong-printing" ? { sourceCardId: OTHER } : { sourceEntryId: parseDeckEntryId(source) }) }];
      const rejected = apply(out.state, "LOAD_STATE", { snapshot: forged });
      expect(rejected.state).toBe(out.state); expect(rejected.logRecords).toBeUndefined();
    }
    const lost = accepted(out.state, "REMOVE_DREAMSIGN", { dreamsignId: RAVEN });
    const purged = accepted(lost, "REMOVE_DECK_ENTRY", { entryId: "companion" });
    expect(apply(purged, "LOAD_STATE", { snapshot: clone(purged.journey) }).outcome).toBe("applied");
  });
  it.each(["selected", "random", "compound", "single"] as const)("binds declared physical copy occurrences for %s", (kind) => {
    const bane = makeAuguryTestCard({ id: NIGHTMARE_CARD_ID, cardNumber: 3, cardType: "Event", subtype: "", energyCost: 2, isFast: false });
    const ordinary = makeAuguryTestCard({ id: OTHER, cardNumber: 2, cardType: "Event", subtype: "", energyCost: 2, isFast: false });
    const action = { id: testExplorationActionId(`occurrences-${kind}`), label: "Synthetic", effectText: "Synthetic effect",
      effectKind: kind === "selected" ? "copy-selected-cards" as const : kind === "random" ? "copy-random-cards" as const : kind === "compound" ? "purge-one-transfigure-and-copy-others" as const : "copy-selected-card" as const,
      ...(kind === "compound" ? { offerCount: 4, transfiguration: "Enduring" as const } : { count: kind === "single" ? 3 : 2 }),
      ...(kind === "random" ? { predicate: "event" as const } : {}) };
    const base = makeAuguryTestContent({ cards: [bane, ordinary] });
    const content = { ...base, exploration: { ...base.exploration, encounters: [{ cardId: OTHER, prose: "Synthetic", actions: [action] }] } };
    const before = initial([RAVEN]); before.journey.deck.push(entry("a", 3, { isBane: true }));
    if (kind !== "single") before.journey.deck.push(entry("b", 3, { isBane: true }));
    if (kind === "compound") before.journey.deck.push(entry("c", 3, { isBane: true }), entry("purged", 2));
    before.journey.siteRuntime[SITE_ID] = buildExplorationRuntime(before.journey, makeSite("Exploration"), content, () => 0, OTHER)!;
    registerSiteContentProvider(createSiteContentProvider(content)); registerJourneyTransfigurationProvider(createJourneyTransfigurationProvider(content));
    const selection = kind === "random" ? {} : { entryIds: (kind === "compound" ? ["purged"] : kind === "single" ? ["a"] : ["a", "b"]).map(parseDeckEntryId) };
    const intent = { siteId: SITE_ID, actionId: action.id, selectionRulesVersion: SELECTION_RULES_VERSION, selection };
    const out = apply(before, "RESOLVE_EXPLORATION_CHOICE", intent); expect(out.outcome).toBe("applied");
    const resolved = out.state.journey.siteRuntime[SITE_ID] as ExplorationSiteRuntime, rows = resolved.resolution!.preventedNightmareGains!;
    expect(rows).toHaveLength(kind === "compound" || kind === "single" ? 3 : 2);
    expect(apply(out.state, "LOAD_STATE", { snapshot: clone(out.state.journey) }).outcome).toBe("applied");
    expect(apply(before, "RESOLVE_EXPLORATION_CHOICE", intent).state).toEqual(out.state);
    const model = rewardForResolution(resolved, SITE_ID, out.state.journey, content, null, [action], [], (id) => registry.lookup(id));
    expect(model).toMatchObject({ kind: kind === "compound" ? "compound-card-mutation" : kind === "single" ? "card-copies" : "card-copies-multiple" });
    if (kind !== "single") {
      const faults = kind === "selected" ? ["selection"] : ["target", "target-id", "targets", ...(kind === "compound" ? ["victim", "two-victims"] : [])];
      for (const fault of faults) {
        const metadata = JSON.parse(JSON.stringify(resolved)) as { resolution: { selection: { entryIds: unknown[] } }; actionOffers: { preparation: { plan: { targets?: unknown[] } } }[] };
        if (fault === "selection") metadata.resolution.selection.entryIds.push(17);
        else if (fault === "victim") metadata.resolution.selection.entryIds = [17];
        else if (fault === "two-victims") metadata.resolution.selection.entryIds.push(parseDeckEntryId("other-victim"));
        else if (fault === "targets") delete metadata.actionOffers[0].preparation.plan.targets;
        else metadata.actionOffers[0].preparation.plan.targets!.push(fault === "target" ? null : { entryId: 17, cardId: NIGHTMARE_CARD_ID });
        const snapshot = { ...clone(out.state.journey), siteRuntime: { ...out.state.journey.siteRuntime, [SITE_ID]: metadata } };
        const rng = vi.fn(() => 0), rejected = apply(out.state, "LOAD_STATE", { snapshot }, { rng });
        expect(rejected.state).toBe(out.state); expect(rejected.logRecords).toBeUndefined(); expect(rng).not.toHaveBeenCalled();
      }
      const forged = clone(out.state.journey), runtime = forged.siteRuntime[SITE_ID] as ExplorationSiteRuntime;
      runtime.resolution!.preventedNightmareGains = rows.map((row, index) => index === 1 ? { ...row, sourceEntryId: rows[0].sourceEntryId } : row);
      const rng = vi.fn(() => 0), rejected = apply(out.state, "LOAD_STATE", { snapshot: forged }, { rng });
      expect(rejected.state).toBe(out.state); expect(rejected.logRecords).toBeUndefined(); expect(rng).not.toHaveBeenCalled();
      expect(rewardForResolution(runtime, SITE_ID, forged, content, null, [action], [], (id) => registry.lookup(id))).toBeNull();
    }
    if (kind === "selected") {
      const rejected = apply(before, "RESOLVE_EXPLORATION_CHOICE", { ...intent, selection: { entryIds: [parseDeckEntryId("a"), parseDeckEntryId("a")] } });
      expect(rejected.state).toBe(before); expect(rejected.logRecords).toBeUndefined();
    }
    let gone = accepted(out.state, "REMOVE_DREAMSIGN", { dreamsignId: RAVEN });
    for (const source of new Set(rows.flatMap((row) => row.sourceEntryId === undefined ? [] : [row.sourceEntryId]))) gone = accepted(gone, "REMOVE_DECK_ENTRY", { entryId: source });
    expect(apply(gone, "LOAD_STATE", { snapshot: clone(gone.journey) }).outcome).toBe("applied");
  });
  it("keeps a real prepared compound benefit and zero actual Nightmare cards in its reward model", () => {
    const warrior = makeAuguryTestCard({ id: WARRIOR, cardNumber: 1, cardType: "Character", subtype: "Warrior" });
    const bane = makeAuguryTestCard({ id: NIGHTMARE_CARD_ID, cardNumber: 3, cardType: "Event", subtype: "", renderedText: "Bane." });
    const actionId = testExplorationActionId("fast-with-banes");
    const action = { id: actionId, label: "Synthetic", effectKind: "make-predicate-fast-and-gain-nightmares" as const, predicate: "character" as const, nightmareCount: 2 };
    const base = makeAuguryTestContent({ cards: [warrior, bane] });
    const content = { ...base, exploration: { ...base.exploration, encounters: [{ cardId: WARRIOR, prose: "Synthetic", actions: [action] }] } };
    const before = initial([RAVEN]); before.journey.deck.push(entry("warrior", 1));
    before.journey.siteRuntime[SITE_ID] = buildExplorationRuntime(before.journey, makeSite("Exploration"), content, () => 0, WARRIOR)!;
    registerSiteContentProvider(createSiteContentProvider(content)); registerJourneyTransfigurationProvider(createJourneyTransfigurationProvider(content));
    const out = apply(before, "RESOLVE_EXPLORATION_CHOICE", { siteId: SITE_ID, actionId, selectionRulesVersion: SELECTION_RULES_VERSION, selection: {} });
    expect(out.outcome).toBe("applied"); expect(out.state.journey.deck).toHaveLength(1); expect(out.state.journey.deck[0].keywordModification?.fast).toBe(true);
    const resolved = out.state.journey.siteRuntime[SITE_ID] as ExplorationSiteRuntime;
    expect(rewardForResolution(resolved, SITE_ID, out.state.journey, content, null, [action], [], (id) => registry.lookup(id))).toMatchObject({ kind: "compound-card-mutation", nightmares: [], keywordChanges: [{ entryId: "warrior" }] });
    expect(resolved.resolution?.preventedNightmareGains).toHaveLength(2);
  });
  it.each(["missing-source", "wrong-source-card", "same-entry"])("rejects malformed saved copy provenance %s", (kind) => {
    const before = compound(initial([RAVEN]), [entry("blocked", 3, { isBane: true })]).state;
    const snapshot = clone(before.journey), receipt = (snapshot.siteRuntime[SITE_ID] as ExplorationSiteRuntime).resolution!;
    receipt.preventedNightmareGains = [{ ...receipt.preventedNightmareGains![0], sourceEntryId: parseDeckEntryId(kind === "same-entry" ? "blocked" : "source"), sourceCardId: kind === "missing-source" ? undefined : kind === "wrong-source-card" ? WARRIOR : NIGHTMARE_CARD_ID }];
    expect(apply(before, "LOAD_STATE", { snapshot }).state).toBe(before);
  });
  it.each([[], [ACORN], [CRYSTAL], [ACORN, CRYSTAL]])("presents actual fresh entry bonuses and forms for held sources %j", (...held: DreamsignId[]) => {
    const warrior = makeAuguryTestCard({ id: WARRIOR, cardNumber: 1, cardType: "Character", subtype: "Warrior", spark: 2 });
    const blank = makeAuguryTestCard({ id: BLANK, cardNumber: 4, cardType: "Event", subtype: "" });
    const actionId = testExplorationActionId("physical-reward-model");
    const action = { id: actionId, label: "Synthetic", effectKind: "gain-card" as const, cardId: WARRIOR };
    const base = makeAuguryTestContent({ cards: [warrior, blank] });
    const content = { ...base, exploration: { ...base.exploration, encounters: [{ cardId: BLANK, prose: "Synthetic", actions: [action] }] } };
    const before = initial(held, 29);
    before.journey.siteRuntime[SITE_ID] = buildExplorationRuntime(before.journey, makeSite("Exploration"), content, () => 0, BLANK)!;
    registerSiteContentProvider(createSiteContentProvider(content));
    const out = apply(before, "RESOLVE_EXPLORATION_CHOICE", { siteId: SITE_ID, actionId, selectionRulesVersion: SELECTION_RULES_VERSION, selection: {} });
    expect(out.outcome).toBe("applied");
    const resolved = out.state.journey.siteRuntime[SITE_ID] as ExplorationSiteRuntime;
    const model = rewardForResolution(resolved, SITE_ID, out.state.journey, content, null, [action], [], (id) => registry.lookup(id));
    expect(model).toMatchObject({ objects: { cards: [{ cardId: WARRIOR, displaySnapshot: { spark: (held.includes(CRYSTAL) ? 4 : 2) + (held.includes(ACORN) ? 1 : 0) } }] } });
    if (held.includes(CRYSTAL)) expect(model).toMatchObject({ objects: { cards: [{ transfiguration: { type: "Kindled" } }] } });
    else expect(last(out.state.journey.deck)?.transfiguration).toBeNull();
    // Legacy metadata retains its catalog display, and mismatched UUIDs cannot select another held object.
    for (const gainedEntryIds of [undefined, [parseDeckEntryId("missing")], [parseDeckEntryId("old-0")]]) {
      const legacy = { ...resolved, resolution: { ...resolved.resolution!, gainedEntryIds } };
      expect(rewardForResolution(legacy, SITE_ID, out.state.journey, content, null, [action], [], (id) => registry.lookup(id))).toMatchObject({ objects: { cards: [{ cardId: WARRIOR, displaySnapshot: { spark: 2 } }] } });
    }
  });

});
