import { parseCardSubtype } from "../../types/card-identity";
import { testCardId, testDreamsignId } from "../../types/test-identities";
import type { DreamsignId } from "../../types/identifiers";
import type { EventContext } from "../../eventlog/types";
import type { GameEventType } from "../events";
import type { FoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import { ctx, event } from "./lifecycle-fixtures";
import { initial, sign, clear, RED } from "./journey-on-gain-fixtures";
import { journeyOnGain } from "./journey-on-gain";
import { journeyDeckEntry } from "./journey-deck-entry";
import { createJourneyModifierRegistry } from "./modifier-registry";
import { registerJourneyTypeRemapProvider } from "./journey-type-remap";
import { registerJourneyTransfigurationProvider } from "./journey-transfiguration";
export { clear, sign };
export const TOAD = testDreamsignId("cohort-subtype"), ACORN = testDreamsignId("cohort-bonus"), MASK = testDreamsignId("cohort-remap"), RAT = testDreamsignId("cohort-form"), DOLL = testDreamsignId("cohort-copy");
export const registry = createJourneyModifierRegistry([journeyOnGain(RED, { kind: "afterBattleDreamsignChoice", offerCount: 3 }), journeyOnGain(TOAD, { kind: "deckSubtypeOnGain" }), journeyOnGain(MASK, { kind: "typeRemapOnGain" }), journeyOnGain(RAT, { kind: "randomTransfigurationOnGain", numerator: 1, denominator: 2 }), journeyOnGain(DOLL, { kind: "copyOwnedDreamsignOnGain" }), journeyDeckEntry(ACORN, { kind: "warriorSpark", amount: 1 })]);
export function setup(held: readonly DreamsignId[] = []) {
  const state = initial(held);
  registerJourneyTypeRemapProvider([parseCardSubtype("Warrior"), parseCardSubtype("Mage")]);
  registerJourneyTransfigurationProvider({ resolve: entry => ({ cardId: testCardId(`subtype-card-${entry.cardNumber}`), cardType: entry.typeChange?.cardType ?? (entry.cardNumber === 3 ? "Event" : "Character"), subtype: entry.typeChange?.subtype ?? parseCardSubtype(entry.cardNumber === 1 ? "Warrior" : "Mage"), forms: entry.transfiguration === null ? ["Kindled", "Enduring"] : [] }) });
  return state;
}
export function apply(state: FoldState, type: GameEventType, payload: Record<string, unknown> = {}, context: Partial<EventContext> = {}) { return reduceGameEvent(state, event(type, payload), { ...ctx(), ...context }, registry); }
export function intent(state: FoldState, type = "Mage") {
  if (state.journey.screen.type !== "journeyDreamsign" || state.journey.screen.choice.kind !== "subtype") throw new Error("Missing subtype permission");
  const choice = state.journey.screen.choice, source = choice.resume.sources[choice.resume.sourceIndex];
  return { sourceDreamsignId: source.dreamsignId, heldIndex: source.heldIndex, choiceIndex: choice.resume.sourceIndex, permissionSeq: choice.permissionSeq, chosenSubtype: parseCardSubtype(type) };
}
