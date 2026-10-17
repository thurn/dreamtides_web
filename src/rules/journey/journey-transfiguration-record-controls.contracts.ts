import { transfigurationSourceState } from "../../transfiguration/transfiguration-logic";
import { createLocalLog } from "../../eventlog/local-log";
import { GENESIS } from "./lifecycle-fixtures";
import type { EngineConfig } from "../../eventlog/types";
import type { DeckEntry, TransfigurationType } from "../../types/journey";
import type { FoldState } from "../fold-state";
import { testCardId } from "../../types/test-identities";
import * as b from "../../engine/dsl/builders";
import { gainPoints } from "../../engine/effects/primitives/gain-points";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { character, eventCard, content, data, entry, definitions, actualProvider } from "./journey-transfiguration-record.fixtures";
import { createJourneyTransfigurationProvider } from "../../session/providers/journey-transfiguration-provider";
import { createCatalog } from "../../engine/catalog";
import { resolveDeckEntryCard } from "../../card-type-change";
import { BASE_VARIANT } from "../../engine/dsl/types";
import { appendEngineTransfiguration } from "../../engine/transfigurations";
import { isDeckEntryTransfigurationRecord, appendDeckEntryTransfiguration } from "../../transfiguration/deck-entry-transfigurations";
import { registerJourneyTransfigurationProvider, validJourneyTransfigurationRecords, resolveJourneyTransfiguration } from "./journey-transfiguration";
import { appendAfterBattleSource } from "./journey-after-battle";
import { createJourneyModifierRegistry } from "./modifier-registry";
import { journeyTransfiguration } from "./journey-transfiguration";
import { makeSite, stateWithSites, SITE_ID } from "./sites-fixtures";
import { ctx, genesis, event } from "./lifecycle-fixtures";
import { reduceGameEvent } from "../reducer";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import { foldInvariantViolations } from "../invariants";
import { testDreamsignId } from "../../types/test-identities";
import { parseDeckEntryId, parseCardTypeChangePredicateId } from "../../types/identifiers";
import { testJourneyState } from "../../testing/journey-genesis";
const sign = testDreamsignId("record-after-battle");
const registry = createJourneyModifierRegistry([journeyTransfiguration(sign, { kind: "afterBattleTransfiguration", maxCount: 2 })]);
function window() {
 const state = stateWithSites([makeSite("Battle")]);
 const node = state.journey.atlas.nodes[state.journey.currentDreamscape!]; node.sites[0].isVisited = true;
 const journey = { ...state.journey, currentDreamscape: null, deck: [entry(undefined, { transfiguration: null, transfigurationApplications: undefined })], screen: { type: "journeyComplete" as const } };
 const { transfigurationApplications: _, ...plain } = journey.deck[0]; journey.deck = [plain];
 return appendAfterBattleSource(journey, SITE_ID, { kind: "transfiguration", dreamsignId: sign, heldIndex: 0, maxCount: 2 })!;
}
const payload = (ids: readonly string[]) => ({ siteId: SITE_ID, dreamsignId: sign, heldIndex: 0, choiceIndex: 0, entryIds: ids });
describe("chronological source and ingress controls", () => {
 beforeEach(() => registerJourneyTransfigurationProvider(actualProvider()));
 afterEach(() => registerJourneyTransfigurationProvider(null));
 it("composes cost reductions, repeated event additions, replacements and recorded Perfected constituents", () => {
  const cost = entry([{ form: "Empowered" }, { form: "Empowered" }], { keywordModification: { energyCostReduction: 1 } });
  expect(resolveDeckEntryCard(data, character, cost).energyCost).toBe(0);
  const eventEntry = entry([{ form: "Inspired" }, { form: "Inspired" }], { cardNumber: eventCard.cardNumber });
  expect(resolveDeckEntryCard(data, eventCard, eventEntry).renderedText.match(/Draw a card\./g)).toHaveLength(2);
  const before = entry([{ form: "Inspired" }, { form: "Amplified" }], { cardNumber: eventCard.cardNumber });
  const after = entry([{ form: "Amplified" }, { form: "Inspired" }], { cardNumber: eventCard.cardNumber });
  expect(resolveDeckEntryCard(data, eventCard, before).renderedText).toBe(eventCard.amplifiedText);
  expect(resolveDeckEntryCard(data, eventCard, after).renderedText).not.toBe(eventCard.amplifiedText);
  const v = appendEngineTransfiguration(definitions[1], BASE_VARIANT, "Perfected");
  const perfected = entry(v.transfigurationApplications, { cardNumber: eventCard.cardNumber });
  expect(actualProvider().validateRecord?.(perfected)).toBe(true);
  const appended = actualProvider().apply?.(perfected, "Inspired"); expect(appended?.ok).toBe(true);
  if (appended?.ok !== true) throw new Error("Expected lawful append");
  expect(appended?.value?.transfigurationApplications?.[0]).toEqual(v.transfigurationApplications![0]);
  const result = resolveDeckEntryCard(data, eventCard, appended.value);
  expect(result.renderedText.match(/Draw a card\./g)).toHaveLength(2);
 });
 it("faithfully migrates a compatible legacy scalar or refuses it atomically", () => {
  const { transfigurationApplications: _, ...legacy } = entry([{ form: "Kindled" }]);
  expect(actualProvider().apply?.(legacy, "Kindled")).toMatchObject({ ok: true, value: { transfigurationApplications: [{ form: "Kindled" }, { form: "Kindled" }] } });
  const invalid = { ...legacy, transfiguration: "Inspired" as const }; const bytes = JSON.stringify(invalid);
  expect(actualProvider().apply?.(invalid, "Kindled")).toEqual({ ok: false, reason: "incompatible_legacy" }); expect(JSON.stringify(invalid)).toBe(bytes);
  const perfect = { ...legacy, transfiguration: "Perfected" as const };
  const migrated = actualProvider().apply?.(perfect, "Kindled");
  if (migrated?.ok) expect(migrated.value?.transfigurationApplications?.[0].form).toBe("Perfected");
  else expect(migrated?.reason).toBe("incompatible_legacy");
 });
 it("uses actual structural abilities and refuses authored-text claims unsupported by a pending engine source", () => {
  const pending = createJourneyTransfigurationProvider(content, createCatalog(definitions.map(d => ({ ...d, status: "pending", transfiguration: undefined, transfigurationState: undefined })), []));
  const attuned = entry([{ form: "Attuned" }]);
  expect(pending.validateRecord?.(attuned)).toBe(false);
  const forged = entry([{ form: "Perfected", constituents: ["Inspired", "Enduring"] }], { cardNumber: eventCard.cardNumber });
  expect(actualProvider().validateRecord?.(forged)).toBe(false);
  expect(appendDeckEntryTransfiguration(data, character, definitions[1], entry(), "Kindled")).toEqual({ ok: false, reason: "unavailable_content" });
 });
 it("writes one complete application through the ordinary consumer and preflights before every draw", () => {
  const journey = window(), rng = vi.fn(() => 0); const bytes = JSON.stringify(journey);
  const out = resolveJourneyTransfiguration(journey, payload([journey.deck[0].entryId]), ctx({ rng }), registry)!;
  expect(out.deck[0].transfigurationApplications).toHaveLength(1); expect(rng).toHaveBeenCalledTimes(1); expect(JSON.stringify(journey)).toBe(bytes);
  expect(resolveJourneyTransfiguration(out, payload([journey.deck[0].entryId]), ctx({ rng }), registry)).toBeNull();
  for (const ids of [[], ["stale"], [journey.deck[0].entryId, journey.deck[0].entryId]]) {
   rng.mockClear(); const result = resolveJourneyTransfiguration(journey, payload(ids), ctx({ rng }), registry);
   expect(rng).not.toHaveBeenCalled(); if (ids.length === 0) expect(result?.screen.type).toBe("journeyComplete"); else expect(result).toBeNull();
  }
  const base = actualProvider(); registerJourneyTransfigurationProvider({ ...base, resolve: e => { const value = base.resolve(e); return value === null ? null : { ...value, applicableForms: [] }; } });
  rng.mockClear(); expect(resolveJourneyTransfiguration(journey, payload([journey.deck[0].entryId]), ctx({ rng }), registry)).toBeNull(); expect(rng).not.toHaveBeenCalled();
 });
 it("rejects all primary mismatches, sparse/empty/unknown records and legacy-only certification at public boundaries", () => {
  const state = genesis(); const seedState = { ...state, journey: { ...state.journey, deck: [entry()] } };
  const legacy = { resolve: () => ({ cardId: character.id, cardType: character.cardType, subtype: character.subtype, forms: ["Kindled" as const] }) };
  for (const provider of [null, legacy, { ...legacy, apply: (held: Readonly<DeckEntry>, form: TransfigurationType) => actualProvider().apply!(held, form) }]) {
   registerJourneyTransfigurationProvider(provider);
   expect(() => GAME_ENGINE_CONFIG.decode(JSON.stringify(seedState))).toThrow();
   expect(reduceGameEvent(state, event("LOAD_STATE", { snapshot: seedState.journey }), ctx()).state).toBe(state);
   expect(foldInvariantViolations(seedState).some(v => v.code === "journey_transfiguration_record_inconsistent")).toBe(true);
  }
  registerJourneyTransfigurationProvider(actualProvider());
  for (const record of [entry([], { transfiguration: null }), entry(undefined, { transfiguration: null }), entry(undefined, { transfiguration: "Inspired" }), { ...entry(), transfigurationApplications: [{ form: "unknown" }] }, { ...entry(), transfigurationApplications: new Array(1) }]) {
   expect(isDeckEntryTransfigurationRecord(record)).toBe(false);
   expect(() => GAME_ENGINE_CONFIG.decode(JSON.stringify({ ...state, journey: { ...state.journey, deck: [record] } }))).toThrow();
  }
  expect(reduceGameEvent(state, event("LOAD_STATE", { snapshot: seedState.journey }), ctx()).outcome).toBe("applied");
 });
 it("validates only the explicit persisted entry-bearing historical locations", () => {
  const bad = entry([{ form: "Inspired" }]); const good = entry();
  const locations = [
   { ...testJourneyState(), siteRuntime: { x: { resolution: { purgedEntrySnapshots: [bad] } } } },
   { screen: { choice: { kind: "subtype", resume: { before: { deck: [bad] } } } } },
   { screen: { choice: { kind: "subtype", resume: { before: { siteRuntime: { x: { resolution: { purgedEntrySnapshots: [bad] } } } } } } } },
   { screen: { choice: { kind: "subtype", resume: { attemptedEntries: [bad] } } } },
   { screen: { choice: { kind: "subtype", resume: { transfigurations: [{ entry: bad }] } } } },
  ];
  expect(validJourneyTransfigurationRecords({ deck: [good] })).toBe(true);
  for (const value of locations) { expect(validJourneyTransfigurationRecords(value)).toBe(false); expect(() => GAME_ENGINE_CONFIG.decode(JSON.stringify({ ...genesis(), journey: value }))).toThrow(); }
  expect(actualProvider().validateRecord?.(entry(undefined, { entryId: parseDeckEntryId("another-physical") }))).toBe(true);
 });
 it("keeps same-name UUID sources independent and uses structural Attuned eligibility", () => {
  const twin = { ...character, id: testCardId("record-same-name-twin"), cardNumber: 73, spark: 5 };
  const source = { ...definitions[0], id: twin.id, spark: 5, status: "authored" as const, abilities: () => [b.activated([b.energy(2)], gainPoints(1))] };
  const provider = createJourneyTransfigurationProvider({ ...content, cardDatabase: new Map([[character.cardNumber, character], [twin.cardNumber, twin]]) }, createCatalog([definitions[0], source], []));
  const held = entry([{ form: "Attuned" }], { cardNumber: twin.cardNumber }); expect(provider.validateRecord?.(held)).toBe(true); expect(provider.resolve(held)?.cardId).toBe(twin.id);
  const kindled = provider.apply!(entry([{ form: "Kindled" }], { cardNumber: twin.cardNumber }), "Kindled");
  if (!kindled.ok) throw new Error("Expected lawful twin append"); expect(resolveDeckEntryCard(data, twin, kindled.value).spark).toBe(20); expect(actualProvider().resolve(entry())?.cardId).toBe(character.id);
 });
 it("contains source exceptions and applies one resolution, ignoring a repeat, without partial writes", () => {
  const initial = { ...genesis(), journey: window() }; const rng = vi.fn(() => 0), base = actualProvider();
  registerJourneyTransfigurationProvider({ ...base, apply: () => { throw new Error("owned source failure"); } });
  const failureConfig: EngineConfig<FoldState> = { ...GAME_ENGINE_CONFIG, genesisState: () => initial, reducer: (state, intent, context) => reduceGameEvent(state, intent, { ...context, rng }, registry) };
  const failing = createLocalLog({ config: failureConfig, genesis: GENESIS, localActor: event("END_BATTLE", {}).actor, now: () => ctx().timestamp, devMode: false });
  failing.append({ type: "RESOLVE_JOURNEY_TRANSFIGURATION", payload: payload([initial.journey.deck[0].entryId]) });
  expect(failing.state()).toBe(initial); expect(rng).not.toHaveBeenCalled();
  registerJourneyTransfigurationProvider(base);
  const config: EngineConfig<FoldState> = { ...GAME_ENGINE_CONFIG, genesisState: () => initial, reducer: (state, intent, context) => reduceGameEvent(state, intent, context, registry) };
  const log = createLocalLog({ config, genesis: GENESIS, localActor: event("END_BATTLE", {}).actor, now: () => ctx().timestamp, devMode: false });
  log.append({ type: "RESOLVE_JOURNEY_TRANSFIGURATION", payload: payload([initial.journey.deck[0].entryId]) });
  expect(log.state().journey.deck[0].transfigurationApplications).toHaveLength(1);
  const first = log.state(); log.append({ type: "RESOLVE_JOURNEY_TRANSFIGURATION", payload: payload([initial.journey.deck[0].entryId]) }); expect(log.state()).toBe(first);
 });

 it.each(["Character", "Event"] as const)("uses copiable ordinary forms before permanent type changes for %s", (inputType) => {
  const { amplifiedText: _authored, ...eventSource } = eventCard;
  const cards = [{ ...character, energyCost: 0 }, { ...eventSource, energyCost: 0 }];
  const source = definitions.map(d => ({ ...d, costs: [b.energy(0)], transfiguration: { amplified: false, resonant: { base: null, amplified: null } }, transfigurationState: (initially: boolean, steps: Parameters<typeof transfigurationSourceState>[3]) => transfigurationSourceState("", undefined, initially, steps) }));
  const provider = createJourneyTransfigurationProvider({ ...content, cardDatabase: new Map(cards.map(card => [card.cardNumber, card])) }, createCatalog(source, [])); registerJourneyTransfigurationProvider(provider);
  for (const card of cards.filter(card => card.cardType === inputType)) {
   const { transfigurationApplications: _, ...plain } = entry();
   const held: DeckEntry = { ...plain, cardNumber: card.cardNumber, transfiguration: null, sparkBonus: 2, typeChange: { predicateId: parseCardTypeChangePredicateId("record-copiable-type"), cardType: card.cardType === "Character" ? "Event" : "Character", subtype: card.cardType === "Character" ? "" : "Mage", label: "" } };
   const initial = { ...genesis(), journey: { ...window(), deck: [held] } }, rng = vi.fn(() => 0);
   const config: EngineConfig<FoldState> = { ...GAME_ENGINE_CONFIG, genesisState: () => initial, reducer: (state, intent, context) => reduceGameEvent(state, intent, { ...context, rng }, registry) };
   const log = createLocalLog({ config, genesis: GENESIS, localActor: event("END_BATTLE", {}).actor, now: () => ctx().timestamp, devMode: false });
   log.append({ type: "RESOLVE_JOURNEY_TRANSFIGURATION", payload: payload([held.entryId]) });
   expect(log.state().journey.deck[0].transfigurationApplications).toEqual([{ form: card.cardType === "Character" ? "Kindled" : "Inspired" }]);
   expect(rng).toHaveBeenCalledTimes(1);
   const projected = resolveDeckEntryCard(data, card, log.state().journey.deck[0]); expect(projected.cardType).toBe(held.typeChange!.cardType); expect(projected.spark).toBe(card.cardType === "Character" ? null : 0);
   const observed = reduceGameEvent(initial, event("RESOLVE_JOURNEY_TRANSFIGURATION", payload([held.entryId])), ctx({ rng: () => 0 }), registry);
   const transformations = observed.logRecords?.find(record => record.event === "journey_transfiguration_resolved")?.fields.transformations;
   expect(transformations).toEqual([{ entryId: held.entryId, cardId: card.id, type: card.cardType === "Character" ? "Kindled" : "Inspired", transfigurationApplications: [{ form: card.cardType === "Character" ? "Kindled" : "Inspired" }], applicableForms: card.cardType === "Character" ? ["Kindled"] : ["Inspired", "Enduring", "Hastened"], essenceCost: 0 }]);
  }
 });
 it("exposes no current applicability when the actual form catalog is empty and consumes no draw", () => {
  const provider = createJourneyTransfigurationProvider({ ...content, transfigurationData: { ...data, forms: [] } }, createCatalog(definitions, [])); registerJourneyTransfigurationProvider(provider);
  const journey = window(), rng = vi.fn(() => 0);
  expect(provider.resolve(journey.deck[0])?.applicableForms).toEqual([]);
  expect(resolveJourneyTransfiguration(journey, payload([journey.deck[0].entryId]), ctx({ rng }), registry)).toBeNull(); expect(rng).not.toHaveBeenCalled();
 });

});
