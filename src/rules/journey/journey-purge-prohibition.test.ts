import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalLog, type LocalLogRecord } from "../../eventlog/local-log";
import { foldEvents } from "../../eventlog/fold";
import type { EngineConfig, EventContext } from "../../eventlog/types";
import { parseAtlasNodeId, parseDeckEntryId, parseSiteId, type DreamsignId, type DeckEntryId } from "../../types/identifiers";
import { testCardId, testDreamscapeId, testDreamsignId, testEventActor, testExplorationActionId } from "../../types/test-identities";
import { SELECTION_RULES_VERSION } from "../../reward-selection";
import { makeAuguryTestCard, makeAuguryTestContent, makeAuguryTestJourneyState } from "../../journey_v2/testing/fixtures";
import { testJourneyState } from "../../testing/journey-genesis";
import { makeTestAtlasNode } from "../../testing/atlas-fixtures";
import { createSiteContentProvider } from "../../session/providers/site-provider";
import { buildExplorationRuntime } from "../../session/providers/exploration-provider";
import { makeAuguryFixture } from "../../session/providers/register-game-providers.fixtures";
import { buildAuguryContext } from "../../journey_v2/context/buildAuguryContext";
import { generateAuguryEncounter } from "../../journey_v2/encounter/generateAuguryEncounter";
import { parseAuguryArchetypeId } from "../../types/identifiers";
import { auguryPurgeReceipts } from "../../session/providers/journey-purge-receipts";
import type { AuguryApplyPayload } from "../../journey_v2/types";
import type { SiteState } from "../../types/journey";
import { initialFoldState, type FoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import type { GameEventType } from "../events";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import { ctx, event, GENESIS } from "./lifecycle-fixtures";
import { makeEntry, makeSite, SITE_ID, stateWithSites } from "./sites-fixtures";
import { registerSiteContentProvider } from "./sites";
import { registerDeckContentProvider } from "./deck";
import { testSiteContentProvider } from "./test-content-providers";
import { createJourneyModifierRegistry, type JourneyModifierDefinition } from "./modifier-registry";
import { journeyEssence } from "./journey-essence";
import { currentPurgeSource, journeyPurge } from "./journey-purge";

const SHIELD = testDreamsignId("purge-prohibition"), FRUIT = testDreamsignId("purge-payout"),
  EXCHANGE = testDreamsignId("exact-exchange"), EARNED = testDreamsignId("earned-purge"),
  OBSERVER = testDreamsignId("positive-observer"), OTHER = testDreamsignId("same-name-other-identity");
const A = parseDeckEntryId("physical-a"), B = parseDeckEntryId("physical-b"), BANE = parseDeckEntryId("physical-bane");
const sign = (id: DreamsignId) => ({ id, name: "same synthetic name", effectDescription: "" });
const observer = vi.fn<JourneyModifierDefinition["afterJourneyEvent"]>(({ random }) => { random(); return null; });
const registry = createJourneyModifierRegistry([
  journeyPurge(SHIELD, { kind: "preventPurge" }),
  journeyPurge(EXCHANGE, { kind: "replaceEssenceWithPurge", count: 2 }),
  journeyPurge(EARNED, { kind: "afterBattlePurge", maxCount: 2 }),
  journeyEssence(FRUIT, { kind: "purgedCardEssence", amount: 7 }),
  { dreamsignId: OBSERVER, afterJourneyEvent: observer },
]);
function state(type: "Purge" | "Essence" | "Augury" = "Purge", ids: readonly DreamsignId[] = []) {
  return stateWithSites([makeSite(type)], { essence: 100, dreamsigns: ids.map(sign), deck: [
    makeEntry({ entryId: A, cardNumber: 1 }), makeEntry({ entryId: B, cardNumber: 1 }),
    makeEntry({ entryId: BANE, cardNumber: 2, isBane: true }),
  ] });
}
function apply(before: FoldState, type: GameEventType, payload: Record<string, unknown> = {}, context: EventContext = ctx(), modifiers = registry) {
  return reduceGameEvent(before, event(type, payload), context, modifiers);
}
function accepted(before: FoldState, type: GameEventType, payload: Record<string, unknown> = {}) {
  const result = apply(before, type, payload); expect(result.outcome).toBe("applied"); return result.state;
}
function denied(before: FoldState, type: GameEventType, payload: Record<string, unknown> = {}, context = ctx(), modifiers = registry) {
  const snapshot = structuredClone(before);
  const result = apply(before, type, payload, context, modifiers);
  expect(result).toEqual({ outcome: "bounced", bounceReason: "invalid_action", state: before });
  expect(result.state).toBe(before); expect(before).toEqual(snapshot);
}
function permissionPayload(before: FoldState, entryIds: readonly DeckEntryId[]) {
  if (before.journey.screen.type !== "journeyPurge") throw new Error("missing earned permission");
  const choice = before.journey.screen.choice, source = currentPurgeSource(choice);
  if (source === undefined) throw new Error("missing earned source");
  return { siteId: choice.siteId, dreamsignId: source.dreamsignId, heldIndex: source.heldIndex,
    choiceIndex: choice.kind === "afterBattle" ? choice.index : 0, entryIds };
}
beforeEach(() => {
  observer.mockClear();
  const provider = testSiteContentProvider();
  registerSiteContentProvider({ ...provider, economyData: { ...provider.economyData,
    purge: { ...provider.economyData.purge, marginalCosts: [19, 23] } } });
  registerDeckContentProvider({ resolveCardNumber: () => 1, resolveDreamsign: sign });
});
afterEach(() => { registerSiteContentProvider(null); registerDeckContentProvider(null); });

describe("registered journey purge prohibition through public folds", () => {
  it.each([{ entryIds: [A] }, { entryIds: [BANE] }, { entryIds: [A, B] }])("rejects paid physical purge $entryIds before costs and all positive observers", ({ entryIds }) => {
    const before = state("Purge", [FRUIT, SHIELD, OBSERVER, SHIELD]);
    const random = vi.fn(() => 0);
    denied(before, "PURGE_DECK_CARDS", { siteId: SITE_ID, entryIds }, ctx({ rng: random }));
    expect(observer).not.toHaveBeenCalled(); expect(random).not.toHaveBeenCalled();
    const control = state("Purge", [FRUIT, OTHER, OBSERVER]);
    const result = apply(control, "PURGE_DECK_CARDS", { siteId: SITE_ID, entryIds });
    expect(result.outcome).toBe("applied");
    if (result.outcome !== "applied") throw new Error("expected real purge");
    expect(result.purges?.map(({ entryId }) => entryId)).toEqual(entryIds);
    expect(result.state.journey.deck).toHaveLength(3 - entryIds.length);
    const paidCount = entryIds.filter((id) => id !== BANE).length;
    const cost = [0, 19, 42][paidCount];
    expect(result.state.journey.essence).toBe(control.journey.essence - cost + 7 * entryIds.length);
    expect(observer).toHaveBeenCalledTimes(1);
  });
  it.each(["PURGE_ALL_NIGHTMARE_CARDS", "PURGE_RANDOM_NIGHTMARE_CARDS"] as const)("rejects genuine %s while preserving empty-target rejection and administrative removal", (type) => {
    const before = state("Purge", [SHIELD, FRUIT]);
    denied(before, type, { count: 2 });
    const control = accepted(state("Purge", [OTHER, FRUIT]), type, { count: 2 });
    expect(control.journey.deck.map(({ entryId }) => entryId)).toEqual([A, B]);
    expect(control.journey.essence).toBe(107);
    const empty = { ...before, journey: { ...before.journey, deck: before.journey.deck.slice(0, 2) } };
    expect(apply(empty, type, { count: 2 }).state).toBe(empty);
    expect(accepted(before, "REMOVE_DECK_ENTRY", { entryId: A }).journey.deck.map(({ entryId }) => entryId)).toEqual([B, BANE]);
  });
  it("preserves an exact Essence exchange and its continuation until protection is lost, while collection remains legal", () => {
    const opened = accepted(state("Essence", [EXCHANGE, FRUIT, SHIELD]), "OPEN_SITE", { siteId: SITE_ID, selectionRulesVersion: SELECTION_RULES_VERSION });
    const payload = permissionPayload(opened, [A, B]);
    denied(opened, "RESOLVE_JOURNEY_PURGE", payload);
    const loaded = accepted(opened, "LOAD_STATE", { snapshot: structuredClone(opened.journey) });
    denied(loaded, "RESOLVE_JOURNEY_PURGE", payload);
    const collected = accepted(opened, "ACCEPT_ESSENCE", { siteId: SITE_ID });
    expect(collected.journey.essence).toBeGreaterThan(opened.journey.essence);
    expect(collected.journey.deck).toEqual(opened.journey.deck);
    const lost = accepted(opened, "REMOVE_DREAMSIGN", { dreamsignId: SHIELD });
    const purged = accepted(lost, "RESOLVE_JOURNEY_PURGE", payload);
    expect(purged.journey.deck.map(({ entryId }) => entryId)).toEqual([BANE]);
    expect(purged.journey.essence).toBe(114); expect(purged.journey.screen.type).toBe("dreamscape");
    expect(apply(purged, "RESOLVE_JOURNEY_PURGE", payload).state).toBe(purged);
  });
  it("preserves earned maximum and zero-entry declines independently of current permission-source holdings", () => {
    const site = { ...makeSite("Battle"), isVisited: true };
    const base = stateWithSites([site], { ...state().journey, currentDreamscape: null,
      dreamsigns: [sign(SHIELD)], screen: { type: "journeyPurge", choice: { kind: "afterBattle", siteId: SITE_ID,
        sources: [{ dreamsignId: EARNED, heldIndex: 0, maxCount: 2 }], index: 0, returnTo: "atlas" } } });
    // Keep the actual visited Battle site rather than the Purge fixture's atlas.
    base.journey.atlas = { ...stateWithSites([site]).journey.atlas, layers: [[parseAtlasNodeId("node-1")]] };
    denied(base, "RESOLVE_JOURNEY_PURGE", permissionPayload(base, [A, B]));
    const declined = accepted(base, "RESOLVE_JOURNEY_PURGE", permissionPayload(base, []));
    expect(declined.journey.deck).toEqual(base.journey.deck); expect(declined.journey.screen.type).toBe("atlas");
    const lost = accepted(base, "REMOVE_DREAMSIGN", { dreamsignId: SHIELD });
    const purged = accepted(lost, "RESOLVE_JOURNEY_PURGE", permissionPayload(lost, [A, B]));
    expect(purged.journey.deck.map(({ entryId }) => entryId)).toEqual([BANE]);
    expect(purged.journey.screen.type).toBe("atlas");
  });
  it("uses post-domain holdings and canonical recursive Augury receipts atomically, without additional modifier RNG", () => {
    const cardId = testCardId("same-card-uuid");
    const compound: AuguryApplyPayload = { kind: "composite", children: [
      { kind: "remove_deck_entry", entryId: A, cardUuid: cardId, cardNumber: 1 },
      { kind: "composite", children: [{ kind: "add_essence", amount: 30 },
        { kind: "remove_deck_entry", entryId: B, cardUuid: cardId, cardNumber: 1 }] },
    ] };
    for (const [initial, final, blocked] of [
      [[], [SHIELD], true], [[SHIELD], [SHIELD], true], [[], [], false],
    ] as const) {
      registerSiteContentProvider(testSiteContentProvider({ resolveAugury: ({ journey, rng }) => {
        rng(0); return { journey: { ...journey, deck: journey.deck.filter(({ entryId }) => entryId !== A && entryId !== B),
          dreamsigns: [sign(FRUIT), sign(OBSERVER), ...final.map(sign)], essence: journey.essence + 30,
          remainingDreamsignPool: [OTHER], screen: { type: "dreamscape" } }, purges: auguryPurgeReceipts(compound) };
      } }));
      const before = state("Augury", [FRUIT, OBSERVER, ...initial]), random = vi.fn(() => 0);
      observer.mockClear();
      if (blocked) {
        denied(before, "ACCEPT_AUGURY_OFFER", { siteId: SITE_ID }, ctx({ rng: random }));
        expect(observer).not.toHaveBeenCalled();
      } else {
        const result = apply(before, "ACCEPT_AUGURY_OFFER", { siteId: SITE_ID }, ctx({ rng: random }));
        expect(result.outcome).toBe("applied"); expect(result.state.journey.deck.map(({ entryId }) => entryId)).toEqual([BANE]);
        expect(result.state.journey.essence).toBe(144); expect(observer).toHaveBeenCalledTimes(1);
        expect(result.state.journey.remainingDreamsignPool).toEqual([OTHER]);
      }
      expect(random.mock.calls).toEqual(blocked ? [[0]] : [[0], [1]]);
    }
  });
  it("allows a genuine same-compound purge when the validated Exploration result loses its protection", () => {
    const cardId = testCardId("compound-original"), actionId = testExplorationActionId("compound-loss");
    const initial = stateWithSites([makeSite("Exploration")], { ...state().journey,
      dreamsigns: [sign(SHIELD), sign(FRUIT), sign(OBSERVER)],
      siteRuntime: { [SITE_ID]: { kind: "exploration", selectionRulesVersion: SELECTION_RULES_VERSION,
        encounterCardId: cardId, actionOffers: [], resolution: null } } });
    initial.journey.atlas = stateWithSites([makeSite("Exploration")]).journey.atlas;
    registerSiteContentProvider(testSiteContentProvider({ resolveExploration: ({ journey }) => ({
      journey: { ...journey, deck: journey.deck.filter(({ entryId }) => entryId !== A),
        dreamsigns: journey.dreamsigns.filter(({ id }) => id !== SHIELD), essence: journey.essence + 30,
        siteRuntime: { ...journey.siteRuntime, [SITE_ID]: { kind: "exploration", selectionRulesVersion: SELECTION_RULES_VERSION,
          encounterCardId: cardId, actionOffers: [], resolution: { actionId, gainedCardIds: [], gainedDreamsignIds: [],
            purgedCardIds: [cardId], purgedEntryIds: [A], affectedEntryIds: [], essenceGained: 30,
            dreamsignMutation: { beforeIds: [SHIELD, FRUIT, OBSERVER], afterIds: [FRUIT, OBSERVER],
              offeredIds: [], gainedIds: [], purgedIds: [SHIELD], replacements: [],
              poolBeforeIds: [], poolAfterIds: [], poolRegenerated: false } } } } },
      purges: [{ entryId: A, cardId }],
    }) }));
    const result = apply(initial, "RESOLVE_EXPLORATION_CHOICE", { siteId: SITE_ID, actionId });
    expect(result.outcome).toBe("applied"); expect(result.state.journey.deck.map(({ entryId }) => entryId)).toEqual([B, BANE]);
    expect(result.state.journey.dreamsigns.map(({ id }) => id)).toEqual([FRUIT, OBSERVER]);
    expect(result.state.journey.essence).toBe(137); expect(observer).toHaveBeenCalledTimes(1);
    expect(initial.journey.deck).toHaveLength(3); expect(initial.journey.essence).toBe(100);
  });
  it("replays denials and source-loss retry, and contains a domain error before retry", () => {
    const initial = state("Purge", [SHIELD, FRUIT]);
    const config: EngineConfig<FoldState> = { ...GAME_ENGINE_CONFIG, genesisState: () => initial,
      reducer: (s, e, c) => reduceGameEvent(s, e, c, registry) };
    const options = { config, genesis: GENESIS, localActor: testEventActor("purge-player"), now: () => ctx().timestamp, devMode: false };
    const log = createLocalLog(options), records: LocalLogRecord<FoldState>[] = [];
    log.subscribe((record) => records.push(record));
    const payload = { siteId: SITE_ID, entryIds: [A, B] };
    log.append({ type: "PURGE_DECK_CARDS", payload });
    log.append({ type: "REMOVE_DREAMSIGN", payload: { dreamsignId: SHIELD } });
    log.append({ type: "PURGE_DECK_CARDS", payload });
    log.append({ type: "PURGE_DECK_CARDS", payload });
    expect(records.map(({ outcome }) => outcome)).toEqual(["bounced", "applied", "applied", "bounced"]);
    expect(records[0].bounceReason).toBe("invalid_action"); expect(records[0].logRecords).toBeUndefined();
    expect(log.state().journey.deck.map(({ entryId }) => entryId)).toEqual([BANE]);
    expect(foldEvents(config, GENESIS, { seq: 0, state: initial }, [...log.events()]).state).toEqual(log.state());
    expect(createLocalLog({ ...options, events: [...log.events()] }).state()).toEqual(log.state());
    let fail = true;
    registerSiteContentProvider(testSiteContentProvider({ resolveAugury: ({ journey }) => {
      const next = { ...journey, essence: journey.essence + 30, deck: journey.deck.slice(1) };
      if (fail) throw new Error("synthetic second-child failure");
      return { journey: next, purges: [{ entryId: A }] };
    } }));
    const augury = state("Augury", [SHIELD]), failureLog = createLocalLog({ ...options,
      config: { ...config, genesisState: () => augury } });
    const failures: LocalLogRecord<FoldState>[] = []; failureLog.subscribe((record) => failures.push(record));
    failureLog.append({ type: "ACCEPT_AUGURY_OFFER", payload: { siteId: SITE_ID } });
    expect(failures[0].bounceReason).toBe("fold_error"); expect(failureLog.state()).toBe(augury);
    fail = false; failureLog.append({ type: "ACCEPT_AUGURY_OFFER", payload: { siteId: SITE_ID } });
    expect(failures[1].bounceReason).toBe("invalid_action"); expect(failureLog.state()).toBe(augury);
  });
  it.each(["purge", "duplicate"] as const)("guards real Augury %s offers with an unprotected control", (kind) => {
    const fixture = makeAuguryFixture();
    const content = { ...fixture.content, rewardSelectionData: { ...fixture.content.rewardSelectionData,
      tuning: { ...fixture.content.rewardSelectionData.tuning, minDeckForPurge: 2 } } };
    const provider = createSiteContentProvider(content); registerSiteContentProvider(provider);
    let before = { ...initialFoldState(fixture.journey.seed, ctx().contentConfig), journey: {
      ...fixture.journey, dreamsigns: [sign(SHIELD), sign(FRUIT)] } };
    before = accepted(before, "OPEN_SITE", { siteId: fixture.site.id, selectionRulesVersion: SELECTION_RULES_VERSION });
    before = accepted(before, "FORCE_AUGURY_ARCHETYPE", { siteId: fixture.site.id, archetypeId: parseAuguryArchetypeId(kind) });
    const encounter = generateAuguryEncounter(buildAuguryContext({ journeyState: before.journey, journeyContent: content, site: fixture.site }));
    const offer = encounter.offers.find((candidate) => candidate.archetypeId === kind);
    if (offer === undefined) throw new Error("missing actual Augury offer");
    const payload = { siteId: fixture.site.id, encounterSignature: offer.encounterSignature, offerId: offer.offerId,
      archetypeId: offer.archetypeId, selectionRulesVersion: SELECTION_RULES_VERSION,
      ...(offer.choiceRequest === undefined ? {} : { choice: { choiceId: offer.choiceRequest.candidates[0].choiceId } }) };
    const domain = provider.resolveAugury({ journey: before.journey, site: fixture.site, action: "accept", payload, seq: ctx().seq, rng: ctx().rng });
    if (domain === null) throw new Error("actual provider rejected offer");
    expect(domain.purges).toHaveLength(kind === "purge" ? 1 : 0);
    if (kind === "purge") denied(before, "ACCEPT_AUGURY_OFFER", payload);
    else expect(apply(before, "ACCEPT_AUGURY_OFFER", payload).state.journey.deck).toHaveLength(before.journey.deck.length + 1);
    const lost = accepted(before, "REMOVE_DREAMSIGN", { dreamsignId: SHIELD });
    // Holdings affect the encounter signature, so generate the legal control's current offer.
    const controlOffer = generateAuguryEncounter(buildAuguryContext({ journeyState: lost.journey, journeyContent: content, site: fixture.site })).offers.find((candidate) => candidate.archetypeId === kind);
    if (controlOffer === undefined) throw new Error("missing unprotected offer");
    const control = apply(lost, "ACCEPT_AUGURY_OFFER", { ...payload, encounterSignature: controlOffer.encounterSignature, offerId: controlOffer.offerId,
      ...(controlOffer.choiceRequest === undefined ? {} : { choice: { choiceId: controlOffer.choiceRequest.candidates[0].choiceId } }) });
    expect(control.outcome).toBe("applied");
    expect(control.state.journey.deck).toHaveLength(before.journey.deck.length + (kind === "purge" ? -1 : 1));
  });
  it.each(["purge-random-starter-and-gain-card", "replace-all-starter-cards"] as const)("uses real Exploration %s receipts rather than deck differences", (kind) => {
    const source = makeAuguryTestCard({ id: testCardId("exploration-source"), cardNumber: 1 }),
      original = makeAuguryTestCard({ id: testCardId("original-starter"), cardNumber: 2, isStarter: true }),
      replacement = makeAuguryTestCard({ id: testCardId("replacement"), cardNumber: 3, isStarter: false });
    const content = makeAuguryTestContent({ cards: [source, original, replacement] }), action = testExplorationActionId("actual-action");
    content.exploration = { ...content.exploration, encounters: [{ cardId: source.id, prose: "", actions: [{ id: action, label: "", effectKind: kind, predicate: "character" }] }] };
    const site: SiteState = { id: parseSiteId("real-exploration"), type: "Exploration", isEnhanced: false, isVisited: false }, node = parseAtlasNodeId("real-node");
    const journey = makeAuguryTestJourneyState({ currentDreamscape: node, screen: { type: "site", siteId: site.id },
      deck: [makeEntry({ entryId: A, cardNumber: 2 })], dreamsigns: [sign(SHIELD), sign(FRUIT)],
      atlas: { ...testJourneyState().atlas, nodes: { [node]: { ...makeTestAtlasNode(node, [site]), dreamscapeId: testDreamscapeId("real-place") } } } });
    const runtime = buildExplorationRuntime(journey, site, content, () => 0);
    if (runtime === null) throw new Error("missing actual Exploration offer");
    const provider = createSiteContentProvider(content); registerSiteContentProvider(provider);
    const before = { ...initialFoldState(journey.seed, ctx().contentConfig), journey: { ...journey, siteRuntime: { [site.id]: runtime } } };
    const payload = { siteId: site.id, actionId: action, selectionRulesVersion: SELECTION_RULES_VERSION };
    if (kind === "purge-random-starter-and-gain-card") denied(before, "RESOLVE_EXPLORATION_CHOICE", payload);
    else {
      const result = apply(before, "RESOLVE_EXPLORATION_CHOICE", payload);
      expect(result.outcome).toBe("applied"); expect(result.state.journey.deck).not.toEqual(before.journey.deck);
      expect(result.state.journey.essence).toBe(before.journey.essence);
    }
    const control = { ...before, journey: { ...before.journey, dreamsigns: [sign(FRUIT)] } };
    const allowed = apply(control, "RESOLVE_EXPLORATION_CHOICE", payload);
    expect(allowed.outcome).toBe("applied"); expect(allowed.state.journey.deck).not.toEqual(control.journey.deck);
    if (allowed.outcome !== "applied") throw new Error("missing actual resolution");
    expect(allowed.purges).toEqual(kind === "purge-random-starter-and-gain-card" ? [{ entryId: A, cardId: original.id }] : []);
    expect(allowed.state.journey.essence - control.journey.essence).toBe(kind === "purge-random-starter-and-gain-card" ? 7 : 0);
  });
});
