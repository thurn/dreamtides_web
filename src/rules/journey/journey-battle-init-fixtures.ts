import type { JourneyState, Dreamsign, DeckEntry } from "../../types/journey";
import { parseDeckEntryId } from "../../types/identifiers";
import { testCardId, testDreamsignId } from "../../types/test-identities";
import { makeAuguryTestCard, makeAuguryTestContent } from "../../journey_v2/testing/fixtures";
import { createJourneyTransfigurationProvider } from "../../session/providers/journey-transfiguration-provider";
import { transfigurationFixture } from "../../testing/transfiguration-fixture";
import { createJourneyModifierRegistry } from "./modifier-registry";
import { journeyBattleInit } from "./journey-battle-init";
import { journeyOnGain } from "./journey-on-gain";
import { initial as gainInitial } from "./journey-on-gain-fixtures";
import { registerJourneyTransfigurationProvider } from "./journey-transfiguration";
import { registerDeckContentProvider } from "./deck";

export const MUG = testDreamsignId("opening-mug"), OTHER_MUG = testDreamsignId("opening-second-mug");
export const DOLL = testDreamsignId("opening-doll"), STARTER = testDreamsignId("opening-starter");
export const OTHER = testDreamsignId("opening-other");
export const openingRegistry = createJourneyModifierRegistry([
  ...[MUG, OTHER_MUG].map((id) => journeyBattleInit(id, { kind: "chosenOpeningHandEntry" }, { kind: "chooseOpeningHandEventOnGain" })),
  journeyOnGain(DOLL, { kind: "copyOwnedDreamsignOnGain" }),
  journeyOnGain(STARTER, { kind: "purgeStarterOnGain", maxCount: 2 }),
]);
export const openingSign = (id = MUG): Dreamsign => ({ id, name: "Synthetic", effectDescription: "" });
export const openingEntry = (label: string, cardNumber = 1, extra: Partial<DeckEntry> = {}): DeckEntry => ({
  entryId: parseDeckEntryId(label), cardNumber, transfiguration: null, isBane: false, ...extra,
});
export const openingCards = [
  makeAuguryTestCard({ id: testCardId("opening-event"), cardNumber: 1, cardType: "Event", spark: null, isStarter: true }),
  makeAuguryTestCard({ id: testCardId("opening-character"), cardNumber: 2, cardType: "Character" }),
];
export function openingContent() {
  return { ...makeAuguryTestContent({ cards: openingCards, dreamsignTemplates: [MUG, OTHER_MUG, DOLL, STARTER, OTHER]
    .map((id) => ({ ...openingSign(id), imageName: "synthetic.png" })) }), transfigurationData: transfigurationFixture() };
}
export function openingInitial(overrides: Partial<JourneyState> = {}) {
  const initial = gainInitial();
  const content = openingContent();
  registerJourneyTransfigurationProvider(createJourneyTransfigurationProvider(content));
  registerDeckContentProvider({ resolveCardNumber: (id) => openingCards.find((card) => card.id === id)?.cardNumber ?? null,
    resolveDreamsign: (id) => openingSign(id) });
  return { ...initial, journey: { ...initial.journey,
    deck: [openingEntry("opening-first"), openingEntry("opening-second"), openingEntry("opening-character", 2)], ...overrides } };
}

// Registered identities exercise the real codec and production registry with synthetic cards.
import mug from "../../content/dreamsigns/spotted-mug-069c6e8f";
import doll from "../../content/dreamsigns/voodoo-doll-0df9d72c";
import teeth from "../../content/dreamsigns/paired-teeth-1328e611";
import mask from "../../content/dreamsigns/theater-mask-3d86f8ce";
import toad from "../../content/dreamsigns/toad-8e2d26a8";
import { parseDreamsignId, type DreamsignId, type DeckEntryId } from "../../types/identifiers";
import { registerJourneyTypeRemapProvider } from "./journey-type-remap";
import { createSiteContentProvider } from "../../session/providers/site-provider";
import { registerSiteContentProvider } from "./sites";
import { testSiteContentProvider } from "./test-content-providers";
import { applyJourneyRewardEffect } from "./reward-effects";
import { makeSite, SITE_ID, stateWithSites } from "./sites-fixtures";
import { LayerName } from "../../types/layer-name";
import { reduceGameEvent } from "../reducer";
import type { FoldState } from "../fold-state";
import type { GameEventType } from "../events";
import type { EventContext } from "../../eventlog/types";
import { ctx, event } from "./lifecycle-fixtures";
export { ctx, GENESIS } from "./lifecycle-fixtures";
export const REGISTERED_MUG = parseDreamsignId(mug.id), REGISTERED_DOLL = parseDreamsignId(doll.id);
export const REGISTERED_STARTER = parseDreamsignId(teeth.id), MASK = parseDreamsignId(mask.id), TOAD = parseDreamsignId(toad.id);

export function productionOpeningInitial(overrides: Partial<JourneyState> = {}): FoldState {
  const state = openingInitial(overrides);
  registerJourneyTypeRemapProvider(["Warrior", "Mage"]);
  registerSiteContentProvider(createSiteContentProvider(openingContent()));
  return state;
}
export function openingApply(state: FoldState, type: GameEventType, payload: Record<string, unknown> = {}, context: Partial<EventContext> = {}, actor = "alice") {
  return reduceGameEvent(state, event(type, payload, actor), { ...ctx(), ...context });
}
export function openingAccepted(state: FoldState, type: GameEventType, payload: Record<string, unknown> = {}, context: Partial<EventContext> = {}): FoldState {
  const result = openingApply(state, type, payload, context);
  if (result.outcome !== "applied") throw new Error(`Unexpected opening workflow ${type}: ${result.bounceReason}`);
  return result.state;
}
export function openingPayload(state: FoldState, entryId: DeckEntryId | null = state.journey.deck[0]?.entryId ?? null) {
  const screen = state.journey.screen;
  if (screen.type !== "journeyDreamsign" || screen.choice.kind !== "openingHand") throw new Error("Expected opening permission");
  const choice = screen.choice, source = choice.sources[choice.index];
  return { dreamsignId: source.dreamsignId, heldIndex: source.heldIndex, choiceIndex: choice.index, permissionSeq: choice.permissionSeq, entryId };
}
export function openingTypePayload(state: FoldState) {
  const screen = state.journey.screen;
  if (screen.type !== "journeyDreamsign" || (screen.choice.kind !== "subtype" && screen.choice.kind !== "typeRemap")) throw new Error("Expected acquired type choice");
  const choice = screen.choice, index = choice.kind === "subtype" ? choice.resume.sourceIndex : choice.index;
  const source = choice.kind === "subtype" ? choice.resume.sources[index] : choice.sources[index];
  return { sourceDreamsignId: source.dreamsignId, heldIndex: source.heldIndex, choiceIndex: index, permissionSeq: choice.permissionSeq, chosenSubtype: "Mage" };
}
/** Genuine compound ingress through the public Augury reward-effect producer. */
export function openingBundle(ids: readonly DreamsignId[], overrides: Partial<JourneyState> = {}, extraCards: readonly import("../../types/cards").CardData[] = []) {
  const base = productionOpeningInitial(overrides);
  // Keep the fixture's actual Augury site and synthetic starting state together.
  const parked = stateWithSites([makeSite("Augury")], { deck: base.journey.deck, dreamsigns: base.journey.dreamsigns });
  for (const node of Object.values(parked.journey.atlas.nodes)) node.layer = LayerName.One;
  const templates = [...new Set([...ids, ...base.journey.dreamsigns.map(sign => sign.id)])].map(id => ({ ...openingSign(id), imageName: "synthetic.png" }));
  const cards = [...openingCards, ...extraCards];
  const content = { ...makeAuguryTestContent({ cards, dreamsignTemplates: templates }), transfigurationData: transfigurationFixture() };
  registerJourneyTransfigurationProvider(createJourneyTransfigurationProvider(content));
  registerDeckContentProvider({ resolveCardNumber: id => cards.find(card => card.id === id)?.cardNumber ?? null,
    resolveDreamsign: id => openingSign(id) });
  registerSiteContentProvider(testSiteContentProvider({ resolveAugury: ({ journey }) => {
    const next = applyJourneyRewardEffect({ state: journey, journeyContent: content,
      effect: { kind: "composite", children: ids.map(id => ({ kind: "add_dreamsign", dreamsignId: id, dreamsignTemplate: templates.find(template => template.id === id)! })) },
      mintEntryId: (_deck, index) => parseDeckEntryId(`opening-augury-${index}`) });
    return next === null ? null : { journey: next, purges: [] };
  } }));
  return { before: parked, result: openingApply(parked, "ACCEPT_AUGURY_OFFER", { siteId: SITE_ID }) };
}
