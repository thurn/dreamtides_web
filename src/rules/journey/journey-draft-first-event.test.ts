import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalLog, type LocalLogRecord } from "../../eventlog/local-log";
import { foldEvents } from "../../eventlog/fold";
import type { EngineConfig, GameEvent, Genesis } from "../../eventlog/types";
import { makeAuguryTestCard } from "../../journey_v2/testing/fixtures";
import { TEST_CONTENT_CONFIG } from "../../testing/journey-genesis";
import { EVENT_CARD_SUBTYPE } from "../../types/card-identity";
import { parseDeckEntryId, parseSiteId } from "../../types/identifiers";
import { testCardId, testDreamsignId, testEventActor } from "../../types/test-identities";
import type { DraftConfig } from "../../types/draft";
import type { JourneyDraftEffect, JourneyState } from "../../types/journey";
import type { FoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import { registerDeckContentProvider } from "./deck";
import { registerDraftContentProvider, type DraftContentProvider } from "./draft";
import { ctx, makeSite, NODE_ID, poolDraftState, stateWithDraftSites } from "./draft-fixtures";
import { journeyDraft } from "./journey-draft";
import { journeyTransfiguration, registerJourneyTransfigurationProvider, type JourneyTransfigurationProvider } from "./journey-transfiguration";
import { createJourneyModifierRegistry } from "./modifier-registry";
import { testDraftContentProvider } from "./test-content-providers";
import { registerSiteContentProvider } from "./sites";
import { fakeProvider } from "./sites-fixtures";

const FIXED = testDreamsignId("draft-first-event"), TOME = testDreamsignId("draft-event-copy"), COUNT = testDreamsignId("draft-extra-choice");
const SITE = parseSiteId("site-a"), OTHER_SITE = parseSiteId("site-b"), ACTOR = testEventActor("first-event-owner");
const registry = createJourneyModifierRegistry([
  journeyDraft(FIXED, { kind: "firstDraftEventTransfiguration", type: "Inspired" }),
  journeyDraft(COUNT, { kind: "additionalDraftChoices", additionalCards: 1 }),
  journeyTransfiguration(TOME, { kind: "copyTransfiguredEvent" }),
]);
const cards = Array.from({ length: 40 }, (_, i) => makeAuguryTestCard({ id: testCardId(`first-event-${i + 1}`), cardNumber: i + 1,
  cardType: i === 0 ? "Character" : "Event", subtype: i === 0 ? "" : EVENT_CARD_SUBTYPE }));
const database = new Map(cards.map((card) => [card.cardNumber, card]));
const copies = Object.fromEntries(cards.map((card) => [String(card.cardNumber), 1]));
const config: DraftConfig = { packSize: 1, sitePickCount: 3, rarityCaps: [] };
const sign = (id: typeof FIXED) => ({ id, name: "Synthetic shared display", effectDescription: "" });
function draftProvider(patch: Partial<DraftContentProvider> = {}): DraftContentProvider {
  return testDraftContentProvider({ resolveCardNumber: (id) => cards.find((card) => card.id === id)?.cardNumber ?? null,
    cardDatabase: () => database, draftConfigFor: () => config, ...patch });
}
const canonical: JourneyTransfigurationProvider = { resolve(entry) {
  const card = database.get(entry.cardNumber);
  return card === undefined ? null : { cardId: card.id, cardType: entry.typeChange?.cardType ?? card.cardType,
    subtype: card.subtype, forms: entry.cardNumber === 3 || entry.transfiguration !== null ? [] : ["Inspired", "Enduring"] };
} };
function fixture(first = 2, ids = [FIXED], patch: Partial<JourneyState> = {}): FoldState {
  return stateWithDraftSites(poolDraftState({ currentOffer: [first], currentOfferCount: 1, siteFirstEventEntryId: null,
    siteShownCardNumbers: [first], draftPoolCopiesByCard: copies,
    remainingCopiesByCard: Object.fromEntries(Object.entries(copies).filter(([number]) => Number(number) !== first)),
    openingDraftOffers: { "2": [first === 2 ? 4 : 2], "3": [5] } }), {
    dreamsigns: ids.map(sign), screen: { type: "site", siteId: SITE }, ...patch,
  });
}
const event = (type: GameEvent["type"], payload: Record<string, unknown>): GameEvent =>
  ({ type, payload, actor: ACTOR, clientTimestamp: ctx().timestamp });
const apply = (state: FoldState, type: GameEvent["type"], payload: Record<string, unknown> = {}, context = ctx()) =>
  reduceGameEvent(state, event(type, payload), context, registry);
function pickPayload(state: FoldState) {
  const number = state.journey.draftState!.currentOffer[0];
  return { packIndex: 0, cardId: database.get(number)!.id };
}
const pick = (state: FoldState, context = ctx()) => apply(state, "PICK_DRAFT_CARD", pickPayload(state), context);
const last = (state: FoldState) => state.journey.deck[state.journey.deck.length - 1];
function logOf(before: FoldState) {
  const engine: EngineConfig<FoldState> = { ...GAME_ENGINE_CONFIG, genesisState: () => before,
    reducer: (state, e, context) => reduceGameEvent(state, e, context, registry) };
  const genesis: Genesis = { seed: before.journey.seed, reducerVersion: "test", createdAt: 0, contentConfig: TEST_CONTENT_CONFIG };
  const log = createLocalLog({ config: engine, genesis, localActor: ACTOR, now: () => ctx().timestamp, devMode: false });
  const records: LocalLogRecord<FoldState>[] = []; log.subscribe((record) => records.push(record));
  return { log, records, replay: () => foldEvents(engine, genesis, { seq: 0, state: before }, [...log.events()], { devMode: false }).state };
}
beforeEach(() => {
  registerDraftContentProvider(draftProvider()); registerJourneyTransfigurationProvider(canonical);
  registerDeckContentProvider({ resolveCardNumber: (id) => cards.find((card) => card.id === id)?.cardNumber ?? null, resolveDreamsign: sign });
});
afterEach(() => { registerDraftContentProvider(null); registerJourneyTransfigurationProvider(null); registerDeckContentProvider(null); registerSiteContentProvider(null); });

describe("first successful Draft Event public contracts", () => {
  it("skips Characters, forms the first physical Event and leaves the second Event unformed", () => {
    const before = fixture(1), saved = structuredClone(before), character = pick(before).state;
    expect(character.journey.draftState?.siteFirstEventEntryId).toBeNull(); expect(last(character).transfiguration).toBeNull();
    const first = pick(character), id = last(first.state).entryId;
    expect(first.outcome).toBe("applied"); expect(last(first.state).transfiguration).toBe("Inspired");
    expect(first.state.journey.draftState?.siteFirstEventEntryId).toBe(id);
    expect(first.logRecords?.filter((r) => r.fields.dreamsignId === FIXED)).toHaveLength(1);
    expect(first.logRecords?.find((r) => r.fields.dreamsignId === FIXED)?.fields.target).toMatchObject({
      siteIds: [SITE], transfigurations: [{ entryId: id, cardId: cards[1].id, type: "Inspired" }],
    });
    const second = pick(first.state).state;
    expect(last(second).transfiguration).toBeNull(); expect(second.journey.draftState?.siteFirstEventEntryId).toBe(id);
    expect(before).toEqual(saved);
  });

  it.each(["preformed", "ineligible", "source-absent"])("consumes the actual first Event despite %s and source loss/regain", (kind) => {
    const before = fixture(kind === "ineligible" ? 3 : 2, kind === "source-absent" ? [] : [FIXED]);
    if (kind === "preformed") before.journey.draftState!.currentOfferTransfigurations = { "2": "Enduring" };
    const first = pick(before).state, id = last(first).entryId;
    expect(first.journey.draftState?.siteFirstEventEntryId).toBe(id);
    expect(last(first).transfiguration).toBe(kind === "preformed" ? "Enduring" : null);
    let state = kind === "source-absent" ? first : apply(first, "REMOVE_DREAMSIGN", { dreamsignId: FIXED }).state;
    state = apply(state, "ADD_DREAMSIGN", { dreamsignId: FIXED }).state;
    const second = pick(state);
    expect(second.outcome).toBe("applied"); expect(last(second.state).transfiguration).toBeNull();
    expect(second.state.journey.draftState?.siteFirstEventEntryId).toBe(id);
  });

  it("tracks source-absent Events with only the Draft provider, while canonical effective type takes precedence", () => {
    registerJourneyTransfigurationProvider(null);
    const first = pick(fixture(2, [])).state;
    expect(first.journey.draftState?.siteFirstEventEntryId).toBe(last(first).entryId);
    registerJourneyTransfigurationProvider({ resolve: (entry) => {
      const card = canonical.resolve(entry)!;
      return { ...card, cardType: entry.cardNumber === 1 ? "Event" : "Character" };
    } });
    expect(pick(fixture(2)).state.journey.draftState?.siteFirstEventEntryId).toBeNull();
    const changed = pick(fixture(1));
    expect(changed.state.journey.draftState?.siteFirstEventEntryId).toBe(last(changed.state).entryId);
    expect(last(changed.state).transfiguration).toBe("Inspired");
  });

  it("retains consumed history through purge, reroll, same-site entry, reload and a distinct visit reset", () => {
    const first = pick(fixture()).state, id = last(first).entryId;
    registerSiteContentProvider(fakeProvider);
    const purgeSite = makeSite("first-event-purge", "Purge"), node = first.journey.atlas.nodes[NODE_ID];
    const atPurge: FoldState = { ...first, journey: { ...first.journey, essence: 500,
      screen: { type: "site", siteId: purgeSite.id },
      atlas: { ...first.journey.atlas, nodes: { ...first.journey.atlas.nodes, [NODE_ID]: { ...node, sites: [...node.sites, purgeSite] } } } } };
    const purged = apply(atPurge, "PURGE_DECK_CARDS", { siteId: purgeSite.id, entryIds: [id] }).state;
    expect(purged.journey.deck.some((entry) => entry.entryId === id)).toBe(false);
    expect(purged.journey.draftState?.siteFirstEventEntryId).toBe(id);
    const returned = apply(purged, "ENTER_SITE", { siteId: SITE }).state;
    const rerolled = apply(returned, "REROLL_DRAFT_OFFER", { siteId: SITE }).state;
    expect(rerolled.journey.draftState?.siteFirstEventEntryId).toBe(id);
    expect(apply(rerolled, "ENTER_DRAFT_SITE", { siteId: SITE }).state).toBe(rerolled);
    const loaded = apply(rerolled, "LOAD_STATE", { snapshot: JSON.parse(JSON.stringify(rerolled.journey)) });
    expect(loaded.outcome).toBe("applied"); expect(loaded.state.journey.draftState).toEqual(rerolled.journey.draftState);
    const advanced = pick(loaded.state).state;
    expect(last(advanced).transfiguration).toBeNull();
    const entered = apply(advanced, "ENTER_DRAFT_SITE", { siteId: OTHER_SITE }, ctx({ rng: () => 0.5 }));
    expect(entered.outcome).toBe("applied"); expect(entered.state.journey.draftState?.siteFirstEventEntryId).toBeNull();
    const next = pick(entered.state).state;
    expect(next.journey.draftState?.siteFirstEventEntryId).toBe(last(next).entryId); expect(last(next).transfiguration).toBe("Inspired");
  });

  it.each([[TOME, FIXED], [FIXED, TOME], [TOME, FIXED, FIXED]])("delivers one genuine transformation and one preformed same-UUID copy in held order %j", (...ids) => {
    const before = fixture(2, ids);
    before.journey.deck = [{ entryId: parseDeckEntryId("existing-same-uuid"), cardNumber: 2, transfiguration: null, isBane: false }];
    const result = pick(before), added = result.state.journey.deck.slice(before.journey.deck.length);
    expect(result.state.journey.deck[0]).toEqual(before.journey.deck[0]);
    expect(result.outcome).toBe("applied"); expect(added).toHaveLength(2);
    expect(added.every((entry) => entry.cardNumber === 2 && entry.transfiguration === "Inspired")).toBe(true);
    expect(new Set(added.map((entry) => entry.entryId)).size).toBe(2);
    expect(result.state.journey.draftState?.siteFirstEventEntryId).toBe(added[0].entryId);
    expect(result.logRecords?.filter((record) => record.fields.dreamsignId === FIXED)).toHaveLength(1);
    expect(result.logRecords?.filter((record) => record.fields.dreamsignId === TOME)).toHaveLength(1);
  });

  it.each(["preformed", "ineligible"])("gives Tome no transformation occasion for a %s first Event", (kind) => {
    const before = fixture(kind === "ineligible" ? 3 : 2, [TOME, FIXED]);
    if (kind === "preformed") before.journey.draftState!.currentOfferTransfigurations = { "2": "Enduring" };
    const result = pick(before);
    expect(result.state.journey.deck).toHaveLength(before.journey.deck.length + 1); expect(result.logRecords).toBeUndefined();
  });

  it("tracks an Event first encountered on the final pick after two Characters", () => {
    registerJourneyTransfigurationProvider({ resolve: (entry) => {
      const card = canonical.resolve(entry)!;
      return entry.cardNumber === 6 ? { ...card, cardType: "Character" } : card;
    } });
    const before = fixture(1); before.journey.draftState!.openingDraftOffers = { "2": [6], "3": [2] };
    const second = pick(pick(before).state).state;
    expect(second.journey.draftState?.siteFirstEventEntryId).toBeNull();
    const rng = vi.fn(() => 0), result = pick(second, ctx({ rng }));
    expect(result.outcome).toBe("applied"); expect(last(result.state).transfiguration).toBe("Inspired");
    expect(result.state.journey.draftState?.siteFirstEventEntryId).toBe(last(result.state).entryId);
    expect(result.state.journey.draftState?.currentOffer).toEqual([]); expect(rng).not.toHaveBeenCalled();
  });

  it("forms a final pick with zero RNG and keeps existing count quotes when mixed with the new clause", () => {
    registerDraftContentProvider(draftProvider({ draftConfigFor: () => ({ ...config, sitePickCount: 1 }) }));
    const rng = vi.fn(() => 0), result = pick(fixture(), ctx({ rng }));
    expect(result.outcome).toBe("applied"); expect(last(result.state).transfiguration).toBe("Inspired");
    expect(result.state.journey.draftState?.currentOffer).toEqual([]); expect(rng).not.toHaveBeenCalled();
    const before = fixture(2, [FIXED, COUNT]); before.journey.draftState!.activeSiteId = null;
    const entered = apply(before, "ENTER_DRAFT_SITE", { siteId: SITE });
    expect(entered.state.journey.draftState?.currentOfferCount).toBe(2);
    expect(entered.state.journey.draftState?.currentOffer).toHaveLength(2);
  });

  it("rejects invalid UUIDs, pack positions and duplicates atomically", () => {
    const before = fixture(), saved = structuredClone(before);
    for (const payload of [{ cardId: "bad", packIndex: 0 }, { cardId: cards[2].id, packIndex: 0 }, { cardId: cards[1].id, packIndex: -1 }]) {
      expect(apply(before, "PICK_DRAFT_CARD", payload).state).toBe(before);
    }
    const first = pick(before).state;
    expect(apply(first, "PICK_DRAFT_CARD", pickPayload(before)).state).toBe(first);
    expect(before).toEqual(saved);
  });

  it.each(["next-offer-error", "incomplete-offer", "unknown-type", "missing-form-metadata", "form-provider-error", "occurrence-provider-error"])("rolls back entry/history/log on %s, then retries and replays the successful event", (failure) => {
    const before = fixture(), saved = structuredClone(before), { log, records, replay } = logOf(before);
    if (failure === "next-offer-error") registerDraftContentProvider(draftProvider({ cardDatabase: () => { throw new Error("synthetic next offer failure"); } }));
    if (failure === "incomplete-offer") registerDraftContentProvider(draftProvider({ draftConfigFor: () => ({ ...config, packSize: 50 }) }));
    if (failure === "unknown-type") {
      registerJourneyTransfigurationProvider(null); registerDraftContentProvider(draftProvider({ cardDatabase: () => new Map() }));
    }
    if (failure === "missing-form-metadata") registerJourneyTransfigurationProvider(null);
    if (failure === "form-provider-error") registerJourneyTransfigurationProvider({ resolve: () => { throw new Error("synthetic effective lookup failure"); } });
    if (failure === "occurrence-provider-error") registerJourneyTransfigurationProvider({ resolve: (entry) => {
      if (entry.transfiguration !== null) throw new Error("synthetic occurrence metadata failure");
      return canonical.resolve(entry);
    } });
    const intent = { type: "PICK_DRAFT_CARD" as const, payload: pickPayload(before) };
    log.append(intent);
    expect(records[0].outcome).toBe("bounced"); expect(records[0].logRecords).toBeUndefined();
    expect(log.state()).toBe(before); expect(replay()).toEqual(before); expect(before).toEqual(saved);
    registerDraftContentProvider(draftProvider()); registerJourneyTransfigurationProvider(canonical);
    log.append(intent);
    expect(records[1].outcome).toBe("applied"); expect(log.state().journey.deck).toHaveLength(before.journey.deck.length + 1);
    // Failed events stay no-ops when replay starts from their settled checkpoint.
    const successful = log.events().filter((record) => record.seq > 1);
    const engine: EngineConfig<FoldState> = { ...GAME_ENGINE_CONFIG, reducer: (state, e, context) => reduceGameEvent(state, e, context, registry) };
    const genesis: Genesis = { seed: before.journey.seed, reducerVersion: "test", createdAt: 0, contentConfig: TEST_CONTENT_CONFIG };
    expect(foldEvents(engine, genesis, { seq: 1, state: before }, successful).state).toEqual(log.state());
  });

  it("reconstructs marker, exact forms, physical copies and UUID diagnostics from the real event log", () => {
    const before = fixture(1, [TOME, FIXED]), { log, records, replay } = logOf(before);
    log.append({ type: "PICK_DRAFT_CARD", payload: pickPayload(log.state()) });
    log.append({ type: "PICK_DRAFT_CARD", payload: pickPayload(log.state()) });
    const first = log.state().journey.draftState!.siteFirstEventEntryId;
    log.append({ type: "REMOVE_DREAMSIGN", payload: { dreamsignId: FIXED } });
    log.append({ type: "ADD_DREAMSIGN", payload: { dreamsignId: FIXED } });
    log.append({ type: "PICK_DRAFT_CARD", payload: pickPayload(log.state()) });
    expect(replay()).toEqual(log.state()); expect(first).not.toBeNull();
    expect(log.state().journey.draftState?.siteFirstEventEntryId).toBe(first);
    const applied = records.flatMap((record) => record.logRecords ?? []);
    expect(applied.filter((record) => record.fields.dreamsignId === FIXED)).toHaveLength(1);
    expect(applied.filter((record) => record.fields.dreamsignId === TOME)).toHaveLength(1);
  });

  it("accepts explicit unconsumed/consumed histories and absent inactive or fresh history on LOAD_STATE", () => {
    const before = fixture();
    for (const patch of [{ siteFirstEventEntryId: null }, { siteFirstEventEntryId: undefined },
      { siteFirstEventEntryId: undefined, activeSiteId: null, sitePicksCompleted: 2, pickNumber: 3 },
      { siteFirstEventEntryId: null, sitePicksCompleted: 1, pickNumber: 2 },
      { siteFirstEventEntryId: parseDeckEntryId("historical-purged-entry"), sitePicksCompleted: 1, pickNumber: 2 }]) {
      const snapshot = JSON.parse(JSON.stringify({ ...before.journey, draftState: { ...before.journey.draftState, ...patch } })) as JourneyState;
      const loaded = apply(before, "LOAD_STATE", { snapshot }); expect(loaded.outcome).toBe("applied");
      expect(loaded.state.journey.draftState).toEqual(snapshot.draftState);
    }
    const fresh = fixture(1); delete fresh.journey.draftState!.siteFirstEventEntryId;
    expect(pick(fresh).state.journey.draftState?.siteFirstEventEntryId).toBeNull();
  });

  it("rejects indeterminate, malformed and incoherent imported history without partial state", () => {
    const before = fixture(), original = structuredClone(before);
    for (const patch of [{ siteFirstEventEntryId: undefined, sitePicksCompleted: 1, pickNumber: 2 },
      ...["", 5, false, {}, []].map((siteFirstEventEntryId) => ({ siteFirstEventEntryId })),
      { siteFirstEventEntryId: "past", sitePicksCompleted: 0 }, { siteFirstEventEntryId: "past", activeSiteId: null, sitePicksCompleted: 1 },
      { siteFirstEventEntryId: "past", sitePicksCompleted: 1, pickNumber: 1 },
      { sitePicksCompleted: -1 }, { sitePicksCompleted: 0.5 }, { pickNumber: 0 }, { activeSiteId: "" }]) {
      const snapshot: unknown = JSON.parse(JSON.stringify({ ...before.journey, essence: 999, draftState: { ...before.journey.draftState, ...patch } }));
      expect(apply(before, "LOAD_STATE", { snapshot }).state).toBe(before);
    }
    expect(before).toEqual(original);
  });

  it("validates the fixed descriptor and uses its specified legal form exclusively", () => {
    for (const descriptor of [{ kind: "bad" }, { kind: "firstDraftEventTransfiguration", type: "bad" }]) {
      expect(() => journeyDraft(FIXED, descriptor as JourneyDraftEffect)).toThrow(RangeError);
    }
    const fixedEnduring = createJourneyModifierRegistry([journeyDraft(FIXED, { kind: "firstDraftEventTransfiguration", type: "Enduring" })]);
    const before = fixture(), result = reduceGameEvent(before, event("PICK_DRAFT_CARD", pickPayload(before)), ctx(), fixedEnduring);
    expect(last(result.state).transfiguration).toBe("Enduring");
    const ineligible = fixture(3), out = reduceGameEvent(ineligible, event("PICK_DRAFT_CARD", pickPayload(ineligible)), ctx(), fixedEnduring);
    expect(last(out.state).transfiguration).toBeNull();
  });
});
