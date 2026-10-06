/**
 * Synthetic fixtures for zones and special mechanics: figments and capacity,
 * Veil, gain control, banish-until, Offering, Reclaim, Ephemeral, Phasing,
 * stack copies, figment copies, and copies in hand. Test fixtures only, never
 * catalog content. Cards use synthetic ids 0xc00+, figments 0xc80+.
 */
import type { EngineCardDefinition, EngineFigmentDefinition } from "../catalog";
import {
  abandonCost,
  activated,
  characterYouControl,
  count,
  energy,
  energyX,
  enemyCharacter,
  event,
  exhaustSelf,
  keyword,
  reclaim,
  self,
  stackItem,
  staticAbility,
  target,
  x,
} from "../dsl/builders";
import { onMaterialized, triggered, triggeringCard, whenAbandon, whenYouPlay } from "../dsl/triggers";
import type { AbilityList, CardCost } from "../dsl/types";
import * as p from "../effects/primitives";
import { parseFigmentId, type FigmentId } from "../state/ids";
import { CONTINUOUS_CARDS } from "./continuous-cards";
import { DSL_CARDS } from "./dsl-cards";
import { STACK_CARDS, SYNTHETIC_EMBLEMS } from "./stack-cards";
import { syntheticId, testCatalog } from "./synthetic-cards";
import { TRIGGER_CARDS } from "./trigger-cards";

function figment(index: number, subtype: EngineFigmentDefinition["subtype"], spark: number, abilities: AbilityList = () => []): EngineFigmentDefinition {
  return {
    id: parseFigmentId(`5e5e5e5e-0000-4000-8000-${(0xc80 + index).toString(16).padStart(12, "0")}`),
    subtype,
    spark,
    status: "authored",
    abilities,
  };
}

/** Synthetic figment types by role. */
export const ZONE_FIGMENT = {
  /** A 1✦ Warrior figment. */
  warrior: figment(1, "Warrior", 1),
  /** A 1✦ Ethereal figment. */
  ethereal: figment(2, "Ethereal", 1),
  /** A 1✦ Ember figment with Awakened. */
  ember: figment(3, "Ember", 1, () => [keyword("awakened")]),
  /** A 1✦ Warrior figment: "This character has +1✦ for each other warrior you control." */
  legion: figment(4, "Warrior", 1, () => [staticAbility(p.sparkModifier(self(), count(characterYouControl({ subtype: "Warrior", another: true }))))]),
} as const satisfies Record<string, EngineFigmentDefinition>;

export const ZONE_FIGMENTS: readonly EngineFigmentDefinition[] = Object.values(ZONE_FIGMENT);

const FIGMENT: Readonly<Record<keyof typeof ZONE_FIGMENT, FigmentId>> = {
  warrior: ZONE_FIGMENT.warrior.id,
  ethereal: ZONE_FIGMENT.ethereal.id,
  ember: ZONE_FIGMENT.ember.id,
  legion: ZONE_FIGMENT.legion.id,
};

function card(
  index: number,
  cardType: "character" | "event",
  cost: number | readonly CardCost[],
  abilities: AbilityList,
  options: Partial<Pick<EngineCardDefinition, "speed" | "spark" | "subtype">> = {},
): EngineCardDefinition {
  return {
    id: syntheticId(0xc00 + index),
    cardType,
    costs: typeof cost === "number" ? [energy(cost)] : cost,
    spark: cardType === "character" ? (options.spark ?? 1) : null,
    subtype: options.subtype ?? (cardType === "character" ? "Warrior" : ""),
    speed: options.speed ?? "standard",
    status: "authored",
    abilities,
  };
}

/** Zone fixtures by role. */
export const ZONE = {
  /** "Materialize two 1✦ Warrior figments." */
  twoWarriors: card(1, "event", 1, () => [event(p.materializeFigments(FIGMENT.warrior, 2))]),
  /** "Materialize X 1✦ Ethereal figments." */
  etherealFlood: card(2, "event", [energyX()], () => [event(p.materializeFigments(FIGMENT.ethereal, x()))]),
  /** "▸Materialized: Materialize a legion figment." */
  legionCaller: card(3, "character", 2, () => [triggered(onMaterialized(), p.materializeFigments(FIGMENT.legion))]),
  /** A 2✦ character with Veil. */
  veiled: card(4, "character", 2, () => [keyword("veil")], { spark: 2 }),
  /** "Gain control of an enemy." */
  seize: card(5, "event", 3, () => [event(p.gainControl(target(enemyCharacter())))]),
  /** "Banish an enemy until end of turn." */
  exile: card(6, "event", 1, () => [event(p.banishUntil(target(enemyCharacter()), "untilEndOfTurn"))]),
  /** "▸Materialized: Banish an enemy until this character leaves play." */
  warden: card(7, "character", 2, () => [triggered(onMaterialized(), p.banishUntil(target(enemyCharacter()), "whileSourceInPlay"))]),
  /** "Banish an enemy until the next Day phase." */
  dayExile: card(8, "event", 1, () => [event(p.banishUntil(target(enemyCharacter()), "untilNextDay"))]),
  /** "Offering. Draw 2 cards." */
  offeringDraw: card(9, "event", 3, () => [keyword("offering"), event(p.draw(2))]),
  /** A 3✦ character with Offering. */
  offeringBrute: card(10, "character", 4, () => [keyword("offering")], { spark: 3 }),
  /** "Draw a card. Reclaim 1●." */
  reclaimDraw: card(11, "event", 2, () => [event(p.draw(1)), reclaim(energy(1))]),
  /** A 1✦ character with plain Reclaim. */
  reclaimer: card(12, "character", 1, () => [keyword("reclaim")]),
  /** "Draw 2 cards with ephemeral." */
  ephemeralDraw: card(13, "event", 1, () => [event(p.draw(2, "you", { ephemeral: true }))]),
  /** A 2✦ character with Phasing. */
  phaser: card(14, "character", 2, () => [p.phasing()], { spark: 2 }),
  /** "When you play an event, copy it." */
  echo: card(15, "character", 2, () => [triggered(whenYouPlay({ cardType: "event" }), p.copyCard(triggeringCard()))], { subtype: "Mage" }),
  /** ❖❖ "Copy an event on the stack." */
  mirror: card(16, "event", 1, () => [event(p.copyCard({ kind: "stackTarget", selector: stackItem({ cardType: "event" }) }))], { speed: "interrupt" }),
  /** "2●, ☾: Materialize a figment copy of a character you control until end of turn." */
  twinner: card(17, "character", 1, () => [activated([energy(2), exhaustSelf()], p.materializeFigmentCopy(target(characterYouControl()), { untilEndOfTurn: true }))]),
  /** "When you abandon a character, materialize a 0✦ figment copy of it." */
  reflection: card(18, "character", 2, () => [triggered(whenAbandon(), p.materializeFigmentCopy(triggeringCard(), { zeroSpark: true }))], { subtype: "Mage" }),
  /** "Add an ephemeral copy of a character you control to your hand." */
  handEcho: card(19, "event", 1, () => [event(p.createCopyInHand(target(characterYouControl()), { ephemeral: true }))]),
  /** "Abandon a character: Draw a card." */
  sacrifice: card(20, "character", 1, () => [activated([abandonCost()], p.draw(1))], { subtype: "Mage" }),
  /** "Materialize a 1✦ Ember figment." */
  emberCall: card(21, "event", 1, () => [event(p.materializeFigments(FIGMENT.ember))]),
} as const satisfies Record<string, EngineCardDefinition>;

export const ZONE_CARDS: readonly EngineCardDefinition[] = Object.values(ZONE);

/** A catalog with the zone, DSL, stack, trigger, and continuous fixtures, the synthetic emblems, and the zone figments, plus `extra`. */
export function zoneCatalog(extra: readonly EngineCardDefinition[] = []) {
  return testCatalog([...ZONE_CARDS, ...DSL_CARDS, ...STACK_CARDS, ...TRIGGER_CARDS, ...CONTINUOUS_CARDS, ...extra], SYNTHETIC_EMBLEMS, ZONE_FIGMENTS);
}
