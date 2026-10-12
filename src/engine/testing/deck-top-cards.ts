/** Synthetic deck-top rules shared by contracts, native QA, and fuzzing. */
import type { EngineCardDefinition } from "../catalog";
import { activated, additionalCost, characterYouControl, controls, discardCost, energy, event, staticAbility, target } from "../dsl/builders";
import type { AbilityList } from "../dsl/types";
import * as p from "../effects/primitives";
import { syntheticId } from "./synthetic-cards";

const card = (index: number, abilities: AbilityList): EngineCardDefinition => ({
  id: syntheticId(0x51500 + index), cardType: "character", subtype: "Visitor", spark: 1,
  costs: [energy(0)], speed: "standard", status: "authored", abilities,
});
export const DECK_TOP = {
  keeper: card(1, (variant) => [
    staticAbility(p.revealDeckTop(), { while: controls(characterYouControl(), variant.amplified ? 2 : 3) }),
    staticAbility(p.playFromZone("deck", { cardType: "character" })),
    activated([], p.returnToHand(target(characterYouControl({ another: true })))),
    activated([], p.foresee(1)),
  ]),
  revealer: card(2, () => [staticAbility(p.revealDeckTop())]),
  permit: card(3, () => [staticAbility(p.playFromZone("deck", { cardType: "character" })), activated([], p.foresee(2))]),
  payable: { ...card(4, () => [additionalCost(discardCost(1))]), costs: [energy(1)] },
  draw: { id: syntheticId(0x51505), cardType: "event", subtype: "", spark: null, costs: [energy(0)],
    speed: "standard", status: "authored", abilities: () => [event(p.draw(2))] },
  erode: { id: syntheticId(0x51506), cardType: "event", subtype: "", spark: null, costs: [energy(0)],
    speed: "standard", status: "authored", abilities: () => [event(p.erode(2))] },
} satisfies Record<string, EngineCardDefinition>;
export const DECK_TOP_CARDS: readonly EngineCardDefinition[] = Object.values(DECK_TOP);
