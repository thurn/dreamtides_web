import type { EventContext } from "../../eventlog/types";
import { testCardId, testDreamsignId } from "../../types/test-identities";
import { parseDreamsignId, parseDeckEntryId, type DreamsignId } from "../../types/identifiers";
import type { FoldState } from "../fold-state";
import type { GameEventType } from "../events";
import { reduceGameEvent } from "../reducer";
import { registerDeckContentProvider } from "./deck";
import { journeyOnGain } from "./journey-on-gain";
import { createJourneyModifierRegistry } from "./modifier-registry";
import { registerJourneyTypeRemapProvider } from "./journey-type-remap";
import { initial as starterInitial, TEETH, clear as clearBase, sign, ctx, event, GENESIS } from "./journey-rewards272-fixtures";
import { DOLL, RED, SLUG, SLIME } from "./journey-on-gain-fixtures";
import { journeyPurge } from "./journey-purge";
import { journeyTransfiguration } from "./journey-transfiguration";
import { journeyDuplication } from "./journey-duplication";
import { registerSiteContentProvider } from "./sites";
import { testSiteContentProvider } from "./test-content-providers";
import { makeAuguryTestCard, makeAuguryTestContent } from "../../journey_v2/testing/fixtures";
import { applyJourneyRewardEffect } from "./reward-effects";
import { makeSite, SITE_ID, stateWithSites } from "./sites-fixtures";
import { LayerName } from "../../types/layer-name";
import { journeyDeckEntry } from "./journey-deck-entry";
import { initial as nightmareInitial, HERBS, RAVEN } from "./journey-nightmares274-fixtures";

export { sign, ctx, event, GENESIS, TEETH, DOLL, RED, SLUG, SLIME, SITE_ID };
export const MASK = parseDreamsignId("3d86f8ce-42ac-43dc-96d5-121e6d1a6167");
export const SPIDER = testDreamsignId("remap-earned-copy");
export const OTHER = testDreamsignId("remap-unrelated");
export const TYPES = ["Warrior", "Mage", "Shadow"] as const;
export const cards = [1, 2, 3].map(n => makeAuguryTestCard({ id: testCardId(`remap-card-${n}`), cardNumber: n, cardType: "Character", subtype: n === 2 ? "Mage" : "Warrior" }));
export const registry = createJourneyModifierRegistry([
  journeyOnGain(MASK, { kind: "typeRemapOnGain" }),
  journeyOnGain(DOLL, { kind: "copyOwnedDreamsignOnGain" }),
  journeyOnGain(TEETH, { kind: "purgeStarterOnGain", maxCount: 4 }),
  journeyOnGain(RED, { kind: "afterBattleDreamsignChoice", offerCount: 3 }),
  journeyPurge(SLUG, { kind: "afterBattlePurge", maxCount: 2 }),
  journeyTransfiguration(SLIME, { kind: "afterBattleTransfiguration", maxCount: 3 }),
  journeyDuplication(SPIDER, { kind: "afterBattleDuplication" }),
]);
export function clear() { registerJourneyTypeRemapProvider(null); clearBase(); }
export function install() {
  registerJourneyTypeRemapProvider(TYPES);
  registerDeckContentProvider({ resolveCardNumber: id => cards.find(card => card.id === id)?.cardNumber ?? null, resolveDreamsign: sign });
}
export function initial(held: readonly DreamsignId[] = []): FoldState {
  const base = starterInitial(held);
  install();
  return { ...base, journey: { ...base.journey, deck: base.journey.deck.slice(0, 2) } };
}
export function apply(state: FoldState, type: GameEventType, payload: Record<string, unknown> = {}, context: Partial<EventContext> = {}, actor = "alice") {
  return reduceGameEvent(state, event(type, payload, actor), ctx(context), registry);
}
export function accepted(state: FoldState, type: GameEventType, payload: Record<string, unknown> = {}, context: Partial<EventContext> = {}, actor = "alice"): FoldState {
  const result = apply(state, type, payload, context, actor);
  if (result.outcome !== "applied") throw new Error(`${type} unexpectedly bounced: ${result.bounceReason}`);
  return result.state;
}
export function choicePayload(state: FoldState, chosenSubtype: string = "Mage") {
  const screen = state.journey.screen;
  if (screen.type !== "journeyDreamsign" || screen.choice.kind !== "typeRemap") throw new Error("Missing C12 permission");
  const choice = screen.choice, source = choice.sources[choice.index];
  return { sourceDreamsignId: source.dreamsignId, heldIndex: source.heldIndex, choiceIndex: choice.index, permissionSeq: choice.permissionSeq, chosenSubtype };
}
/** The real append-only reward-effect producer, through public Augury acceptance. */
export function auguryGains(ids: readonly DreamsignId[], held: readonly DreamsignId[] = []) {
  const base = initial(held);
  const state = stateWithSites([makeSite("Augury")], { deck: base.journey.deck, dreamsigns: base.journey.dreamsigns });
  for (const node of Object.values(state.journey.atlas.nodes)) node.layer = LayerName.One;
  const templates = [...new Set([...ids, ...held])].map(id => ({ ...sign(id), imageName: "synthetic.png" }));
  const content = makeAuguryTestContent({ cards, dreamsignTemplates: templates });
  registerSiteContentProvider(testSiteContentProvider({ resolveAugury: ({ journey }) => {
    const next = applyJourneyRewardEffect({ state: journey, journeyContent: content,
      effect: { kind: "composite", children: ids.map(id => ({ kind: "add_dreamsign", dreamsignId: id, dreamsignTemplate: templates.find(template => template.id === id)! })) },
      mintEntryId: (_deck, index) => parseDeckEntryId(`remap-augury-${index}`) });
    return next === null ? null : { journey: next, purges: [] };
  } }));
  return accepted(state, "ACCEPT_AUGURY_OFFER", { siteId: SITE_ID });
}

/** Genuine reward ingress across acquired additions and the held prohibition wave. */
export function nightmareAcquisition(prevented: boolean) {
  const before = nightmareInitial(prevented ? [RAVEN] : [], 2);
  registerJourneyTypeRemapProvider(TYPES);
  const modifiers = createJourneyModifierRegistry([
    journeyOnGain(MASK, { kind: "typeRemapOnGain" }),
    journeyOnGain(HERBS, { kind: "addNightmaresOnGain", count: 3 }),
    journeyDeckEntry(RAVEN, { kind: "preventNightmare" }),
  ]);
  registerSiteContentProvider(testSiteContentProvider({ resolveAugury: ({ journey }) => ({ purges: [], journey: {
    ...journey, dreamsigns: [...journey.dreamsigns, sign(MASK), sign(HERBS)],
  } }) }));
  const result = reduceGameEvent(before, event("ACCEPT_AUGURY_OFFER", { siteId: SITE_ID }), ctx(), modifiers);
  return { before, result, modifiers, acquired: HERBS, prohibition: RAVEN };
}
