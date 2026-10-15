/** Synthetic payment fixtures consumed by the development lab and primitive contracts. */
import type { EngineCardDefinition } from "../catalog";
import { activated, additionalCost, energy, energyX, keyword, self, staticAbility } from "../dsl/builders";
import { offeringDiscardPaymentOption, returnToHand } from "../effects/primitives";
import type { CardId } from "../state/ids";
import { SYNTHETIC, syntheticId } from "./synthetic-cards";

export const OFFERING_DISCARD = {
  holder: {
    ...SYNTHETIC.vanilla1, id: syntheticId(0x62100), costs: [energy(0)], status: "authored",
    abilities: () => [staticAbility(offeringDiscardPaymentOption()), activated([], returnToHand(self()))],
  },
  offered: {
    ...SYNTHETIC.vanilla2, id: syntheticId(0x62101), costs: [energyX(0)], status: "authored",
    abilities: () => [keyword("offering"), additionalCost(energy(1))],
  },
} as const satisfies Record<string, EngineCardDefinition>;

export const OFFERING_DISCARD_CARDS: readonly EngineCardDefinition[] = Object.values(OFFERING_DISCARD);
export const OFFERING_DISCARD_CARD_TEXT: Readonly<Record<CardId, { readonly name: string; readonly text: string }>> = {
  [OFFERING_DISCARD.holder.id]: { name: "Lab Offering Permission", text: "You may discard a card instead of banishing a card from hand to pay Offering. Return this character to hand." },
  [OFFERING_DISCARD.offered.id]: { name: "Lab Offering Payment", text: "Offering. To play this card, pay 1 energy." },
};
