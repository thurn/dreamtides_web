import { afterEach, expect, it } from "vitest";
import { RAT, DOLL, RED, RAVEN, TOME, apply, initial, clear, sign, templates } from "./journey-on-gain-fixtures";
import { makeEntry, makeSite, SITE_ID, stateWithSites } from "./sites-fixtures";
import { testSiteContentProvider } from "./test-content-providers";
import { registerSiteContentProvider } from "./sites";
import { createSiteContentProvider } from "../../session/providers/site-provider";
import { buildExplorationRuntime } from "../../session/providers/exploration-provider";
import { explorationOfferPlan } from "../../exploration/offer-usability";
import { makeAuguryTestCard, makeAuguryTestContent } from "../../journey_v2/testing/fixtures";
import { parseDeckEntryId, type DreamsignId } from "../../types/identifiers";
import { parseCardSubtype } from "../../types/card-identity";
import { testCardId, testExplorationActionId, testFoldHash } from "../../types/test-identities";
import { registerDeckContentProvider } from "./deck";
import { registerJourneyTransfigurationProvider } from "./journey-transfiguration";
import { NIGHTMARE_CARD_ID } from "../../data/nightmare";
import type { ExplorationActionContent } from "../../data/exploration";
import { LayerName } from "../../types/layer-name";
import { SELECTION_RULES_VERSION } from "../../reward-selection";
import { applyJourneyRewardEffect } from "./reward-effects";
afterEach(clear);
function prepare(fields: Omit<ExplorationActionContent, "id" | "label">, held: readonly DreamsignId[]) {
  initial();
  const encounter = makeAuguryTestCard({ id: testCardId("acquisition-encounter"), cardNumber: 1, cardType: "Event" });
  const nightmare = makeAuguryTestCard({ id: NIGHTMARE_CARD_ID, cardNumber: 99, cardType: "Event" });
  const content = { ...makeAuguryTestContent({ cards: [encounter, nightmare], dreamsignTemplates: templates }), exploration: { foldHash: testFoldHash("acquisition-fixture"), customCards: [], customDreamsigns: [], encounters: [{ cardId: encounter.id, prose: "Synthetic", actions: [{ id: testExplorationActionId("acquisition-action"), label: "Synthetic", ...fields }] }] } };
  registerDeckContentProvider({ resolveCardNumber: (id) => content.cardDatabase.get(99)?.id === id ? 99 : 1, resolveDreamsign: sign });
  registerJourneyTransfigurationProvider({ resolve: (entry) => ({ cardId: entry.cardNumber === 99 ? NIGHTMARE_CARD_ID : encounter.id, cardType: "Event", subtype: parseCardSubtype(""), forms: entry.transfiguration === null ? ["Enduring"] : [] }) });
  registerSiteContentProvider(createSiteContentProvider(content));
  const site = makeSite("Exploration"), state = stateWithSites([site], { deck: [1, 2, 3].map((n) => makeEntry({ entryId: parseDeckEntryId(`acquisition-${n}`), cardNumber: 1 })), dreamsigns: held.map(sign), remainingDreamsignPool: [RAT, DOLL, RED], screen: { type: "site", siteId: SITE_ID } });
  const runtime = buildExplorationRuntime(state.journey, site, content, () => 0, encounter.id);
  if (runtime === null) throw new Error("Synthetic acquisition preparation unavailable");
  state.journey.siteRuntime[SITE_ID] = runtime;
  return { state, runtime, action: content.exploration.encounters[0].actions[0] };
}
it.each([[RAVEN, TOME], [TOME, RAVEN]])("uses a genuine prepared Nightmare+Rat producer after prohibition, order=%s/%s", (...held) => {
  const { state, runtime, action } = prepare({ effectKind: "gain-nightmare-and-dreamsign", dreamsignId: RAT, nightmareCount: 1 }, held);
  const before = structuredClone(state), draws: number[] = [];
  const intent = { siteId: SITE_ID, actionId: action.id, selectionRulesVersion: SELECTION_RULES_VERSION, expectedEncounterCardId: runtime.encounterCardId, expectedRerollCount: 0, selection: {} };
  const result = apply(state, "RESOLVE_EXPLORATION_CHOICE", intent, { rng: (index) => { draws.push(index); return 0; } });
  expect(result.outcome).toBe("applied"); expect(state).toEqual(before);
  expect(result.state.journey.deck).toHaveLength(4);
  expect(result.state.journey.deck.some((entry) => entry.cardNumber === 99)).toBe(false);
  expect(result.state.journey.dreamsigns.map((sign) => sign.id)).toEqual([...held, RAT]);
  const rat = result.logRecords?.find((row) => row.fields.dreamsignId === RAT);
  expect(rat?.fields).toMatchObject({ before: { deckSize: 3, eligible: 3 }, after: { requested: 1, transformed: 1 } });
  const saved = result.state.journey.siteRuntime[SITE_ID]; if (saved.kind !== "exploration") throw new Error("wrong runtime");
  expect(saved.resolution?.preventedNightmareGains).toHaveLength(1);
  expect(saved.resolution?.gainedCardIds).toEqual([]);
  expect(apply(result.state, "RESOLVE_EXPLORATION_CHOICE", intent).state).toBe(result.state);
  expect(apply(state, "RESOLVE_EXPLORATION_CHOICE", intent, { rng: () => 0 }).state).toEqual(result.state);
  expect(draws).toHaveLength(2);
});
it("retains the existing public refusal of a signed producer with duplicate held UUIDs", () => {
  const { state, runtime, action } = prepare({ effectKind: "purge-selected-dreamsign-and-gain-random", count: 1 }, [RED, RED]);
  const plan = explorationOfferPlan(runtime.actionOffers[0], "dreamsign"); if (plan === null || plan === undefined) throw new Error("missing Dreamsign plan");
  const result = apply(state, "RESOLVE_EXPLORATION_CHOICE", { siteId: SITE_ID, actionId: action.id, selectionRulesVersion: SELECTION_RULES_VERSION, selection: { purgedDreamsignId: RED, overflowReplacementDreamsignIds: [] } });
  expect(result.outcome).toBe("bounced"); expect(result.state).toBe(state);
  expect(result.logRecords).toBeUndefined();
  expect(state.journey.dreamsigns.map((sign) => sign.id)).toEqual([RED, RED]);

});
it("observes the actual append-only reward-effect writer through Augury acceptance", () => {
  const base = initial([RED]);
  const state = stateWithSites([makeSite("Augury")], { deck: base.journey.deck, dreamsigns: base.journey.dreamsigns });
  const template = templates.find((template) => template.id === RAT)!;
  const content = makeAuguryTestContent({ cards: [], dreamsignTemplates: templates });
  registerSiteContentProvider(testSiteContentProvider({ resolveAugury: ({ journey }) => {
    const next = applyJourneyRewardEffect({ state: journey, journeyContent: content, effect: { kind: "add_dreamsign", dreamsignId: RAT, dreamsignTemplate: template }, mintEntryId: (_deck, index) => parseDeckEntryId(`reward-effect-${index}`) });
    return next === null ? null : { journey: next, purges: [] };
  } }));
  const result = apply(state, "ACCEPT_AUGURY_OFFER", { siteId: SITE_ID });
  expect(result.outcome).toBe("applied"); expect(result.state.journey.dreamsigns.map((sign) => sign.id)).toEqual([RED, RAT]);
  expect(result.state.journey.deck.filter((entry) => entry.transfiguration !== null)).toHaveLength(2);
  expect(result.logRecords?.filter((row) => row.fields.hook === "on_dreamsign_gain")).toHaveLength(1);
});

it("applies the genuine signed purge-and-gain producer with unique held identities", () => {
  const { state, runtime, action } = prepare({ effectKind: "purge-selected-dreamsign-and-gain-random", count: 1 }, [RED]);
  const plan = explorationOfferPlan(runtime.actionOffers[0], "dreamsign"); if (plan === null || plan === undefined) throw new Error("missing plan");
  const result = apply(state, "RESOLVE_EXPLORATION_CHOICE", { siteId: SITE_ID, actionId: action.id, selectionRulesVersion: SELECTION_RULES_VERSION, selection: { purgedDreamsignId: RED, overflowReplacementDreamsignIds: [] } });
  expect(result.outcome).toBe("applied"); expect(result.state.journey.dreamsigns.map((sign) => sign.id)).toEqual(plan.preparedDreamsignIds);
  const saved = result.state.journey.siteRuntime[SITE_ID]; if (saved.kind !== "exploration") throw new Error("wrong runtime");
  expect(saved.resolution?.dreamsignMutation).toMatchObject({ beforeIds: [RED], afterIds: plan.preparedDreamsignIds, purgedIds: [RED], gainedIds: plan.preparedDreamsignIds });
  expect(result.logRecords?.filter((row) => row.fields.hook === "on_dreamsign_gain").map((row) => row.fields.dreamsignId)).toEqual(plan.preparedDreamsignIds.filter((id) => id === RAT || id === DOLL));
});
it("keeps two newly acquired Doll physical rights distinct through first conversion and reload", () => {
  const base = initial([RED]), state = stateWithSites([makeSite("Augury")], { deck: base.journey.deck, dreamsigns: base.journey.dreamsigns });
  for (const node of Object.values(state.journey.atlas.nodes)) node.layer = LayerName.One;
  const template = templates.find((template) => template.id === DOLL)!, content = makeAuguryTestContent({ cards: [], dreamsignTemplates: templates });
  registerSiteContentProvider(testSiteContentProvider({ resolveAugury: ({ journey }) => {
    const effect = { kind: "add_dreamsign" as const, dreamsignId: DOLL, dreamsignTemplate: template };
    const next = applyJourneyRewardEffect({ state: journey, journeyContent: content, effect: { kind: "composite", children: [effect, effect] }, mintEntryId: (_deck, index) => parseDeckEntryId(`double-doll-${index}`) });
    return next === null ? null : { journey: next, purges: [] };
  } }));
  let pending = apply(state, "ACCEPT_AUGURY_OFFER", { siteId: SITE_ID }).state;
  if (pending.journey.screen.type !== "journeyDreamsign" || pending.journey.screen.choice.kind !== "copy") throw new Error("missing Doll queue");
  const permissionSeq = pending.journey.screen.choice.permissionSeq;
  expect(pending.journey.screen.choice.sources.map((source) => source.heldIndex)).toEqual([1, 2]);
  const first = apply(pending, "RESOLVE_DREAMSIGN_COPY", { sourceDreamsignId: DOLL, heldIndex: 1, choiceIndex: 0, permissionSeq, targetHeldIndex: 0, expectedTargetDreamsignId: RED }); expect(first.outcome).toBe("applied"); pending = first.state;
  const loaded = apply(pending, "LOAD_STATE", { snapshot: structuredClone(pending.journey) }); expect(loaded.outcome).toBe("applied"); pending = loaded.state;
  const second = apply(pending, "RESOLVE_DREAMSIGN_COPY", { sourceDreamsignId: DOLL, heldIndex: 2, choiceIndex: 1, permissionSeq, targetHeldIndex: 1, expectedTargetDreamsignId: RED }); expect(second.outcome).toBe("applied");
  expect(second.state.journey.dreamsigns.map((sign) => sign.id)).toEqual([RED, RED, RED]); expect(second.state.journey.deck).toEqual(state.journey.deck);
});

it.each([
  ["gain-dreamsign", 2, RED, 1], ["gain-dreamsign", 2, TOME, 1], ["gain-dreamsign", 1, RED, 0],
  ["gain-random-dreamsign", 2, RED, 1], ["gain-random-dreamsign", 2, TOME, 1], ["gain-random-dreamsign", 1, RED, 0],
] as const)("matches the public %s writer at capacity=%s with selection %s", (effectKind, capacity, replacedDreamsignId, heldIndex) => {
  const { state, runtime, action } = prepare({ effectKind, ...(effectKind === "gain-dreamsign" ? { dreamsignId: RAT } : {}) }, [RED]);
  state.journey.maxDreamsigns = capacity;
  const gained = effectKind === "gain-dreamsign" ? RAT : runtime.actionOffers[0].offeredDreamsignIds?.[0];
  if (gained === undefined) throw new Error("Synthetic prepared gain is unavailable");
  const before = structuredClone(state);
  const intent = { siteId: SITE_ID, actionId: action.id, selectionRulesVersion: SELECTION_RULES_VERSION, expectedEncounterCardId: runtime.encounterCardId, expectedRerollCount: 0, selection: { replacedDreamsignId } };
  const result = apply(state, "RESOLVE_EXPLORATION_CHOICE", intent, { rng: () => 0 });
  expect(result.outcome).toBe("applied"); expect(state).toEqual(before);
  expect(result.state.journey.dreamsigns.map((sign) => sign.id)).toEqual(heldIndex === 0 ? [gained] : [RED, gained]);
  const gains = result.logRecords?.filter((row) => row.fields.hook === "on_dreamsign_gain");
  expect(gains?.map((row) => ({ dreamsignId: row.fields.dreamsignId, heldIndex: row.fields.heldIndex }))).toEqual(gained === RAT || gained === DOLL ? [{ dreamsignId: gained, heldIndex }] : []);
  expect(apply(state, "RESOLVE_EXPLORATION_CHOICE", intent, { rng: () => 0 }).state).toEqual(result.state);
  expect(apply(result.state, "RESOLVE_EXPLORATION_CHOICE", intent).state).toBe(result.state);
});
