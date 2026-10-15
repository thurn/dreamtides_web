import { NIGHTMARE_CARD_ID } from "../../data/nightmare";
import { clearGameProviders } from "../../session/providers/register-game-providers";
import { EVENT_CARD_SUBTYPE, parseCardSubtype } from "../../types/card-identity";
import { parseDeckEntryId, type DreamsignId } from "../../types/identifiers";
import { testCardId, testDreamsignId } from "../../types/test-identities";
import type { DeckEntry } from "../../types/journey";
import type { FoldState } from "../fold-state";
import type { GameEventType } from "../events";
import { reduceGameEvent } from "../reducer";
import { registerDeckContentProvider } from "./deck";
import { ctx, event } from "./lifecycle-fixtures";
import { journeyDeckEntry } from "./journey-deck-entry";
import { journeyOnGain } from "./journey-on-gain";
import { createJourneyModifierRegistry } from "./modifier-registry";
import { journeyTransfiguration, registerJourneyTransfigurationProvider } from "./journey-transfiguration";
import { makeEntry, makeSite, SITE_ID, stateWithSites } from "./sites-fixtures";
import { registerSiteContentProvider } from "./sites";
import { testSiteContentProvider } from "./test-content-providers";

export const HERBS = testDreamsignId("acquired-nightmares"), RAVEN = testDreamsignId("nightmare-prohibition");
export const RAT = testDreamsignId("nightmare-rat"), DOLL = testDreamsignId("nightmare-doll");
export const CRYSTAL = testDreamsignId("nightmare-crystal"), TOME = testDreamsignId("nightmare-tome"), ACORN = testDreamsignId("nightmare-warrior");
export const ORDINARY = testCardId("nightmare-ordinary"), WARRIOR = testCardId("nightmare-warrior-card");
export const sign = (id: DreamsignId) => ({ id, name: "Shared synthetic name", effectDescription: "" });
export const entry = (n: number, cardNumber = 1, extra: Partial<DeckEntry> = {}) => makeEntry({ entryId: parseDeckEntryId(`nightmare-old-${n}`), cardNumber, ...extra });
export function registry() {
  return createJourneyModifierRegistry([
    journeyOnGain(HERBS, { kind: "addNightmaresOnGain", count: 3 }),
    journeyOnGain(RAT, { kind: "randomTransfigurationOnGain", numerator: 1, denominator: 2 }),
    journeyOnGain(DOLL, { kind: "copyOwnedDreamsignOnGain" }),
    journeyDeckEntry(RAVEN, { kind: "preventNightmare" }),
    journeyDeckEntry(CRYSTAL, { kind: "randomTransfiguration", minimumDeckSize: 8 }),
    journeyDeckEntry(ACORN, { kind: "warriorSpark", amount: 2 }),
    journeyTransfiguration(TOME, { kind: "copyTransfiguredEvent" }),
  ]);
}
export function install() {
  registerDeckContentProvider({ resolveCardNumber: (id) => id === NIGHTMARE_CARD_ID ? 99 : id === WARRIOR ? 2 : id === ORDINARY ? 1 : null, resolveDreamsign: sign });
  registerJourneyTransfigurationProvider({ resolve: (e) => ({ cardId: e.cardNumber === 99 ? NIGHTMARE_CARD_ID : e.cardNumber === 2 ? WARRIOR : ORDINARY,
    cardType: e.cardNumber === 2 ? "Character" : "Event", subtype: e.cardNumber === 2 ? parseCardSubtype("Warrior") : EVENT_CARD_SUBTYPE,
    forms: e.transfiguration !== null ? [] : e.cardNumber === 2 ? ["Kindled"] : ["Inspired", "Enduring"] }) });
}
export function initial(held: readonly DreamsignId[] = [], count = 5): FoldState {
  install();
  return stateWithSites([makeSite("Augury")], { deck: Array.from({ length: count }, (_, n) => entry(n)),
    dreamsigns: held.map(sign), essence: 20, screen: { type: "site", siteId: SITE_ID } });
}
export function apply(state: FoldState, type: GameEventType, payload: Record<string, unknown> = {}, context: Parameters<typeof ctx>[0] = {}) {
  return reduceGameEvent(state, event(type, payload), ctx(context), registry());
}
export function compound(state: FoldState, acquired: readonly DreamsignId[], added: readonly DeckEntry[] = []) {
  registerSiteContentProvider(testSiteContentProvider({ resolveAugury: ({ journey }) => ({ purges: [], journey: { ...journey,
    essence: 13, deck: [...journey.deck, ...added], dreamsigns: [...journey.dreamsigns, ...acquired.map(sign)] } }) }));
  return apply(state, "ACCEPT_AUGURY_OFFER", { siteId: SITE_ID });
}
export { clearGameProviders as clear };
