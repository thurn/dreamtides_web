import { SELECTION_RULES_VERSION } from "../../reward-selection/types";
import { buildGambleSiteView, GAMBLE_SITE, GUIDE, GUIDE_LINE_SOURCE } from "./gamble-site-view-model.fixtures";
import { testGambleSelectionTrace } from "../../testing/gamble-fixture";
import { parseShuffleCommitment, parseDeckEntryId, parseSelectionKey } from "../../types/identifiers";
import type { FourSuitRepriseSiteRuntime, ExplorationSiteRuntime } from "../../types/journey";
import { testExplorationActionId, testCardId } from "../../types/test-identities";
import { rewardForResolution } from "./exploration-resolution-view-model";
import { buildRewardSelectionContext } from "../../reward-selection/context";
import { selectReward } from "../../reward-selection/selectReward";
import { generateAuguryEncounterWithDebug } from "../../journey_v2/encounter/generateAuguryEncounter";
import { describe, expect, it } from "vitest";
import { sha256 } from "js-sha256";
import { character, eventCard, content, data, entry } from "../../rules/journey/journey-transfiguration-record.fixtures";
import { deckCardChoice } from "./exploration-choices";
import { buildJourneyDebugEditorView } from "./journey-debug-view-model";
import { buildTransfigurationCandidates } from "./transfiguration-view-model";
import { buildAuguryContext } from "../../journey_v2/context/buildAuguryContext";
import { buildAuguryDeckSnapshot } from "../../journey_v2/trace/deckSnapshot";
import { makeAuguryTestJourneyState, makeAuguryTestSite } from "../../journey_v2/testing/fixtures";
import { resolveDeckEntryCard } from "../../card-type-change";
import { transfigurationDisplayDescription } from "../../runtime/transfiguration-display";
import { toDeckCardView } from "./mobile-deck-view-model";
import { parseCardTypeChangePredicateId } from "../../types/identifiers";
describe("current journey record projection controls", () => {
 it("shares full metadata and canonical values across choices, mobile, debugger and enhanced reforged cards", () => {
  const held = entry(undefined, { sparkBonus: 2, keywordModification: { fast: true } }); const state = makeAuguryTestJourneyState({ deck: [held] });
  const choice = deckCardChoice(held, content)!; const mobile = toDeckCardView(data, held, content.cardDatabase)!; const debug = buildJourneyDebugEditorView(data, state, content.cardDatabase, []).deck[0].model!;
  const candidates = buildTransfigurationCandidates(data, state, { kind: "cardChoice", choiceKind: "transfiguration", entryIds: [], acceptedEntryIds: [], transfigurationOffers: [] }, content.cardDatabase, true);
  for (const model of [choice.model, mobile.model, debug, candidates[0].model]) {
   expect(model.displaySnapshot.spark).toBe(14); expect(model.transfiguration?.applications?.map(step => step.application)).toEqual(held.transfigurationApplications);
   expect(transfigurationDisplayDescription(model.transfiguration!).split("\n")).toHaveLength(2);
  }
  const overridden = entry(undefined, { statOverride: { spark: 91 } }); expect(deckCardChoice(overridden, content)?.model.displaySnapshot.spark).toBe(91);
 });
 it("normalizes new-history type/spark projections while keeping scalar-only mobile behavior", () => {
  const predicateId = parseCardTypeChangePredicateId("record-projection");
  const held = entry(undefined, { typeChange: { predicateId, cardType: "Event", subtype: "", label: "" } });
  expect(toDeckCardView(data, held, content.cardDatabase)?.model.displaySnapshot.spark).toBeNull();
  expect(resolveDeckEntryCard(data, character, held).spark).toBeNull();
  const { transfigurationApplications: _, ...legacy } = held;
  expect(toDeckCardView(data, legacy, content.cardDatabase)?.model.displaySnapshot.spark).toBe(6);
 });
 it("keeps exact absent-history diagnostic hash bytes and distinguishes full history/repeats", () => {
  const single = entry([{ form: "Kindled" }]); const twice = entry(); const { transfigurationApplications: _, ...legacy } = single;
  const context = (held: typeof single) => buildAuguryContext({ journeyState: makeAuguryTestJourneyState({ deck: [held] }), journeyContent: content, site: makeAuguryTestSite() });
  expect(buildAuguryDeckSnapshot(context(legacy)).hash).toBe(sha256(`${character.cardNumber}:Kindled:::`));
  expect(buildAuguryDeckSnapshot(context(single)).hash).not.toBe(buildAuguryDeckSnapshot(context(twice)).hash);
  expect(buildAuguryDeckSnapshot(context(legacy)).hash).not.toBe(buildAuguryDeckSnapshot(context(single)).hash);
 });
 it("projects exact retained gamble target and minted copy histories from current physical entries", () => {
  const original = entry(undefined, { sparkBonus: 2 }), copy = { ...original, entryId: parseDeckEntryId("record-minted") };
  const commitment = parseShuffleCommitment("record-round");
  const runtime: FourSuitRepriseSiteRuntime = { kind: "gamble", gameId: "four-suit-reprise", selectionTrace: testGambleSelectionTrace("four-suit-reprise"), isFarpoint: false, drawCost: 25, shuffleCommitments: [commitment], committedCards: [{ rank: "4", suit: "hearts" }], phase: "result", targets: [{ entryId: original.entryId, cardId: character.id, cardNumber: character.cardNumber, cardSnapshot: { ...character, spark: 90 }, transfigurationOffers: [] }], rounds: [{ roundNumber: 1, shuffleCommitment: commitment, card: { rank: "4", suit: "hearts" }, targetEntryId: original.entryId, targetCardId: character.id, costPaid: 25, outcome: "duplication", resultRevealed: true, resultSettled: true, essenceGained: 0, duplicatedEntryId: copy.entryId }] };
  const state = makeAuguryTestJourneyState({ deck: [original, copy], siteRuntime: { [GAMBLE_SITE.id]: runtime } });
  const view = buildGambleSiteView({ state, scene: null, site: GAMBLE_SITE, guide: GUIDE, guideLine: GUIDE_LINE_SOURCE, cardDatabase: content.cardDatabase });
  if (view?.gameId !== "four-suit-reprise") throw new Error("Expected actual result");
  for (const model of [view.result!.target.model, view.result!.copy!.model]) { expect(model.displaySnapshot.spark).toBe(14); expect(model.transfiguration?.applications?.map(step => step.application)).toEqual(original.transfigurationApplications); }
  const foreign = entry([{ form: "Inspired" }], { cardNumber: eventCard.cardNumber, entryId: original.entryId });
  const mismatched = buildGambleSiteView({ state: { ...state, deck: [foreign, copy] }, scene: null, site: GAMBLE_SITE, guide: GUIDE, guideLine: GUIDE_LINE_SOURCE, cardDatabase: content.cardDatabase });
  if (mismatched?.gameId !== "four-suit-reprise") throw new Error("Expected actual result"); expect(mismatched.result?.target.model.displaySnapshot).toEqual(runtime.targets[0].cardSnapshot);
  const missing = buildGambleSiteView({ state: { ...state, deck: [original] }, scene: null, site: GAMBLE_SITE, guide: GUIDE, guideLine: GUIDE_LINE_SOURCE, cardDatabase: content.cardDatabase });
  if (missing?.gameId !== "four-suit-reprise") throw new Error("Expected actual result"); expect(missing.result?.copy).toBeNull();
 });
 it("clears all prior applications in an exploration before-image and retains the complete actual after-image", () => {
  const held = entry(), actionId = testExplorationActionId("record-reward"), site = makeAuguryTestSite();
  const runtime: ExplorationSiteRuntime = { kind: "exploration", selectionRulesVersion: SELECTION_RULES_VERSION, encounterCardId: testCardId("record-encounter"), actionOffers: [], resolution: { actionId, gainedCardIds: [], gainedDreamsignIds: [], purgedCardIds: [], affectedEntryIds: [held.entryId], essenceGained: 0, chosenTransfiguration: "Kindled" } };
  const state = makeAuguryTestJourneyState({ deck: [held] });
  const reward = rewardForResolution(runtime, site.id, state, content, null, [{ id: actionId, label: "Fixture", effectText: "", effectKind: "transfigure-fixed-selected", transfiguration: "Kindled" }], []);
  if (reward === null || !("kind" in reward) || reward.kind !== "transfiguration") throw new Error("Expected transfiguration result");
  expect(reward.before.displaySnapshot.spark).toBe(character.spark); expect(reward.before.transfiguration).toBeUndefined();
  expect(reward.after.displaySnapshot.spark).toBe(12); expect(reward.after.transfiguration.applications?.map(step => step.application)).toEqual(held.transfigurationApplications);
 });
 it("includes only present histories in reward traces and encounter signatures", () => {
  const site = makeAuguryTestSite(), held = entry(), { transfigurationApplications: _, ...legacy } = held;
  const run = (e: typeof held) => {
   const journeyState = makeAuguryTestJourneyState({ deck: [e] });
   const context = buildRewardSelectionContext({ journeyState, journeyContent: content, site });
   const selected = selectReward(context, { mechanicId: "catalog-card-chooser", policyId: "uniform", count: 1, upTo: true, scope: { journeySeed: journeyState.seed, siteUuid: site.id, selectionKey: parseSelectionKey("record-selection") } });
   if (!selected.ok) throw new Error("Expected synthetic selection");
   const augury = buildAuguryContext({ journeyState, journeyContent: content, site });
   return { trace: selected.trace, signature: generateAuguryEncounterWithDebug(augury).debug.encounterSignature };
  };
  const old = run(legacy), current = run(held), single = run(entry([{ form: "Kindled" }]));
  expect(old.trace.effectiveDeck[0]).not.toHaveProperty("transfigurationApplications"); expect(current.trace.effectiveDeck[0].transfigurationApplications).toEqual(held.transfigurationApplications);
  expect(current.trace.effectiveDeckDigest).not.toBe(single.trace.effectiveDeckDigest); expect(current.signature).not.toBe(single.signature);
 });

});
