/**
 * Synthetic fixtures for continuous effects: anthems, Support, base-spark
 * setting, type changes, keyword grants and losses, cost modifications, and
 * values locked at resolution. Test fixtures only, never catalog content.
 * Cards use synthetic ids 0xa00+, emblems 0xb00+.
 */
import type { CardSubtype } from "../../types/card-identity";
import { parseAvatarId, parseDreamsignId } from "../../types/identifiers";
import type { EmblemDefinitions, EngineAvatarDefinition, EngineCardDefinition, EngineDreamsignDefinition } from "../catalog";
import {
  all,
  anyCharacter,
  characterYouControl,
  count,
  enemyCharacter,
  energy,
  event,
  lockedAtResolution,
  self,
  staticAbility,
  supported,
  supporting,
  target,
  times,
} from "../dsl/builders";
import type { AbilityList } from "../dsl/types";
import * as p from "../effects/primitives";
import { syntheticId } from "./synthetic-cards";

function card(
  index: number,
  cardType: "character" | "event",
  cost: number,
  abilities: AbilityList,
  options: { readonly spark?: number; readonly subtype?: CardSubtype } = {},
): EngineCardDefinition {
  return {
    id: syntheticId(0xa00 + index),
    cardType,
    costs: [energy(cost)],
    spark: cardType === "character" ? (options.spark ?? 1) : null,
    subtype: options.subtype ?? (cardType === "character" ? "Warrior" : ""),
    speed: "standard",
    status: "authored",
    abilities,
  };
}

const character = (index: number, cost: number, abilities: AbilityList, options: { readonly spark?: number; readonly subtype?: CardSubtype } = {}) =>
  card(index, "character", cost, abilities, options);
const spell = (index: number, cost: number, abilities: AbilityList) => card(index, "event", cost, abilities);

function emblemText(index: number): `5e5e5e5e-0000-4000-8000-${string}` {
  return `5e5e5e5e-0000-4000-8000-${(0xb00 + index).toString(16).padStart(12, "0")}`;
}

/** Continuous-effect fixtures by role. */
export const CONTINUOUS = {
  /** A Mage: "Warriors you control have +1✦." */
  warriorAnthem: character(1, 2, () => [staticAbility(p.sparkModifier(all(characterYouControl({ subtype: "Warrior" })), 1))], { subtype: "Mage" }),
  /** "This character has +1✦ for each other character you control." — a live value. */
  crowdStrength: character(2, 2, () => [staticAbility(p.sparkModifier(self(), count(characterYouControl({ another: true }))))], { spark: 0 }),
  /** A Mage: "Support – Supported characters have +2✦." */
  supporter: character(3, 2, () => [staticAbility(p.sparkModifier(supported(), 2))], { spark: 0, subtype: "Mage" }),
  /** "Support – Supported Spirit Animals have +1✦." */
  spiritSupporter: character(4, 2, () => [staticAbility(p.sparkModifier(supported({ subtype: "Spirit Animal" }), 1))], { spark: 0, subtype: "Spirit Animal" }),
  /** "Support – Supported characters have +1✦ for each warrior you control." */
  warbandSupporter: character(5, 3, () => [staticAbility(p.sparkModifier(supported(), count(characterYouControl({ subtype: "Warrior" }))))], { spark: 0 }),
  /** "This character has +2✦ for each character supporting it." (C9) */
  bolstered: character(6, 2, () => [staticAbility(p.sparkModifier(self(), times(supporting(), 2)))], { spark: 1 }),
  /** "Enemies have base ✦ 1." */
  enemyBaseOne: character(7, 3, () => [staticAbility(p.setBaseSpark(all(enemyCharacter()), 1))], { spark: 2, subtype: "Mage" }),
  /** A Mage: "Characters you control have all character types." */
  everyType: character(8, 2, () => [staticAbility(p.giveAllTypes(all(characterYouControl())))], { subtype: "Mage" }),
  /** "Other characters you control have Vengeful." */
  vengefulBanner: character(9, 2, () => [staticAbility(p.grant(all(characterYouControl({ another: true })), "vengeful"))]),
  /** "Events cost you 1● more." */
  eventTax: character(10, 1, () => [staticAbility(p.costModifier("you", { cardType: "event" }, 1))], { subtype: "Mage" }),
  /** "Characters the opponent plays cost 1● more." */
  opponentTax: character(11, 2, () => [staticAbility(p.costModifier("opponent", { cardType: "character" }, 1))]),
  /** "Characters you play cost 1● less." */
  characterDiscount: character(12, 2, () => [staticAbility(p.costModifier("you", { cardType: "character" }, -1))]),
  /** "Until end of turn, characters you control have +X✦, where X is the number of characters you control." */
  spiritBond: spell(13, 1, () => [event(p.forDuration("untilEndOfTurn", p.sparkModifier(all(characterYouControl()), lockedAtResolution(count(characterYouControl())))))]),
  /** "A character's base ✦ becomes 7 until end of turn." */
  baseSevenThisTurn: spell(14, 1, () => [event(p.setBaseSpark(target(anyCharacter()), 7, "untilEndOfTurn"))]),
  /** "An enemy's base ✦ becomes 1." */
  enemyBaseOnePermanently: spell(15, 2, () => [event(p.setBaseSpark(target(enemyCharacter()), 1))]),
  /** "A character you control gains Vengeful until end of turn." */
  vengefulThisTurn: spell(16, 0, () => [event(p.grant(target(characterYouControl()), "vengeful", "untilEndOfTurn"))]),
  /** "An enemy loses Vengeful until end of turn." */
  disarm: spell(17, 0, () => [event(p.loseKeyword(target(enemyCharacter()), "vengeful", "untilEndOfTurn"))]),
  /** "A character you control gains all character types until end of turn." */
  shapeshift: spell(18, 0, () => [event(p.giveAllTypes(target(characterYouControl()), "untilEndOfTurn"))]),
  /** "The next event you play this turn costs 2● less." */
  nextEventDiscount: spell(19, 0, () => [event(p.costModifier("you", { cardType: "event" }, -2, { next: true, duration: "untilEndOfTurn" }))]),
  /** "The next card the opponent plays costs 1● more." */
  nextCardTax: spell(20, 0, () => [event(p.costModifier("opponent", {}, 1, { next: true }))]),
} as const satisfies Record<string, EngineCardDefinition>;

export const CONTINUOUS_CARDS: readonly EngineCardDefinition[] = Object.values(CONTINUOUS);

export const CONTINUOUS_AVATAR = {
  /** "Characters you control have +1✦." */
  anthem: { id: parseAvatarId(emblemText(1)), status: "authored", abilities: () => [staticAbility(p.sparkModifier(all(characterYouControl()), 1))] },
} as const satisfies Record<string, EngineAvatarDefinition>;

export const CONTINUOUS_DREAMSIGN = {
  /** "Characters you play cost 1● less." */
  discount: { id: parseDreamsignId(emblemText(11)), status: "authored", abilities: () => [staticAbility(p.costModifier("you", { cardType: "character" }, -1))] },
} as const satisfies Record<string, EngineDreamsignDefinition>;

export const CONTINUOUS_EMBLEMS: EmblemDefinitions = {
  avatars: Object.values(CONTINUOUS_AVATAR),
  dreamsigns: Object.values(CONTINUOUS_DREAMSIGN),
};
