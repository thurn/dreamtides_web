import { LayerName } from "../../types/layer-name";
import type { EventContext } from "../../eventlog/types";
import type { DreamsignId } from "../../types/identifiers";
import { parseDeckEntryId } from "../../types/identifiers";
import { testCardId, testDreamsignId } from "../../types/test-identities";
import type { CardChoiceSiteRuntime, JourneyState } from "../../types/journey";
import { makeAuguryTestCard } from "../../journey_v2/testing/fixtures";
import { createJourneyModifierRegistry } from "./modifier-registry";
import { journeyTransfiguration, registerJourneyTransfigurationProvider } from "./journey-transfiguration";
import { journeySites } from "./journey-sites";
import { journeyPurge } from "./journey-purge";
import { makeEntry, makeSite, SITE_ID, stateWithSites } from "./sites-fixtures";
import { registerSiteContentProvider } from "./sites";
import { registerDeckContentProvider } from "./deck";
import { testSiteContentProvider } from "./test-content-providers";
import { ctx, event } from "./lifecycle-fixtures";
import { reduceGameEvent } from "../reducer";
import type { FoldState } from "../fold-state";
import type { GameEventType } from "../events";

export const TOME = testDreamsignId("transfiguration-tome"), LEAF = testDreamsignId("transfiguration-leaf"),
  SLIME = testDreamsignId("transfiguration-slime"), SLUG = testDreamsignId("transfiguration-slug");
export const sign = (id: DreamsignId) => ({ id, name: "same display name", effectDescription: "" });
export const registry = createJourneyModifierRegistry([
  journeyTransfiguration(TOME, { kind: "copyTransfiguredEvent" }),
  journeyTransfiguration(SLIME, { kind: "afterBattleTransfiguration", maxCount: 3 }),
  journeySites(LEAF, { kind: "transfigurationCount", count: 2 }),
  journeyPurge(SLUG, { kind: "afterBattlePurge", maxCount: 2 }),
]);
export const entries = () => [1, 2, 3, 4].map((index) => makeEntry({ entryId: parseDeckEntryId(`entry-${String(index)}`), cardNumber: index === 4 ? 2 : 1 }));
export const card = makeAuguryTestCard({ id: testCardId("transfiguration-event"), cardNumber: 1, cardType: "Event" });
export const runtime = (): CardChoiceSiteRuntime => ({ kind: "cardChoice", choiceKind: "transfiguration", entryIds: entries().map((entry) => entry.entryId), acceptedEntryIds: [],
  transfigurationOffers: entries().map((entry) => ({ entryId: entry.entryId, type: entry.cardNumber === 1 ? "Inspired" : "Kindled", effectDetails: {}, previewCard: card, essenceCost: 7 })) });
export function installProviders() {
  registerJourneyTransfigurationProvider({ resolve: (entry) => ({ cardId: entry.cardNumber === 1 ? card.id : testCardId("transfiguration-character"),
    cardType: entry.typeChange?.cardType ?? (entry.cardNumber === 1 ? "Event" : "Character"), forms: entry.cardNumber === 1 ? ["Inspired", "Enduring"] : ["Kindled"] }) });
  registerSiteContentProvider(testSiteContentProvider({ openSite: () => ({ runtime: runtime() }) }));
  registerDeckContentProvider({ resolveCardNumber: () => 1, resolveDreamsign: sign });
}
export function siteState(ids: readonly DreamsignId[] = [], enhanced = false): FoldState {
  const state = stateWithSites([makeSite("Transfiguration", enhanced)], { essence: 30, deck: entries(), dreamsigns: ids.map(sign) });
  state.journey.atlas.nodes[state.journey.currentDreamscape!].layer = LayerName.One;
  return state;
}
export function apply(state: FoldState, type: GameEventType, payload: Record<string, unknown> = {}, context: EventContext = ctx()) {
  return reduceGameEvent(state, event(type, payload), context, registry);
}
export function accepted(state: FoldState, type: GameEventType, payload: Record<string, unknown> = {}, context?: EventContext): FoldState {
  const result = apply(state, type, payload, context);
  if (result.outcome !== "applied") throw new Error(`Synthetic ${type} bounced`);
  return result.state;
}
export function choicePayload(journey: JourneyState, ids: readonly string[] = []) {
  const screen = journey.screen;
  if (screen.type !== "journeyTransfiguration" && screen.type !== "journeyPurge" || screen.choice.kind !== "afterBattle") throw new Error("No synthetic battle window");
  const choice = screen.choice, source = choice.sources[choice.index];
  return { siteId: choice.siteId, dreamsignId: source.dreamsignId, heldIndex: source.heldIndex, choiceIndex: choice.index, entryIds: ids };
}
export { SITE_ID };
