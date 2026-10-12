/** Public synthetic conditional statics shared by contracts, fuzzing, and the prompt lab. */
import type { EngineCardDefinition } from "../catalog";
import { activated, all, characterYouControl, conditionCardCounts, controls, energy, event, noCardsIn, self, staticAbility, target } from "../dsl/builders";
import type { AbilityList } from "../dsl/types";
import * as p from "../effects/primitives";
import { syntheticId } from "./synthetic-cards";

function card(index: number, abilities: AbilityList, subtype: EngineCardDefinition["subtype"] = "Warrior"): EngineCardDefinition {
  return { id: syntheticId(0x51300 + index), cardType: "character", costs: [energy(0)], spark: 1,
    subtype, speed: "standard", status: "authored", abilities };
}

const smallHand = conditionCardCounts("hand", 0, { atMost: 1 });

export const CONDITIONAL = {
  permit: card(1, () => [
    staticAbility(p.playFromZone("void", { cardType: "event" }, { oncePerTurn: true }), { while: smallHand }),
    activated([], p.draw(1)),
  ]),
  unconditional: card(2, () => [staticAbility(p.playFromZone("void", { cardType: "event" }))]),
  crowd: card(3, () => [
    staticAbility(p.sparkModifier(all(characterYouControl()), 2), { while: controls(characterYouControl(), 2) }),
    activated([], p.returnToHand(target(characterYouControl({ another: true })))),
  ]),
  selfBound: card(4, () => [staticAbility(p.sparkModifier(self(), 2), {
    while: controls(characterYouControl({ subtype: "Mage", sparkAtMost: 1 })),
  })], "Mage"),
  selfBoundTwo: { ...card(11, () => [staticAbility(p.sparkModifier(self(), 2), {
    while: controls(characterYouControl({ subtype: "Mage", sparkAtMost: 1 })),
  })], "Mage"), spark: 2 },
  layers: card(5, () => [
    staticAbility(p.giveAllTypes(self()), { while: smallHand }),
    staticAbility(p.grant(self(), "vengeful"), { while: controls(characterYouControl({ subtype: "Spirit Animal" })) }),
  ]),
  discount: card(6, () => [staticAbility(p.costModifier("you", { cardType: "event" }, -1), { while: smallHand })]),
  voidCount: card(7, () => [staticAbility(p.grant(self(), "vengeful"), {
    while: conditionCardCounts("void", 1, { filter: { cardType: "character", sparkAtLeast: 1 }, atMost: 1 }),
  })]),
  opponentCount: card(8, () => [staticAbility(p.sparkModifier(self(), 3), {
    while: conditionCardCounts("hand", 2, { player: "opponent" }),
  })]),
  emptyDeck: card(9, () => [staticAbility(p.grant(self(), "awakened"), { while: noCardsIn("deck") })]),
  freeEvent: { id: syntheticId(0x5130a), cardType: "event", costs: [energy(0)], spark: null, subtype: "",
    speed: "standard", status: "authored", abilities: () => [event(p.gainPoints(1))] },
} satisfies Record<string, EngineCardDefinition>;

export const CONDITIONAL_STATIC_CARDS: readonly EngineCardDefinition[] = Object.values(CONDITIONAL);
