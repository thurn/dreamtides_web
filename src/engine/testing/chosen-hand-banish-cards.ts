/** Synthetic public fixtures for chosen-hand banishment; catalog content stays separate. */
import type { EngineCardDefinition } from "../catalog";
import { anyCharacter, energy, event, self, target } from "../dsl/builders";
import { onMaterialized, triggered } from "../dsl/triggers";
import { banishChosen, gainPoints, returnToHand, sequence } from "../effects/primitives";
import { syntheticId } from "./synthetic-cards";

function source(index: number, cost: number, characters: boolean): EngineCardDefinition {
  return { id: syntheticId(0x47300 + index), cardType: "character", costs: [energy(cost)], spark: 1,
    subtype: "Warrior", speed: "standard", status: "authored",
    abilities: () => [triggered(onMaterialized(), banishChosen(characters ? { cardType: "character" } : {}, "whileSourceInPlay"))] };
}

const bounce = (index: number, speed: "standard" | "interrupt"): EngineCardDefinition => ({
  id: syntheticId(0x47300 + index), cardType: "event", costs: [energy(0)], spark: null,
  subtype: "", speed, status: "authored", abilities: () => [event(returnToHand(target(anyCharacter())))],
});

export const HAND_BANISH = {
  freeCard: source(0, 0, false),
  paidCard: source(1, 1, false),
  freeCharacter: source(2, 0, true),
  paidCharacter: source(3, 1, true),
  bounce: bounce(4, "standard"),
  /** Returning this candidate to a hand must not fire its materialized trigger. */
  candidate: { ...source(6, 0, false), abilities: () => [triggered(onMaterialized(), gainPoints(3))] },
  /** The duration begins after this source has left play, so there is no choice. */
  absent: { ...source(7, 0, false), abilities: () => [triggered(onMaterialized(),
    sequence(returnToHand(self()), banishChosen({}, "whileSourceInPlay")))] },
  /** Its recorded hand return remains public when its source is hidden. */
  timedCard: { ...source(8, 0, false), abilities: () => [triggered(onMaterialized(), banishChosen({}, "untilEndOfTurn"))] },
} as const satisfies Record<string, EngineCardDefinition>;

export const CHOSEN_HAND_BANISH_CARDS: readonly EngineCardDefinition[] = Object.values(HAND_BANISH);
