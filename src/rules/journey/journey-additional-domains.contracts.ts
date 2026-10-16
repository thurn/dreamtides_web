import { LayerName } from "../../types/layer-name";
import { afterEach, describe, expect, it, vi } from "vitest";
import { additional, apply, POUCH, TOME, SITE_ID, GENESIS, sign } from "./journey-additional-transfiguration.fixtures";
import { clearGameProviders } from "../../session/providers/register-game-providers";
import { registerReplayFixtureProviders } from "../replay/fixture-providers";
import { journeyShop } from "./journey-shop";
import { shopState, cardSlot, SITE_ID as SHOP_SITE } from "./shop-fixtures";
import { journeyDraft } from "./journey-draft";
import { journeyOnGain } from "./journey-on-gain";
import { journeyBattleInit } from "./journey-battle-init";
import { journeyDeckEntry } from "./journey-deck-entry";
import { journeyTransfiguration, registerJourneyTransfigurationProvider } from "./journey-transfiguration";
import { registerDraftContentProvider } from "./draft";
import { poolDraftState, stateWithDraftSites } from "./draft-fixtures";
import { testDraftContentProvider, testSiteContentProvider } from "./test-content-providers";
import { registerSiteContentProvider } from "./sites";
import { createSiteContentProvider } from "../../session/providers/site-provider";
import { createJourneyTransfigurationProvider } from "../../session/providers/journey-transfiguration-provider";
import { makeSite, stateWithSites } from "./sites-fixtures";
import { parseDeckEntryId, parseDreamsignId, parseSiteId, parseShuffleCommitment } from "../../types/identifiers";
import { parseCardSubtype } from "../../types/card-identity";
import { testCardId, testDreamsignId, testExplorationActionId, testFoldHash } from "../../types/test-identities";
import { registerJourneyTypeRemapProvider } from "./journey-type-remap";
import { createJourneyModifierRegistry } from "./modifier-registry";
import type { ExplorationSiteRuntime } from "../../types/journey";
import { SELECTION_RULES_VERSION } from "../../reward-selection";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import mug, { journeyBattleInitEffect, journeyOnGainEffect } from "../../content/dreamsigns/spotted-mug-069c6e8f";

import rat from "../../content/dreamsigns/white-rat-ab1da9d3";
import toad from "../../content/dreamsigns/toad-8e2d26a8";
import { buildAuguryContext } from "../../journey_v2/context/buildAuguryContext";
import { generateAuguryEncounter } from "../../journey_v2/encounter/generateAuguryEncounter";
import { gambleStateWith, SITE_ID as GAMBLE_SITE } from "./gamble/test-fixture";
import { testGambleSelectionTrace } from "../../testing/gamble-fixture";
import { NIGHTMARE_CARD_ID } from "../../data/nightmare";
import { makeAuguryTestCard } from "../../journey_v2/testing/fixtures";
import type { ExplorationActionContent } from "../../data/exploration";
import type { FourSuitRepriseSiteRuntime } from "../../types/journey";
const FIXED = testDreamsignId("additional-actual-draft"), RAT = parseDreamsignId(rat.id), TOAD = parseDreamsignId(toad.id), MUG = parseDreamsignId(mug.id), STARTER = testDreamsignId("additional-actual-perfect-starter"), CRYSTAL = testDreamsignId("additional-actual-crystal");
function resumedAcquisition(secondSubtype = false) {
  const f = additional({ cardType: "Event", held: [POUCH, TOME], definitions: [journeyOnGain(RAT, { kind: "randomTransfigurationOnGain", numerator: 1, denominator: 2 }), journeyOnGain(TOAD, { kind: "deckSubtypeOnGain" }), journeyBattleInit(MUG, journeyBattleInitEffect, journeyOnGainEffect)] });
  const sources = secondSubtype ? [RAT, TOAD, RAT, TOAD, MUG] : [RAT, TOAD, RAT, MUG], runtime: ExplorationSiteRuntime = { kind: "exploration", encounterCardId: f.base.id, selectionRulesVersion: SELECTION_RULES_VERSION, actionOffers: [], resolution: null };
  const state = stateWithSites([makeSite("Exploration")], { dreamsigns: f.state.journey.dreamsigns, essence: f.state.journey.essence, screen: { type: "site", siteId: SITE_ID }, siteRuntime: { [SITE_ID]: runtime }, deck: Array.from({ length: 4 }, (_, index) => ({ ...f.state.journey.deck[0], entryId: parseDeckEntryId(`additional-acquired-${index}`) })) });
  state.journey.atlas.nodes[state.journey.currentDreamscape!].layer = LayerName.One;
  registerJourneyTypeRemapProvider([parseCardSubtype("Warrior")]);
  registerSiteContentProvider(testSiteContentProvider({ resolveExploration: ({ journey }) => ({ purges: [], journey: { ...journey, dreamsigns: [...journey.dreamsigns, ...sources.map(sign)], siteRuntime: { [SITE_ID]: { ...runtime, resolution: { actionId: testExplorationActionId("additional-acquire"), gainedCardIds: [], gainedDreamsignIds: sources, dreamsignMutation: { beforeIds: journey.dreamsigns.map(sign => sign.id), afterIds: [...journey.dreamsigns.map(sign => sign.id), ...sources], gainedIds: sources, purgedIds: [], replacements: [], offeredIds: sources, poolBeforeIds: [], poolAfterIds: [], poolRegenerated: false }, purgedCardIds: [], affectedEntryIds: [], essenceGained: 0 } } } } }) }));
  const first = apply(f, state, "RESOLVE_EXPLORATION_CHOICE", { siteId: SITE_ID }, { seq: 42, rng: () => 0.99 });
  if (first.outcome !== "applied" || first.state.journey.screen.type !== "journeyDreamsign" || first.state.journey.screen.choice.kind !== "subtype") throw new Error("Actual subtype acquisition missing");
  return { ...f, state: first.state };
}
function resumeIntent(f: ReturnType<typeof resumedAcquisition>) {
  const screen = f.state.journey.screen;
  if (screen.type !== "journeyDreamsign" || screen.choice.kind !== "subtype") throw new Error("Actual subtype missing");
  const source = screen.choice.resume.sources[screen.choice.resume.sourceIndex];
  return { sourceDreamsignId: source.dreamsignId, heldIndex: source.heldIndex, choiceIndex: screen.choice.resume.sourceIndex, permissionSeq: screen.choice.permissionSeq, chosenSubtype: parseCardSubtype("Warrior") };
}

describe("additional reactions consume actual journey producers", () => {
  afterEach(() => { vi.restoreAllMocks(); clearGameProviders(); registerReplayFixtureProviders(); });
  it.each([[POUCH, TOME, FIXED], [FIXED, TOME, POUCH]])("observes the real 727 first-Draft Event producer at either held position %s", (...held) => {
    const f = additional({ cardType: "Event", held, definitions: [journeyDraft(FIXED, { kind: "firstDraftEventTransfiguration", type: "Inspired" })] });
    const siteId = parseSiteId("site-a"), cards = [f.base, f.neighbor], copies = Object.fromEntries(cards.map(card => [String(card.cardNumber), 1]));
    registerDraftContentProvider(testDraftContentProvider({ resolveCardNumber: id => cards.find(card => card.id === id)?.cardNumber ?? null, cardDatabase: () => f.content.cardDatabase, draftConfigFor: () => ({ packSize: 1, sitePickCount: 2, rarityCaps: [] }) }));
    const state = stateWithDraftSites(poolDraftState({ currentOffer: [f.base.cardNumber], currentOfferCount: 1, siteFirstEventEntryId: null, siteShownCardNumbers: [f.base.cardNumber], draftPoolCopiesByCard: copies, remainingCopiesByCard: { [f.neighbor.cardNumber]: 1 }, openingDraftOffers: { "2": [f.neighbor.cardNumber] } }), { deck: [], dreamsigns: held.map(sign), screen: { type: "site", siteId } });
    const out = apply(f, state, "PICK_DRAFT_CARD", { packIndex: 0, cardId: f.base.id }, { seq: 30 });
    expect(out.outcome).toBe("applied"); expect(out.state.journey.deck).toHaveLength(2);
    expect(out.state.journey.deck[0].transfiguration).toBe("Inspired"); expect(out.state.journey.deck[1].transfiguration).toBe("Inspired");
    expect(out.state.journey.journeyDraw?.cause.entryId).toBe(out.state.journey.deck[0].entryId);
    expect(out.logRecords?.filter(row => row.event === "journey_transfiguration_operation")).toHaveLength(1);
  });
  it.each([null, 2, 42])("retains actual half-deck selection order through subtype suspension and genuine Mug choice, imported resume=%s", importedSeq => {
    const imported = importedSeq !== null;
    const f = resumedAcquisition(), screen = f.state.journey.screen;
    if (screen.type !== "journeyDreamsign" || screen.choice.kind !== "subtype") throw new Error("subtype fixture");
    expect(screen.choice.resume.transfigurations.map(item => item.entry.entryId)).toEqual([f.state.journey.deck[3].entryId, f.state.journey.deck[2].entryId]);
    expect(f.state.journey.pendingJourneyLoop!.instructions.map(item => item.cause.eventSeq)).toEqual([42, 42]);
    const resumeSeq = importedSeq ?? 47;
    const sourceSave = GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(f.state));
    const incoming = imported ? apply(f, GAME_ENGINE_CONFIG.genesisState({ ...GENESIS, seed: f.state.journey.seed }), "LOAD_STATE", { snapshot: sourceSave.journey }, { seq: 1 }) : { outcome: "applied", state: f.state };
    expect(incoming.outcome).toBe("applied"); expect(incoming.state.journey.pendingJourneyLoop).toEqual(f.state.journey.pendingJourneyLoop);
    let ready = incoming.state;
    if (imported) for (let seq = 2; seq < resumeSeq; seq++) { const loaded = apply(f, ready, "LOAD_STATE", { snapshot: ready.journey }, { seq }); expect(loaded.outcome).toBe("applied"); ready = loaded.state; }
    const out = apply(f, ready, "RESOLVE_JOURNEY_SUBTYPE", resumeIntent(f), { seq: resumeSeq, rng: () => 0.99 });
    expect(out.outcome).toBe("applied"); expect(out.state.journey.screen).toMatchObject({ type: "journeyDreamsign", choice: { kind: "openingHand", permissionSeq: 42 } });
    expect(out.state.journey).not.toHaveProperty("journeyDraw");
    const currentOperations = out.logRecords!.filter(row => row.event === "journey_transfiguration_operation"); expect(currentOperations).toHaveLength(2);
    expect(currentOperations.map(row => row.fields.cause)).toEqual(out.state.journey.pendingJourneyLoop!.instructions.slice(2).map(item => item.cause));
    expect(out.state.journey.pendingJourneyLoop!.instructions.map(item => [item.permissionSeq, item.cause.eventSeq, item.cause.ordinal])).toEqual([[42, 42, 0], [42, 42, 1], [42, resumeSeq, imported ? 2 : 0], [42, resumeSeq, imported ? 3 : 1]]);
    const saved = GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(out.state));
    const loaded = apply(f, out.state, "LOAD_STATE", { snapshot: saved.journey }, { seq: resumeSeq + 1 }); expect(loaded.outcome).toBe("applied");
    const blocked = apply(f, loaded.state, "REMOVE_DREAMSIGN", { dreamsignId: POUCH }, { seq: resumeSeq + 2 });
    expect(blocked.state).toBe(loaded.state);
    const lost = loaded.state;
    const choice = lost.journey.screen;
    if (choice.type !== "journeyDreamsign" || choice.choice.kind !== "openingHand") throw new Error("Mug fixture");
    const source = choice.choice.sources[choice.choice.index], selected = lost.journey.deck[0].entryId;
    const done = apply(f, lost, "RESOLVE_OPENING_HAND_ENTRY", { dreamsignId: MUG, heldIndex: source.heldIndex, choiceIndex: choice.choice.index, permissionSeq: 42, entryId: selected }, { seq: resumeSeq + 3, rng: () => 0 });
    expect(done.outcome).toBe("applied"); expect(done.state.journey).not.toHaveProperty("pendingJourneyLoop"); expect(done.state.journey.journeyDraw?.result).toBe("draw");
    expect(done.state.journey.dreamsigns.find(sign => sign.id === MUG)?.openingHandEntryId).toBe(selected);
    expect(done.logRecords?.filter(row => row.event === "journey_loop_finite_application")).toHaveLength(0);
    expect(done.state.journey.deck.slice(0, 4).every(entry => entry.transfiguration !== null)).toBe(true);
  });
  it("persists mixed-clock subtype occurrences and rejects duplicate, reversed and malformed causal order", () => {
    const f = resumedAcquisition(true), saved = GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(f.state));
    const imported = apply(f, GAME_ENGINE_CONFIG.genesisState({ ...GENESIS, seed: f.state.journey.seed }), "LOAD_STATE", { snapshot: saved.journey }, { seq: 1 }); expect(imported.outcome).toBe("applied");
    const next = apply(f, imported.state, "RESOLVE_JOURNEY_SUBTYPE", resumeIntent(f), { seq: 2, rng: () => 0.99 }); expect(next.outcome).toBe("applied");
    const screen = next.state.journey.screen; if (screen.type !== "journeyDreamsign" || screen.choice.kind !== "subtype") throw new Error("second actual subtype missing");
    expect(screen.choice.permissionSeq).toBe(42);
    expect(screen.choice.resume.transfigurations.map(item => [item.operation!.cause.eventSeq, item.operation!.cause.causalSeq, item.operation!.cause.ordinal])).toEqual([[42, undefined, 0], [42, undefined, 1], [2, 42, 2], [2, 42, 3]]);
    const roundtrip = GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(next.state)); expect(roundtrip).toEqual(next.state);
    const loaded = apply(f, next.state, "LOAD_STATE", { snapshot: roundtrip.journey }, { seq: 3 }); expect(loaded.outcome).toBe("applied");
    for (const clock of [-1, 2, 1, Number.MAX_SAFE_INTEGER + 1]) for (const location of ["occurrence", "pending"] as const) {
      const bad = structuredClone(next.state); if (bad.journey.screen.type !== "journeyDreamsign" || bad.journey.screen.choice.kind !== "subtype") throw new Error("subtype fixture");
      Reflect.set(location === "occurrence" ? bad.journey.screen.choice.resume.transfigurations[2].operation!.cause : bad.journey.pendingJourneyLoop!.instructions[2].cause, "causalSeq", clock);
      expect(() => GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(bad))).toThrow(); expect(apply(f, next.state, "LOAD_STATE", { snapshot: bad.journey }).outcome).toBe("bounced");
    }
    for (const field of ["occurrences", "pending", "duplicate", "unknown"] as const) {
      const bad = structuredClone(next.state); if (bad.journey.screen.type !== "journeyDreamsign" || bad.journey.screen.choice.kind !== "subtype") throw new Error("subtype fixture");
      if (field === "unknown") Reflect.set(bad.journey.pendingJourneyLoop!.instructions[2].cause, "unrecognizedCausalSeq", 42);
      else if (field === "occurrences") { const rows = [...bad.journey.screen.choice.resume.transfigurations]; [rows[2], rows[3]] = [rows[3], rows[2]]; Reflect.set(bad.journey.screen.choice.resume, "transfigurations", rows); }
      else { const rows = [...bad.journey.pendingJourneyLoop!.instructions]; if (field === "pending") [rows[2], rows[3]] = [rows[3], rows[2]]; else { const original = rows[2], entryId = parseDeckEntryId("forged-clock-parent"); rows.push({ ...original, cause: { ...original.cause, eventSeq: 1, entryId }, parentEntry: { ...original.parentEntry, entryId } }); } Reflect.set(bad.journey.pendingJourneyLoop!, "instructions", rows); }
      expect(() => GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(bad))).toThrow(); expect(apply(f, next.state, "LOAD_STATE", { snapshot: bad.journey }).outcome).toBe("bounced");
    }
    const ready = { ...f, state: loaded.state }, resumed = apply(f, loaded.state, "RESOLVE_JOURNEY_SUBTYPE", resumeIntent(ready), { seq: 4, rng: () => 0.99 });
    expect(resumed.outcome).toBe("applied"); expect(resumed.state.journey.screen).toMatchObject({ type: "journeyDreamsign", choice: { kind: "openingHand", permissionSeq: 42 } });
    const mugChoice = resumed.state.journey.screen; if (mugChoice.type !== "journeyDreamsign" || mugChoice.choice.kind !== "openingHand") throw new Error("Mug missing");
    const source = mugChoice.choice.sources[mugChoice.choice.index];
    const done = apply(f, resumed.state, "RESOLVE_OPENING_HAND_ENTRY", { dreamsignId: MUG, heldIndex: source.heldIndex, choiceIndex: mugChoice.choice.index, permissionSeq: 42, entryId: resumed.state.journey.deck[0].entryId }, { seq: 5 });
    expect(done.outcome).toBe("applied"); expect(done.state.journey.journeyDraw).toMatchObject({ committedSeq: 5, committedCausalSeq: 42, result: "draw" }); expect(GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(done.state))).toEqual(done.state);
  });
  it("rejects tampered full before values on real subtype saves but accepts reordered application keys", () => {
    const f = resumedAcquisition(), saved = structuredClone(f.state);
    const screen = saved.journey.screen;
    if (screen.type !== "journeyDreamsign" || screen.choice.kind !== "subtype") throw new Error("subtype fixture");
    Reflect.set(screen.choice.resume.transfigurations[0].operation!.beforeEntry, "sparkBonus", 9);
    expect(() => GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(saved))).toThrow();
    expect(apply(f, f.state, "LOAD_STATE", { snapshot: saved.journey }).state).toBe(f.state);
    const shuffled: unknown = JSON.parse(GAME_ENGINE_CONFIG.encode(f.state), (_key: string, value: unknown): unknown => value && !Array.isArray(value) && typeof value === "object" ? Object.fromEntries(Object.entries(value).reverse()) : value);
    expect(GAME_ENGINE_CONFIG.decode(JSON.stringify(shuffled))).toEqual(f.state);
    if (typeof shuffled !== "object" || shuffled === null || !("journey" in shuffled)) throw new Error("Fixture saved journey missing");
    expect(apply(f, f.state, "LOAD_STATE", { snapshot: shuffled.journey }).outcome).toBe("applied");
  });
  it("observes the actual 272 acquired starter Perfected as one parent occasion", () => {
    const f = additional({ cardType: "Character", held: [POUCH] });
    const base = { ...f.base, isStarter: true }, content = { ...f.content, cardDatabase: new Map([[base.cardNumber, base], [f.neighbor.cardNumber, f.neighbor]]) };
    registerJourneyTransfigurationProvider(createJourneyTransfigurationProvider(content));
    const registry = createJourneyModifierRegistry([journeyTransfiguration(POUCH, { kind: "additionalRandomTransfiguration" }), journeyOnGain(STARTER, { kind: "perfectStarterOnGain", transfiguration: "Perfected" })]);
    const out = apply({ ...f, registry }, f.state, "ADD_DREAMSIGN", { dreamsignId: STARTER }, { seq: 36 });
    expect(out.outcome).toBe("applied"); expect(out.state.journey.deck[0].transfiguration).toBe("Perfected");
    expect(out.state.journey.journeyDraw?.cause.applicationIndex).toBe(0); expect(out.logRecords?.filter(row => row.event === "journey_loop_instruction_earned")).toHaveLength(1);
  });
  it.each([{ kind: "randomTransfiguration" as const, value: 0, hit: true }, { kind: "randomCharacterTransfiguration" as const, value: 0, hit: true }, { kind: "randomCharacterTransfiguration" as const, value: 0.99, hit: false }])("reacts to actual $kind gains at draw $value", ({ kind, value, hit }) => {
    const effect = kind === "randomTransfiguration" ? { kind, minimumDeckSize: 3 } : { kind, numerator: 1, denominator: 2 };
    const f = additional({ held: [POUCH, CRYSTAL], definitions: [journeyDeckEntry(CRYSTAL, effect)] });
    const before = f.state.journey, entry = { ...before.deck[0], entryId: parseDeckEntryId("additional-crystal-gained") };
    const rng = vi.fn(() => ({ value, drawIndex: 0 })), result = f.registry.apply({ before, journey: { ...before, deck: [...before.deck, entry] }, eventType: "PICK_DRAFT_CARD", seq: 51, random: rng, transfigurations: [], siteId: null });
    expect(result.journey.deck[2].transfiguration === null).toBe(!hit);
    expect(result.journey.journeyDraw !== undefined).toBe(hit);
    expect(result.logRecords.filter(row => row.event === "journey_loop_instruction_earned")).toHaveLength(hit ? 1 : 0);
  });
  it.each(["transfigure-selected", "transfigure-random-cards", "transfigure-fixed-random-cards", "transfigure-fixed-selected", "transfigure-all-for-essence", "transfigure-random-starter-cards", "transfigure-all-starter-cards", "transfigure-all-cards", "purge-disclosed-and-transfigure-same-type", "purge-one-transfigure-and-copy-others", "take-transfigured-cards-and-gain-nightmares"] as const)("collects actual Exploration %s receipts through the real provider", effectKind => {
    const f = additional({ cardType: "Event", held: [POUCH, TOME] }), actionId = testExplorationActionId(`additional-${effectKind}`);
    const fields: Partial<ExplorationActionContent> = effectKind === "transfigure-all-for-essence" ? { canonicalMechanicId: "transfigure-deck-for-essence", essence: 2, predicate: "event", transfiguration: "Inspired" }
      : effectKind === "purge-disclosed-and-transfigure-same-type" ? { canonicalMechanicId: "purge-deck-entry", selectionPolicyId: "purge-misfit", transfiguration: "Inspired" }
      : effectKind === "purge-one-transfigure-and-copy-others" ? { canonicalMechanicId: "transfigure-deck-entry", selectionPolicyId: "uniform", offerCount: 4, transfiguration: "Inspired" }
      : effectKind === "take-transfigured-cards-and-gain-nightmares" ? { canonicalMechanicId: "transfigured-card-chooser", selectionPolicyId: "card-fit", predicate: "event", offerCount: 4, transfiguration: "Inspired", nightmareCount: 1 }
      : { canonicalMechanicId: "transfigure-deck-entry", predicate: "event", selectionPolicyId: effectKind.endsWith("selected") ? "transfiguration-value" : "uniform", ...(effectKind.includes("all") ? {} : { count: 2 }), ...(effectKind.includes("fixed") ? { transfiguration: "Inspired" } : {}) };
    const action: ExplorationActionContent = { id: actionId, label: "Synthetic", effectKind, ...fields };
    const nightmare = makeAuguryTestCard({ id: NIGHTMARE_CARD_ID, cardNumber: 7553, cardType: "Event", spark: null, renderedText: "Bane." });
    const database = new Map([...f.content.cardDatabase].map(([number, card]) => [number, { ...card, isStarter: effectKind.includes("starter") }])); database.set(nightmare.cardNumber, nightmare);
    for (let index = 0; index < 2; index++) {
      const card = { ...f.base, id: testCardId(`additional-catalog-${index}`), cardNumber: 7554 + index };
      database.set(card.cardNumber, card);
    }
    const content = { ...f.content, cardDatabase: database, exploration: { foldHash: testFoldHash("a"), customCards: [], customDreamsigns: [], encounters: [{ cardId: f.base.id, prose: "Synthetic", actions: [action] }] } };
    registerSiteContentProvider(createSiteContentProvider(content));
    const deck = Array.from({ length: effectKind === "purge-disclosed-and-transfigure-same-type" ? 8 : 4 }, (_, index) => ({ ...f.state.journey.deck[index % 2], entryId: parseDeckEntryId(`additional-explore-${index}`) }));
    const state = stateWithSites([makeSite("Exploration")], { deck, dreamsigns: f.state.journey.dreamsigns, essence: 100, screen: { type: "site", siteId: SITE_ID } });
    const opened = apply(f, state, "OPEN_SITE", { siteId: SITE_ID, selectionRulesVersion: SELECTION_RULES_VERSION }, { seq: 60 });
    expect(opened.outcome).toBe("applied");
    const runtime = opened.state.journey.siteRuntime[SITE_ID]; if (runtime?.kind !== "exploration") throw new Error("Exploration runtime missing");
    const offer = runtime.actionOffers[0], preparation = offer.preparation;
    if (preparation !== undefined && "unavailableReason" in preparation.plan && preparation.plan.unavailableReason !== undefined) throw new Error(`Synthetic ${effectKind}: ${preparation.plan.unavailableReason}`);
    let selection: Record<string, unknown> = {};
    if (effectKind.endsWith("selected")) selection = { entryIds: [deck[3].entryId, deck[0].entryId], ...(effectKind === "transfigure-selected" ? { transfigurations: ["Inspired", "Inspired"] } : {}) };
    if (preparation?.kind === "compound-action") {
      const plan = preparation.plan;
      if (plan.kind === "purge-transfigure-copy") selection = { entryIds: [plan.targets[0].entryId] };
      if (plan.kind === "purge-disclosed-transfigure-same-type") selection = { entryIds: [plan.target!.entryId] };
      if (plan.kind === "take-transfigured-nightmares") selection = { cardIds: [plan.offeredCards[0].cardId] };
    }
    const out = apply(f, opened.state, "RESOLVE_EXPLORATION_CHOICE", { siteId: SITE_ID, actionId, selectionRulesVersion: SELECTION_RULES_VERSION, selection }, { seq: 61 });
    expect(out.outcome).toBe("applied");
    const result = out.state.journey.siteRuntime[SITE_ID]; if (result?.kind !== "exploration" || result.resolution === null) throw new Error("Exploration result missing");
    const originals = [...(result.resolution.cardTransfigurations ?? []), ...(result.resolution.starterCardTransfigurations ?? [])].filter(item => deck.some(entry => entry.entryId === item.entryId));
    const operations = (out.logRecords ?? []).filter(row => row.event === "journey_transfiguration_operation");
    const expectedIds = originals.length > 0 ? originals.map(item => item.entryId) : result.resolution.chosenTransfiguration === undefined ? [] : result.resolution.affectedEntryIds;
    expect(operations.map(row => (row.fields.cause as { entryId: unknown }).entryId)).toEqual(expectedIds);
    if (effectKind === "take-transfigured-cards-and-gain-nightmares") { expect(operations).toHaveLength(0); expect(out.state.journey).not.toHaveProperty("journeyDraw"); }
    else { expect(out.state.journey.journeyDraw?.result).toBe("draw"); expect(operations.length).toBeGreaterThan(0); }
    if (effectKind === "purge-one-transfigure-and-copy-others") {
      expect(operations).toHaveLength(3); expect(out.state.journey.deck).toHaveLength(9);
      for (const copy of result.resolution.cardCopies!) {
        const parent = out.state.journey.deck.find(entry => entry.entryId === copy.sourceEntryId)!;
        const copied = out.state.journey.deck.find(entry => entry.entryId === copy.mintedEntryId)!;
        expect({ ...copied, entryId: parent.entryId }).toEqual(parent);
      }
    }
  });
  it("observes actual Augury original-entry transfiguration and excludes its preformed grants", () => {
    const f = additional({ cardType: "Event", held: [POUCH, TOME] }), site = makeSite("Augury");
    registerSiteContentProvider(createSiteContentProvider(f.content));
    const state = stateWithSites([site], { deck: f.state.journey.deck, dreamsigns: f.state.journey.dreamsigns, essence: 100, screen: { type: "site", siteId: SITE_ID }, siteRuntime: { [SITE_ID]: { kind: "augury", completed: false, selectionRulesVersion: SELECTION_RULES_VERSION, forcedArchetypeId: "transfigure" } } });
    const encounter = generateAuguryEncounter(buildAuguryContext({ journeyState: state.journey, journeyContent: f.content, site }));
    const offer = encounter.offers.find(item => item.applyPayload?.kind === "transfigure_deck_entry");
    expect(offer).toBeDefined(); if (offer === undefined) throw new Error("Synthetic Augury form offer missing");
    const out = apply(f, state, "ACCEPT_AUGURY_OFFER", { siteId: SITE_ID, encounterSignature: offer.encounterSignature, offerId: offer.offerId, archetypeId: offer.archetypeId }, { seq: 70 });
    expect(out.outcome).toBe("applied"); expect(out.state.journey.journeyDraw?.cause.eventSeq).toBe(70);
    expect(out.logRecords?.filter(row => row.event === "journey_transfiguration_operation")).toHaveLength(1);
  });
  it("consumes the actual Four-Suit Spades selected-form route", () => {
    const f = additional({ cardType: "Event", held: [POUCH, TOME] }), commitment = parseShuffleCommitment("additional-round");
    const provider = testSiteContentProvider();
    registerSiteContentProvider({ ...provider, gambleData: { ...provider.gambleData, games: provider.gambleData.games.map(game => game.rules.kind === "fourSuitReprise" && game.economy.kind === "fourSuitReprise" ? { ...game, economy: game.economy, rules: { ...game.rules, outcomes: [{ suit: "hearts", outcome: "duplication" }, { suit: "clubs", outcome: "purge" }, { suit: "diamonds", outcome: "essence" }, { suit: "spades", outcome: "transfiguration" }] } } : game) } });
    const runtime: FourSuitRepriseSiteRuntime = { kind: "gamble", gameId: "four-suit-reprise", selectionTrace: testGambleSelectionTrace("four-suit-reprise"), isFarpoint: false, drawCost: 3, shuffleCommitments: [commitment], committedCards: [{ rank: "7", suit: "spades" }], targets: [{ entryId: f.state.journey.deck[0].entryId, cardId: f.base.id, cardNumber: f.base.cardNumber, cardSnapshot: f.base, transfigurationOffers: [{ entryId: f.state.journey.deck[0].entryId, type: "Inspired", previewCard: f.base, essenceCost: 0, effectDetails: {} }] }], rounds: [], phase: "choose" };
    const state = gambleStateWith(runtime, { deck: f.state.journey.deck, dreamsigns: f.state.journey.dreamsigns });
    const paid = apply(f, state, "DRAW_FOUR_SUIT_REPRISE", { siteId: GAMBLE_SITE, entryId: f.state.journey.deck[0].entryId }, { seq: 80 });
    expect(paid.outcome).toBe("applied");
    const revealed = apply(f, paid.state, "SETTLE_FOUR_SUIT_REPRISE", { siteId: GAMBLE_SITE, shuffleCommitment: commitment }, { seq: 81 });
    const out = apply(f, revealed.state, "CHOOSE_FOUR_SUIT_REPRISE_TRANSFIGURATION", { siteId: GAMBLE_SITE, shuffleCommitment: commitment, type: "Inspired" }, { seq: 82 });
    expect(out.outcome).toBe("applied"); expect(out.state.journey.essence).toBe(197); expect(out.state.journey.journeyDraw?.cause.eventSeq).toBe(82); expect(out.state.journey.deck).toHaveLength(3);
  });

  it("keeps an actual purchased preformed Event a gain with no original occasion", () => {
    const shard = testDreamsignId("additional-purchased-form");
    const f = additional({ cardType: "Event", held: [POUCH, TOME, shard], definitions: [journeyShop(shard, { kind: "purchasedCardTransfiguration" })] });
    registerSiteContentProvider(createSiteContentProvider(f.content, f.registry));
    const state = shopState([cardSlot({ cardNumber: f.base.cardNumber, basePrice: 1 })], { deck: f.state.journey.deck, dreamsigns: f.state.journey.dreamsigns, essence: 200 });
    const rng = vi.fn(() => 0.99), out = apply(f, state, "BUY_SHOP_SLOT", { siteId: SHOP_SITE, slotIndex: 0 }, { seq: 90, rng });
    expect(out.outcome).toBe("applied"); expect(out.state.journey.deck).toHaveLength(3); expect(out.state.journey.deck[2].transfiguration).not.toBeNull();
    expect(out.state.journey).not.toHaveProperty("journeyDraw"); expect(out.state.journey).not.toHaveProperty("pendingJourneyLoop"); expect(rng).toHaveBeenCalledTimes(1);
  });
  it("keeps an actual preformed Draft offer outside the original-application reactions", () => {
    const f = additional({ cardType: "Event", held: [POUCH, TOME, FIXED], definitions: [journeyDraft(FIXED, { kind: "firstDraftEventTransfiguration", type: "Inspired" })] });
    const cards = [f.base, f.neighbor], copies = Object.fromEntries(cards.map(card => [String(card.cardNumber), 1]));
    registerDraftContentProvider(testDraftContentProvider({ resolveCardNumber: id => cards.find(card => card.id === id)?.cardNumber ?? null, cardDatabase: () => f.content.cardDatabase, draftConfigFor: () => ({ packSize: 1, sitePickCount: 2, rarityCaps: [] }) }));
    const state = stateWithDraftSites(poolDraftState({ currentOffer: [f.base.cardNumber], currentOfferCount: 1, currentOfferTransfigurations: { [f.base.cardNumber]: "Inspired" as const }, siteFirstEventEntryId: null, siteShownCardNumbers: [f.base.cardNumber], draftPoolCopiesByCard: copies, remainingCopiesByCard: { [f.neighbor.cardNumber]: 1 }, openingDraftOffers: { "2": [f.neighbor.cardNumber] } }), { deck: [], dreamsigns: f.state.journey.dreamsigns, screen: { type: "site", siteId: parseSiteId("site-a") } });
    const out = apply(f, state, "PICK_DRAFT_CARD", { packIndex: 0, cardId: f.base.id }, { seq: 91 });
    expect(out.outcome).toBe("applied"); expect(out.state.journey.deck).toHaveLength(1); expect(out.state.journey.deck[0].transfiguration).toBe("Inspired"); expect(out.state.journey).not.toHaveProperty("journeyDraw");
  });

  it("completes actual Exploration after its application receipts have been consumed", () => {
    const f = additional({ cardType: "Event", held: [TOME] }), actionId = testExplorationActionId("additional-exploration-continuation");
    const content = { ...f.content, exploration: { foldHash: testFoldHash("a"), customCards: [], customDreamsigns: [], encounters: [{ cardId: f.base.id, prose: "Synthetic", actions: [{ id: actionId, label: "Synthetic", effectKind: "transfigure-all-for-essence" as const, canonicalMechanicId: "transfigure-deck-for-essence" as const, essence: 2, predicate: "event" as const, transfiguration: "Inspired" as const }] }] } };
    registerSiteContentProvider(createSiteContentProvider(content));
    const state = stateWithSites([makeSite("Exploration")], { deck: f.state.journey.deck, dreamsigns: f.state.journey.dreamsigns, essence: 100, screen: { type: "site", siteId: SITE_ID } });
    const opened = apply(f, state, "OPEN_SITE", { siteId: SITE_ID, selectionRulesVersion: SELECTION_RULES_VERSION }, { seq: 100 }).state;
    const resolved = apply(f, opened, "RESOLVE_EXPLORATION_CHOICE", { siteId: SITE_ID, actionId, selectionRulesVersion: SELECTION_RULES_VERSION, selection: {} }, { seq: 101 });
    expect(resolved.outcome).toBe("applied"); expect(resolved.state.journey.deck).toHaveLength(4);
    const rng = vi.fn(() => 0), completed = apply(f, resolved.state, "COMPLETE_SITE", { siteId: SITE_ID }, { seq: 102, rng });
    expect(completed.outcome).toBe("applied"); expect(completed.state.journey.deck).toEqual(resolved.state.journey.deck); expect(completed.state.journey.screen.type).toBe("dreamscape"); expect(rng).not.toHaveBeenCalled();
  });

});
