import { makeAuguryFixture } from "./register-game-providers.fixtures";
import { buildAuguryContext } from "../../journey_v2/context/buildAuguryContext";
import { generateAuguryEncounter } from "../../journey_v2/encounter/generateAuguryEncounter";
import { parseAuguryArchetypeId } from "../../types/identifiers";
import { afterEach, describe, expect, it } from "vitest";
import type { ExplorationEffectKind } from "../../data/exploration";
import type { ExplorationResolution, SiteState } from "../../types/journey";
import { testCardId, testDreamsignId, testExplorationActionId, testDreamscapeId } from "../../types/test-identities";
import { parseDeckEntryId, parseSiteId, parseAtlasNodeId } from "../../types/identifiers";
import { makeAuguryTestCard, makeAuguryTestContent, makeAuguryTestJourneyState } from "../../journey_v2/testing/fixtures";
import { testJourneyState } from "../../testing/journey-genesis";
import { makeTestAtlasNode } from "../../testing/atlas-fixtures";
import { SELECTION_RULES_VERSION } from "../../reward-selection";
import { explorationPurgeReceipts, auguryPurgeReceipts } from "./journey-purge-receipts";
import { createSiteContentProvider } from "./site-provider";
import { buildExplorationRuntime } from "./exploration-provider";
import { createJourneyModifierRegistry } from "../../rules/journey/modifier-registry";
import { journeyEssence } from "../../rules/journey/journey-essence";
import { registerSiteContentProvider } from "../../rules/journey/sites";
import { reduceGameEvent } from "../../rules/reducer";
import { initialFoldState } from "../../rules/fold-state";
import { ctx, event } from "../../rules/journey/lifecycle-fixtures";

const A = parseDeckEntryId("original-a"), B = parseDeckEntryId("original-b"), C = testCardId("same-original-card"),
  SOURCE = testCardId("exploration-source"), ACTION = testExplorationActionId("actual-purge-action"), FRUIT = testDreamsignId("receipt-fruit");
const resolution = (entries = [A, B], cards = [C, C]): ExplorationResolution => ({
  actionId: ACTION, gainedCardIds: [], gainedDreamsignIds: [], purgedCardIds: cards,
  purgedEntryIds: entries, affectedEntryIds: [], essenceGained: 0 });
afterEach(() => registerSiteContentProvider(null));

describe("validated semantic purge receipts", () => {
  it.each<ExplorationEffectKind>(["purge-and-copy", "purge-one-transfigure-and-copy-others", "purge-selected",
    "purge-starter-card", "purge-random-starter-card", "purge-random-starter-and-gain-card", "purge-for-essence",
    "purge-disclosed-and-transfigure-same-type", "purge-random-subtype-and-increase-spark", "purge-duplicates-and-grant-reclaim"] )("preserves original concrete identities and repeated card UUIDs for %s", (kind) => {
      const result = resolution();
      expect(explorationPurgeReceipts(kind, result)).toEqual([{ entryId: A, cardId: C }, { entryId: B, cardId: C }]);
      expect(result.purgedEntryIds).toEqual([A, B]);
    });
  it.each<ExplorationEffectKind>(["replace-selected", "replace-selected-with-card", "replace-random-with-card", "replace-all-starter-cards",
    "purge-dreamsign-for-essence", "purge-selected-dreamsign-and-gain-random", "gain-card"] )("excludes presentation removal records for %s", (kind) => {
      expect(explorationPurgeReceipts(kind, resolution())).toEqual([]);
    });
  it("rejects inconsistent original identity arrays instead of inventing or dropping a card UUID", () => {
    expect(() => explorationPurgeReceipts("purge-selected", resolution([A, B], [C]))).toThrow();
  });
  it("captures validated Augury purge children while excluding other reward kinds", () => {
    expect(auguryPurgeReceipts({ kind: "composite", children: [
      { kind: "remove_deck_entry", entryId: A, cardUuid: C, cardNumber: 1 },
      { kind: "add_essence", amount: 10 },
      { kind: "composite", children: [{ kind: "remove_deck_entry", entryId: B, cardUuid: C, cardNumber: 1 }] },
    ] })).toEqual([{ entryId: A, cardId: C }, { entryId: B, cardId: C }]);
    expect(auguryPurgeReceipts({ kind: "add_essence", amount: 10 })).toEqual([]);
  });
  it.each(["purge", "duplicate"] as const)("folds actual Augury %s through its production provider with only semantic Fruit gains", (kind) => {
    const fixture = makeAuguryFixture();
    const content = { ...fixture.content, rewardSelectionData: { ...fixture.content.rewardSelectionData,
      tuning: { ...fixture.content.rewardSelectionData.tuning, minDeckForPurge: 2 } } };
    const provider = createSiteContentProvider(content); registerSiteContentProvider(provider);
    const registry = createJourneyModifierRegistry([journeyEssence(FRUIT, { kind: "purgedCardEssence", amount: 13 })]);
    let before = { ...initialFoldState(fixture.journey.seed, ctx().contentConfig), journey: { ...fixture.journey,
      dreamsigns: [{ id: FRUIT, name: "", effectDescription: "" }] } };
    const open = reduceGameEvent(before, event("OPEN_SITE", { siteId: fixture.site.id, selectionRulesVersion: SELECTION_RULES_VERSION }), ctx(), registry);
    expect(open.outcome).toBe("applied"); before = open.state;
    const forced = reduceGameEvent(before, event("FORCE_AUGURY_ARCHETYPE", { siteId: fixture.site.id, archetypeId: parseAuguryArchetypeId(kind) }), ctx(), registry);
    expect(forced.outcome).toBe("applied"); before = forced.state;
    const encounter = generateAuguryEncounter(buildAuguryContext({ journeyState: before.journey, journeyContent: content, site: fixture.site }));
    const offer = encounter.offers.find((candidate) => candidate.archetypeId === kind);
    if (offer === undefined) throw new Error("forced synthetic offer unavailable");
    const payload = { siteId: fixture.site.id, encounterSignature: offer.encounterSignature, offerId: offer.offerId,
      archetypeId: offer.archetypeId, selectionRulesVersion: SELECTION_RULES_VERSION,
      ...(offer.choiceRequest === undefined ? {} : { choice: { choiceId: offer.choiceRequest.candidates[0].choiceId } }) };
    const domain = provider.resolveAugury({ journey: before.journey, site: fixture.site, action: "accept", payload, seq: ctx().seq, rng: ctx().rng });
    if (domain === null) throw new Error("synthetic provider rejected actual offer");
    const result = reduceGameEvent(before, event("ACCEPT_AUGURY_OFFER", payload), ctx(), registry);
    expect(result.outcome).toBe("applied");
    if (result.outcome !== "applied") throw new Error("expected applied actual offer");
    expect(result.purges).toEqual(kind === "purge" ? domain.purges : []);
    expect(domain.purges).toHaveLength(kind === "purge" ? 1 : 0);
    expect(result.state.journey.essence).toBe(domain.journey.essence + (kind === "purge" ? 13 : 0));
    expect(reduceGameEvent(result.state, event("ACCEPT_AUGURY_OFFER", payload), ctx(), registry).state).toBe(result.state);
    expect(reduceGameEvent(before, event("ACCEPT_AUGURY_OFFER", { ...payload, encounterSignature: "stale" }), ctx(), registry).state).toBe(before);
  });
  it.each(["purge-random-starter-and-gain-card", "replace-all-starter-cards"] as const)("transports actual public %s semantics through the production provider and root hook", (kind) => {
      const source = makeAuguryTestCard({ id: SOURCE, cardNumber: 1 }),
        starter = makeAuguryTestCard({ id: C, cardNumber: 2, isStarter: true }),
        replacement = makeAuguryTestCard({ id: testCardId("replacement"), cardNumber: 3, isStarter: false });
      const content = makeAuguryTestContent({ cards: [source, starter, replacement] });
      content.exploration = { ...content.exploration, encounters: [{ cardId: SOURCE, prose: "",
        actions: [{ id: ACTION, label: "", effectKind: kind, predicate: "character" }] }] };
      const site: SiteState = { id: parseSiteId("semantic-exploration"), type: "Exploration", isEnhanced: false, isVisited: false }, nodeId = parseAtlasNodeId("semantic-node");
      const journey = makeAuguryTestJourneyState({ currentDreamscape: nodeId, screen: { type: "site", siteId: site.id },
        deck: [{ entryId: A, cardNumber: 2, isBane: false, transfiguration: null }],
        dreamsigns: [{ id: FRUIT, name: "", effectDescription: "" }],
        atlas: { ...testJourneyState().atlas, nodes: { [nodeId]: { ...makeTestAtlasNode(nodeId, [site]), dreamscapeId: testDreamscapeId("semantic-place") } } } });
      const runtime = buildExplorationRuntime(journey, site, content, () => 0);
      expect(runtime).not.toBeNull(); if (runtime === null) throw new Error("missing usable synthetic offer");
      const provider = createSiteContentProvider(content); registerSiteContentProvider(provider);
      const before = { ...initialFoldState(journey.seed, ctx().contentConfig), journey: { ...journey, siteRuntime: { [site.id]: runtime } } };
      const registry = createJourneyModifierRegistry([journeyEssence(FRUIT, { kind: "purgedCardEssence", amount: 13 })]);
      const payload = { siteId: site.id, actionId: ACTION, selectionRulesVersion: SELECTION_RULES_VERSION };
      const result = reduceGameEvent(before, event("RESOLVE_EXPLORATION_CHOICE", payload), ctx(), registry);
      expect(result.outcome).toBe("applied");
      if (result.outcome !== "applied") throw new Error("expected validated semantic resolution");
      expect(result.purges).toEqual(kind === "purge-random-starter-and-gain-card" ? [{ entryId: A, cardId: C }] : []);
      expect(result.state.journey.essence - before.journey.essence).toBe(kind === "purge-random-starter-and-gain-card" ? 13 : 0);
      expect(reduceGameEvent(result.state, event("RESOLVE_EXPLORATION_CHOICE", payload), ctx(), registry).state).toBe(result.state);
    });
});
