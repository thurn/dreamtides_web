import { describe, expect, it } from "vitest";
import { makeAuguryTestCard, makeAuguryTestContent } from "../../journey_v2/testing/fixtures";
import { testJourneyState } from "../../testing/journey-genesis";
import { makeTestAtlasNode } from "../../testing/atlas-fixtures";
import { parseAtlasNodeId, parseSiteId } from "../../types/identifiers";
import { testCardId, testDreamsignId, testExplorationActionId } from "../../types/test-identities";
import type { ExplorationSiteRuntime, SiteState } from "../../types/journey";
import { SELECTION_RULES_VERSION } from "../../reward-selection";
import { buildExplorationRuntime, resolveExplorationChoice } from "./exploration-provider";
import { createSiteContentProvider } from "./site-provider";

const cards = [1, 2, 3].map((cardNumber) => makeAuguryTestCard({ id: testCardId(`encounter-${String(cardNumber)}`), cardNumber }));
const ACTION = testExplorationActionId("shared-across-encounters");
const SOURCE = testDreamsignId("reroll-source");
const SITE: SiteState = { id: parseSiteId("exploration-reroll-site"), type: "Exploration", isEnhanced: false, isVisited: false };
const NODE = parseAtlasNodeId("exploration-reroll-node");
function fixture(count = 3) {
  const base = makeAuguryTestContent({ cards });
  const content = { ...base, exploration: { ...base.exploration, encounters: cards.slice(0, count).map((card) => ({
    cardId: card.id, prose: "Synthetic prose.", actions: [{ id: ACTION, label: "Synthetic action", effectKind: "gain-card" as const, cardId: card.id }],
  })) } };
  const before = testJourneyState("exploration-reroll");
  const journey = { ...before, currentDreamscape: NODE, screen: { type: "site" as const, siteId: SITE.id }, atlas: { ...before.atlas, nodes: { [NODE]: makeTestAtlasNode(NODE, [SITE]) } } };
  const runtime = buildExplorationRuntime(journey, SITE, content, () => { throw new Error("live RNG forbidden"); });
  if (runtime === null) throw new Error("fixture must provide an encounter");
  return { content, journey: { ...journey, siteRuntime: { [SITE.id]: runtime } }, runtime };
}
function intent(runtime: ExplorationSiteRuntime, counter = 0) {
  return { siteId: SITE.id, actionId: ACTION, selectionRulesVersion: SELECTION_RULES_VERSION, expectedEncounterCardId: runtime.encounterCardId, expectedRerollCount: counter };
}

describe("real Exploration provider journeySites redraw", () => {
  it("selects a different usable encounter deterministically and rebuilds a normally resolvable offer", () => {
    const f = fixture();
    const provider = createSiteContentProvider(f.content);
    const input = { journey: f.journey, site: SITE, runtime: f.runtime, selectionRulesVersion: SELECTION_RULES_VERSION };
    const next = provider.rerollExploration(input);
    expect(next).not.toBeNull();
    if (next === null) return;
    expect(next.encounterCardId).not.toBe(f.runtime.encounterCardId);
    expect(next.encounterSignature).not.toBe(f.runtime.encounterSignature);
    expect(provider.rerollExploration(input)).toEqual(next);
    const reversed = createSiteContentProvider({ ...f.content, exploration: { ...f.content.exploration, encounters: [...f.content.exploration.encounters].reverse() } });
    expect(reversed.rerollExploration(input)).toEqual(next);
    const persisted = { ...next, journeySiteRerolls: { [SOURCE]: 1 } };
    const journey = { ...f.journey, siteRuntime: { [SITE.id]: persisted } };
    const resolved = resolveExplorationChoice({ journey, site: SITE, payload: intent(next, 1), seq: 1, content: f.content });
    expect(resolved).not.toBeNull();
    expect((resolved?.siteRuntime[SITE.id] as ExplorationSiteRuntime).resolution?.gainedCardIds).toEqual([next.encounterCardId]);
    expect(f.journey.deck).toEqual([]);
  });
  it("returns null for one encounter or no usable alternative, without mutating the journey", () => {
    const f = fixture(1);
    const provider = createSiteContentProvider(f.content);
    const before = structuredClone(f.journey);
    expect(provider.rerollExploration({ journey: f.journey, site: SITE, runtime: f.runtime, selectionRulesVersion: SELECTION_RULES_VERSION })).toBeNull();
    expect(f.journey).toEqual(before);
    const content = { ...f.content, exploration: { ...f.content.exploration, encounters: [
      ...f.content.exploration.encounters,
      { cardId: cards[1].id, prose: "Synthetic unusable scene.", actions: [{ id: ACTION, label: "Synthetic", effectKind: "gain-card" as const, cardId: testCardId("missing-card") }] },
    ] } };
    expect(createSiteContentProvider(content).rerollExploration({ journey: f.journey, site: SITE, runtime: f.runtime, selectionRulesVersion: SELECTION_RULES_VERSION })).toBeNull();
  });
  it("rejects stale shared action UUIDs and missing context after a reroll, including a returned encounter", () => {
    const f = fixture();
    const next = createSiteContentProvider(f.content).rerollExploration({ journey: f.journey, site: SITE, runtime: f.runtime, selectionRulesVersion: SELECTION_RULES_VERSION });
    if (next === null) throw new Error("fixture redraw must succeed");
    const journey = { ...f.journey, siteRuntime: { [SITE.id]: { ...next, journeySiteRerolls: { [SOURCE]: 1 } } } };
    const resolve = (payload: Record<string, unknown>) => resolveExplorationChoice({ journey, site: SITE, payload, seq: 2, content: f.content });
    expect(resolve(intent(f.runtime))).toBeNull();
    expect(resolve({ siteId: SITE.id, actionId: ACTION, selectionRulesVersion: SELECTION_RULES_VERSION })).toBeNull();
    expect(resolve({ ...intent(next, 1), expectedRerollCount: 0 })).toBeNull();
    expect(resolve(intent(next, 1))).not.toBeNull();
    const returned = { ...f.journey, siteRuntime: { [SITE.id]: { ...f.runtime, journeySiteRerolls: { [SOURCE]: 2 } } } };
    expect(resolveExplorationChoice({ journey: returned, site: SITE, payload: intent(f.runtime, 0), seq: 3, content: f.content })).toBeNull();
    expect(resolveExplorationChoice({ journey: returned, site: SITE, payload: intent(f.runtime, 2), seq: 3, content: f.content })).not.toBeNull();
  });
  it("keeps legacy unresolved pre-reroll intents compatible, and rejects forged current preparations", () => {
    const f = fixture();
    const payload = { siteId: SITE.id, actionId: ACTION, selectionRulesVersion: SELECTION_RULES_VERSION };
    expect(resolveExplorationChoice({ journey: f.journey, site: SITE, payload, seq: 1, content: f.content })).not.toBeNull();
    const invalid = { ...f.journey, siteRuntime: { [SITE.id]: { ...f.runtime, actionOffers: [] } } };
    expect(resolveExplorationChoice({ journey: invalid, site: SITE, payload: intent(f.runtime), seq: 1, content: f.content })).toBeNull();
  });
});
