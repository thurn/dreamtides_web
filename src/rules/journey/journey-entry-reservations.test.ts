import { afterEach, describe, expect, it } from "vitest";
import { createLocalLog } from "../../eventlog/local-log";
import { foldEvents } from "../../eventlog/fold";
import type { EngineConfig, ReducerLogRecord } from "../../eventlog/types";
import { LayerName } from "../../types/layer-name";
import { NIGHTMARE_CARD_ID } from "../../data/nightmare";
import { parseCardSubtype } from "../../types/card-identity";
import { parseDeckEntryId, type DeckEntryId } from "../../types/identifiers";
import { testDreamsignId, testEventActor } from "../../types/test-identities";
import type { DeckEntry } from "../../types/journey";
import type { FoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import { mintEntryId } from "./deck";
import { poolDraftState } from "./draft-fixtures";
import { journeyDraft } from "./journey-draft";
import { journeyOnGain } from "./journey-on-gain";
import { HERBS, RAVEN, RAT, TOME, ORDINARY, sign, entry, registry, initial, compound, clear } from "./journey-nightmares274-fixtures";
import { ctx, GENESIS } from "./lifecycle-fixtures";
import { createJourneyModifierRegistry } from "./modifier-registry";
import { registerSiteContentProvider } from "./sites";
import { SITE_ID } from "./sites-fixtures";
import { testSiteContentProvider } from "./test-content-providers";
import { intent } from "./journey-subtype.fixtures";
import { validJourneySubtypeScreen } from "./journey-subtype";
import { registerJourneyTypeRemapProvider } from "./journey-type-remap";

const TOAD = testDreamsignId("reservation-subtype"), MASK = testDreamsignId("reservation-remap"), FIXED = testDreamsignId("reservation-late-form");
const nightmare = (deck: readonly DeckEntry[], seq = 10) => entry(99, 99, { entryId: mintEntryId(deck, seq, 0), isBane: true });
function attempts(rows: readonly ReducerLogRecord[]) {
  return rows.filter(row => row.fields.dreamsignId === HERBS).flatMap(row => row.fields.attemptedEntryIds as DeckEntryId[]);
}
function copies(rows: readonly ReducerLogRecord[]) {
  return rows.filter(row => row.fields.dreamsignId === TOME).flatMap(row => (row.fields.target as { copies: { entryId: DeckEntryId; fromEntryId: DeckEntryId }[] }).copies);
}
function disjoint(left: readonly DeckEntryId[], right: readonly DeckEntryId[]) {
  expect(new Set(left).size).toBe(left.length);
  expect(left.filter(id => right.includes(id))).toEqual([]);
}
afterEach(clear);
describe("transition-wide physical journey entry reservations", () => {
  it("reserves an initially prevented domain entry before acquired Nightmare attempts", () => {
    const before = initial([RAVEN]), saved = structuredClone(before), domain = nightmare(before.journey.deck);
    const out = compound(before, [HERBS], [domain]);
    expect(out.outcome).toBe("applied"); expect(before).toEqual(saved);
    const rows = out.logRecords ?? [], added = attempts(rows);
    expect(added).toHaveLength(3); disjoint(added, [domain.entryId]);
    const prevented = rows.filter(row => row.fields.dreamsignId === RAVEN).flatMap(row => (row.fields.target as { prevented: { entryId: DeckEntryId; cardId: typeof NIGHTMARE_CARD_ID }[] }).prevented);
    expect(prevented.map(value => value.entryId)).toEqual([domain.entryId, ...added]);
    expect(prevented.every(value => value.cardId === NIGHTMARE_CARD_ID)).toBe(true);
    expect(out.state.journey.deck).toEqual(before.journey.deck);
    expect(compound(structuredClone(before), [HERBS], [domain])).toEqual(out);
  });

  it.each([[HERBS, RAT, HERBS], [RAT, HERBS, HERBS]])("keeps each acquired batch and each held copy disjoint (%j)", (a, b, c) => {
    const before = initial([RAVEN, TOME, TOME]), saved = structuredClone(before);
    const out = compound(before, [a, b, c]);
    expect(out.outcome).toBe("applied"); expect(before).toEqual(saved);
    const rows = out.logRecords ?? [], added = attempts(rows), minted = copies(rows);
    expect(added).toHaveLength(6); expect(minted).toHaveLength(4);
    disjoint(minted.map(value => value.entryId), [...added, ...before.journey.deck.map(value => value.entryId)]);
    expect(rows.filter(row => row.fields.dreamsignId === TOME).map(row => row.fields.heldIndex)).toEqual([1, 2]);
    expect(out.state.journey.deck).toHaveLength(9);
    for (const copy of minted) {
      const original = out.state.journey.deck.find(value => value.entryId === copy.fromEntryId)!;
      expect({ ...out.state.journey.deck.find(value => value.entryId === copy.entryId), entryId: original.entryId }).toEqual(original);
      expect(original.transfiguration).not.toBeNull();
    }
    expect(compound(structuredClone(before), [a, b, c])).toEqual(out);
  });

  it("retains reservations through a later positive observer and the earlier Tome drain", () => {
    const state = initial([RAVEN, TOME, FIXED, TOME]);
    const before = { ...state.journey, draftState: poolDraftState({ activeSiteId: SITE_ID, sitePicksCompleted: 0, siteFirstEventEntryId: null }) };
    const denied = nightmare(before.deck), gained = entry(100, 1, { entryId: parseDeckEntryId("late-event"), keywordModification: { fast: true }, sparkBonus: 2 });
    const journey = { ...before, deck: [...before.deck, denied, gained], dreamsigns: [...before.dreamsigns, sign(HERBS)], draftState: { ...before.draftState, sitePicksCompleted: 1, siteFirstEventEntryId: gained.entryId } };
    const modifiers = createJourneyModifierRegistry([...[RAVEN, TOME, HERBS].map(id => registry().lookup(id)!), journeyDraft(FIXED, { kind: "firstDraftEventTransfiguration", type: "Inspired" })]);
    const input = { before, journey, eventType: "PICK_DRAFT_CARD" as const, seq: 10, siteId: SITE_ID, transfigurations: [], dreamsignGains: [{ dreamsignId: HERBS, heldIndex: 4 }] };
    const saved = structuredClone(input), run = () => modifiers.apply({ ...structuredClone(input), random: () => ({ value: 0, drawIndex: 0 }) });
    const out = run(); expect(input).toEqual(saved); expect(run()).toEqual(out);
    const minted = copies(out.logRecords); expect(minted).toHaveLength(2);
    disjoint(minted.map(value => value.entryId), [denied.entryId, ...attempts(out.logRecords), gained.entryId]);
    expect(out.logRecords.filter(row => [FIXED, TOME].includes(row.fields.dreamsignId as typeof FIXED)).map(row => [row.fields.dreamsignId, row.fields.heldIndex])).toEqual([[FIXED, 2], [TOME, 3], [TOME, 1]]);
    for (const copy of minted) expect(out.journey.deck.find(value => value.entryId === copy.entryId)).toMatchObject({ cardNumber: 1, transfiguration: "Inspired", keywordModification: { fast: true }, sparkBonus: 2 });
  });

  it("preserves erased attempts through mixed acquired choices, saved reload and event replay", () => {
    const before = initial([RAVEN, TOME]); before.journey.atlas.nodes[before.journey.currentDreamscape!].layer = LayerName.One;
    const saved = structuredClone(before), domain = nightmare(before.journey.deck, 1);
    registerJourneyTypeRemapProvider([parseCardSubtype("Warrior"), parseCardSubtype("Mage")]);
    const modifiers = createJourneyModifierRegistry([...[RAVEN, TOME, HERBS, RAT].map(id => registry().lookup(id)!), journeyOnGain(TOAD, { kind: "deckSubtypeOnGain" }), journeyOnGain(MASK, { kind: "typeRemapOnGain" })]);
    const acquired = [HERBS, TOAD, MASK, HERBS, RAT];
    registerSiteContentProvider(testSiteContentProvider({ resolveAugury: ({ journey }) => ({ purges: [], journey: { ...journey, deck: [...journey.deck, domain], dreamsigns: [...journey.dreamsigns, ...acquired.map(sign)] } }) }));
    const config: EngineConfig<FoldState> = { ...GAME_ENGINE_CONFIG, genesisState: () => before, reducer: (state, action, context) => reduceGameEvent(state, action, context, modifiers) };
    const genesis = { ...GENESIS, seed: before.journey.seed };
    const log = createLocalLog({ config, genesis, localActor: testEventActor("reservation-owner"), now: () => ctx().timestamp, devMode: false });
    const rows: ReducerLogRecord[] = []; log.subscribe(record => rows.push(...(record.logRecords ?? [])));
    log.append({ type: "ACCEPT_AUGURY_OFFER", payload: { siteId: SITE_ID } });
    const paused = log.state(); expect(validJourneySubtypeScreen(paused.journey.screen, paused.journey, modifiers)).toBe(true);
    log.append({ type: "LOAD_STATE", payload: { snapshot: JSON.parse(JSON.stringify(paused.journey)) } });
    expect({ ...log.state().journey, runId: paused.journey.runId }).toEqual(paused.journey);
    log.append({ type: "RESOLVE_JOURNEY_SUBTYPE", payload: intent(log.state(), "Warrior") });
    expect(validJourneySubtypeScreen(log.state().journey.screen, log.state().journey, modifiers)).toBe(true);
    log.append({ type: "RESOLVE_JOURNEY_SUBTYPE", payload: intent(log.state(), "Mage") });
    expect(log.state().journey.screen).toEqual(before.journey.screen);
    const added = attempts(rows), minted = copies(rows);
    expect(added).toHaveLength(6); expect(minted).toHaveLength(2);
    disjoint(added, [domain.entryId]); disjoint(minted.map(value => value.entryId), [domain.entryId, ...added]);
    expect(log.state().journey.deck.every(value => value.cardNumber !== 99)).toBe(true);
    expect(rows.filter(row => row.fields.dreamsignId === RAT).every(row => (row.fields.transformations as { cardId: typeof ORDINARY }[]).every(value => value.cardId === ORDINARY))).toBe(true);
    expect(foldEvents(config, genesis, { seq: 0, state: before }, [...log.events()], { devMode: false }).state).toEqual(log.state());
    expect(before).toEqual(saved);
  });
});
