import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLocalLog, type LocalLogRecord } from "../../eventlog/local-log";
import { foldEvents } from "../../eventlog/fold";
import type { EngineConfig, GameEvent, Genesis } from "../../eventlog/types";
import { makeAuguryTestCard } from "../../journey_v2/testing/fixtures";
import { TEST_CONTENT_CONFIG } from "../../testing/journey-genesis";
import { parseJourneyId, parseSiteId } from "../../types/identifiers";
import { testCardId, testDreamsignId, testEventActor } from "../../types/test-identities";
import type { DraftConfig } from "../../types/draft";
import type { JourneyState } from "../../types/journey";
import type { FoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import { registerDeckContentProvider } from "./deck";
import { registerDraftContentProvider } from "./draft";
import { ctx, poolDraftState, stateWithDraftSites } from "./draft-fixtures";
import { journeyDraft } from "./journey-draft";
import { registerJourneyDraftSiteContracts } from "./journey-draft-sites.contracts";
import { createJourneyModifierRegistry } from "./modifier-registry";
import { testDraftContentProvider } from "./test-content-providers";

const ALWAYS = testDreamsignId("draft-always"), CONDITIONAL = testDreamsignId("draft-threshold"), OTHER = testDreamsignId("draft-other");
const SITE = parseSiteId("site-a"), ACTOR = testEventActor("draft-owner");
const registry = createJourneyModifierRegistry([
  journeyDraft(ALWAYS, { kind: "additionalDraftChoices", additionalCards: 2 }),
  journeyDraft(CONDITIONAL, { kind: "additionalDraftChoices", additionalCards: 1, minimumEssence: 11 }),
]);
const sign = (id: typeof ALWAYS) => ({ id, name: "Same synthetic name", effectDescription: "" });
const cards = Array.from({ length: 80 }, (_, i) => makeAuguryTestCard({ id: testCardId(`journey-draft-${i + 1}`), cardNumber: i + 1 }));
const database = new Map(cards.map((card) => [card.cardNumber, card]));
const copies = Object.fromEntries(cards.map((card) => [String(card.cardNumber), 1]));
const config: DraftConfig = { packSize: 3, sitePickCount: 5, rarityCaps: [] };
function provider(packSize = config.packSize) {
  return testDraftContentProvider({ resolveCardNumber: (id) => cards.find((card) => card.id === id)?.cardNumber ?? null,
    cardDatabase: () => database, draftConfigFor: () => ({ ...config, packSize }) });
}
function fixture(ids = [ALWAYS], essence = 0, extra: Partial<JourneyState> = {}): FoldState {
  return stateWithDraftSites(poolDraftState({ activeSiteId: null, currentOffer: [], siteShownCardNumbers: [],
    draftPoolCopiesByCard: copies, remainingCopiesByCard: copies }), {
    runId: parseJourneyId("draft-contract-run"), dreamsigns: ids.map(sign), essence, screen: { type: "site", siteId: SITE }, ...extra,
  });
}
const event = (type: GameEvent["type"], payload: Record<string, unknown>): GameEvent =>
  ({ type, payload, actor: ACTOR, basedOnSeq: 0, clientTimestamp: ctx().timestamp });
const apply = (state: FoldState, type: GameEvent["type"], payload: Record<string, unknown> = {}) =>
  reduceGameEvent(state, event(type, payload), ctx(), registry);
const enter = (state = fixture()) => apply(state, "ENTER_DRAFT_SITE", { siteId: SITE });
function pick(state: FoldState, index = 0) {
  const number = state.journey.draftState!.currentOffer[index];
  const card = database.get(number);
  if (card === undefined) throw new Error("Missing synthetic offered card");
  return apply(state, "PICK_DRAFT_CARD", { packIndex: index, cardId: card.id });
}
function logConfig(state: FoldState): EngineConfig<FoldState> {
  return { ...GAME_ENGINE_CONFIG, genesisState: () => state,
    reducer: (before, e, context) => reduceGameEvent(before, e, context, registry) };
}
const genesis = (state: FoldState): Genesis => ({ seed: state.journey.seed, reducerVersion: "test", createdAt: 0, contentConfig: TEST_CONTENT_CONFIG });
beforeEach(() => {
  registerDraftContentProvider(provider());
  registerDeckContentProvider({ resolveCardNumber: (id) => cards.find((card) => card.id === id)?.cardNumber ?? null,
    resolveDreamsign: (id) => sign(id) });
});
afterEach(() => { registerDraftContentProvider(null); registerDeckContentProvider(null); });

describe("journeyDraft public offer preparation", () => {
  it.each([
    { ids: [], essence: 11, count: 3, applied: 0 },
    { ids: [OTHER], essence: 11, count: 3, applied: 0 },
    { ids: [ALWAYS], essence: 0, count: 5, applied: 1 },
    { ids: [CONDITIONAL], essence: 10, count: 3, applied: 0 },
    { ids: [CONDITIONAL], essence: 11, count: 4, applied: 1 },
    { ids: [CONDITIONAL], essence: 12, count: 4, applied: 1 },
    { ids: [ALWAYS, CONDITIONAL, ALWAYS], essence: 11, count: 8, applied: 3 },
  ])("quotes live eligible copies (%j)", ({ ids, essence, count, applied }) => {
    const before = fixture(ids, essence), saved = structuredClone(before);
    const result = enter(before), draft = result.state.journey.draftState!;
    expect(result.outcome).toBe("applied");
    expect(draft.currentOfferCount).toBe(count);
    expect(draft.currentOffer).toHaveLength(count);
    expect(new Set(draft.currentOffer).size).toBe(count);
    expect(Object.values(draft.remainingCopiesByCard).reduce((sum, n) => sum + n, 0)).toBe(cards.length - count);
    expect(before).toEqual(saved);
    const records = result.logRecords ?? [];
    expect(records).toHaveLength(applied);
    expect(records.map((r) => r.fields.dreamsignId)).toEqual(ids.filter((id) => id !== OTHER && (id !== CONDITIONAL || essence >= 11)));
    if (applied > 0) expect(records[records.length - 1]?.fields.after).toMatchObject({ requestedCount: count, quotedCount: count, offeredCount: count });
    expect(records.every((r) => !JSON.stringify(r).includes("Same synthetic name"))).toBe(true);
  });

  it("keeps a prepared offer through balance/holding edits and quotes the next pick from live state", () => {
    const entered = enter(fixture([CONDITIONAL], 11)).state;
    const old = structuredClone(entered.journey.draftState);
    const poor = apply(entered, "SET_ESSENCE", { value: 10 });
    expect(poor.logRecords).toBeUndefined();
    expect(poor.state.journey.draftState).toEqual(old);
    const picked = pick(poor.state), next = picked.state.journey.draftState!;
    expect(next.currentOffer).toHaveLength(3);
    expect(next.currentOfferCount).toBe(3);
    expect(picked.logRecords).toBeUndefined();
    const richer = apply(picked.state, "SET_ESSENCE", { value: 11 }).state;
    const improved = pick(richer);
    expect(improved.state.journey.draftState?.currentOffer).toHaveLength(4);
    expect(improved.logRecords).toHaveLength(1);
    const lost = apply(improved.state, "REMOVE_DREAMSIGN", { dreamsignId: CONDITIONAL }).state;
    expect(lost.journey.draftState).toEqual(improved.state.journey.draftState);
    expect(pick(lost).state.journey.draftState?.currentOffer).toHaveLength(3);
  });

  it("grants an additional offered card by UUID exactly once and excludes all shown cards on the next offer", () => {
    const entered = enter().state, shown = entered.journey.draftState!.currentOffer;
    const index = shown.length - 1, chosen = database.get(shown[index])!;
    const result = pick(entered, index);
    expect(result.state.journey.deck[result.state.journey.deck.length - 1]?.cardNumber).toBe(chosen.cardNumber);
    expect(result.state.journey.deck).toHaveLength(entered.journey.deck.length + 1);
    expect(result.state.journey.draftState!.currentOffer.some((n) => shown.includes(n))).toBe(false);
    expect(apply(result.state, "PICK_DRAFT_CARD", { packIndex: index, cardId: chosen.id }).state).toBe(result.state);
    expect(enter(entered).state).toBe(entered);
  });

  it("retains the quoted reroll count after source loss and catalog changes, including a legacy cardinality", () => {
    const entered = enter().state;
    const lost = apply(entered, "REMOVE_DREAMSIGN", { dreamsignId: ALWAYS }).state;
    registerDraftContentProvider(provider(9));
    const rerolled = apply(lost, "REROLL_DRAFT_OFFER", { siteId: SITE });
    expect(rerolled.state.journey.draftState?.currentOffer).toHaveLength(5);
    expect(rerolled.state.journey.draftState?.currentOfferCount).toBe(5);
    expect(rerolled.logRecords).toBeUndefined();
    const legacy = structuredClone(lost);
    delete legacy.journey.draftState!.currentOfferCount;
    expect(apply(legacy, "REROLL_DRAFT_OFFER", { siteId: SITE }).state.journey.draftState?.currentOffer).toHaveLength(5);
  });

  it("does not report a fresh offer on the final site pick", () => {
    let state = enter().state;
    for (let i = 0; i < config.sitePickCount; i++) {
      const result = pick(state); state = result.state;
      if (i === config.sitePickCount - 1) {
        expect(state.journey.draftState!.currentOffer).toEqual([]);
        expect(result.logRecords).toBeUndefined();
      }
    }
  });

  it("replays and reloads exact choices, requested counts and pool after administrative edits", () => {
    const before = fixture([ALWAYS, CONDITIONAL], 11), engine = logConfig(before), g = genesis(before);
    const log = createLocalLog({ config: engine, genesis: g, localActor: ACTOR, now: () => ctx().timestamp });
    log.append({ type: "ENTER_DRAFT_SITE", payload: { siteId: SITE } });
    log.append({ type: "SET_ESSENCE", payload: { value: 0 } });
    log.append({ type: "REMOVE_DREAMSIGN", payload: { dreamsignId: ALWAYS } });
    const replay = foldEvents(engine, g, { seq: 0, state: before }, [...log.events()]);
    expect(replay.state).toEqual(log.state());
    const snapshot = JSON.parse(JSON.stringify(log.state().journey)) as JourneyState;
    const loaded = JSON.parse(JSON.stringify(apply(before, "LOAD_STATE", { snapshot }).state.journey)) as JourneyState;
    // Import starts a new run; the portable choices and resources stay exact.
    expect({ ...loaded, runId: snapshot.runId }).toEqual(snapshot);
    for (const value of [0, -1, 1.5, "5", null]) {
      expect(apply(before, "LOAD_STATE", { snapshot: { ...snapshot, draftState: { ...snapshot.draftState!, currentOfferCount: value } } }).outcome).toBe("bounced");
    }
    delete snapshot.draftState!.currentOfferCount;
    expect(apply(before, "LOAD_STATE", { snapshot }).outcome).toBe("applied");
  });

  it("rejects invalid/stale entry or pick and concurrent unknown windows without spending the pool", () => {
    const before = fixture(), source = structuredClone(before);
    expect(enter({ ...before, journey: { ...before.journey, draftState: null } }).outcome).toBe("bounced");
    expect(apply(before, "ENTER_DRAFT_SITE", { siteId: "unknown" }).state).toBe(before);
    const entered = enter(before).state;
    expect(apply(entered, "PICK_DRAFT_CARD", { packIndex: 99, cardId: cards[0].id }).state).toBe(entered);
    const pickedCard = database.get(entered.journey.draftState!.currentOffer[0])!;
    const result = reduceGameEvent(entered, event("PICK_DRAFT_CARD", { packIndex: 0, cardId: pickedCard.id }), ctx({ intervening: "unknown" }), registry);
    expect(result.outcome).toBe("bounced");
    expect(before).toEqual(source);
  });

  it("contains mid-preparation failure atomically in the public log and replay", () => {
    const before = fixture(), engine = logConfig(before), g = genesis(before);
    registerDraftContentProvider({ ...provider(), cardDatabase: () => { throw new Error("synthetic preparation failure"); } });
    const log = createLocalLog({ config: engine, genesis: g, localActor: ACTOR, now: () => ctx().timestamp, devMode: false });
    const records: LocalLogRecord<FoldState>[] = []; log.subscribe((record) => records.push(record));
    log.append({ type: "ENTER_DRAFT_SITE", payload: { siteId: SITE } });
    expect(records[0].outcome).toBe("bounced");
    expect(records[0].error).toBeDefined();
    expect(records[0].logRecords).toBeUndefined();
    expect(log.state()).toBe(before);
    expect(foldEvents(engine, g, { seq: 0, state: before }, [...log.events()], { devMode: false }).state).toEqual(before);
  });

  it("contains an aggregate count overflow before any offer or pool write", () => {
    const before = fixture(), huge = createJourneyModifierRegistry([
      journeyDraft(ALWAYS, { kind: "additionalDraftChoices", additionalCards: Number.MAX_SAFE_INTEGER }),
    ]);
    const engine = { ...logConfig(before), reducer: (s: FoldState, e: GameEvent, context: ReturnType<typeof ctx>) => reduceGameEvent(s, e, context, huge) };
    const g = genesis(before), log = createLocalLog({ config: engine, genesis: g, localActor: ACTOR, devMode: false, now: () => ctx().timestamp });
    const records: LocalLogRecord<FoldState>[] = []; log.subscribe((r) => records.push(r));
    log.append({ type: "ENTER_DRAFT_SITE", payload: { siteId: SITE } });
    expect(records[0].outcome).toBe("bounced");
    expect(records[0].error).toBeDefined();
    expect(records[0].logRecords).toBeUndefined();
    expect(log.state()).toBe(before);
    expect(foldEvents(engine, g, { seq: 0, state: before }, [...log.events()], { devMode: false }).state).toEqual(before);
  });

  it("rejects invalid catalog arithmetic when registering a count hook", () => {
    for (const additionalCards of [0, -1, NaN, 1.5]) expect(() => journeyDraft(ALWAYS, { kind: "additionalDraftChoices", additionalCards })).toThrow(RangeError);
    expect(() => journeyDraft(ALWAYS, { kind: "additionalDraftChoices", additionalCards: 1, minimumEssence: NaN })).toThrow(RangeError);
  });
});
registerJourneyDraftSiteContracts();
