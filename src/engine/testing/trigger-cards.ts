/**
 * Synthetic fixtures for triggers and durations: named triggers, "when"
 * patterns, functional zones, intervening conditions, once-per-turn,
 * floating and delayed triggers, disabled triggers, and every duration kind.
 * Test fixtures only, never catalog content. Cards use synthetic ids 600+,
 * emblems 700+.
 */
import type { EmblemDefinitions, EngineAvatarDefinition, EngineCardDefinition, EngineDreamsignDefinition } from "../catalog";
import { characterYouControl, enemyCharacter, energy, event, self, stackItem, target } from "../dsl/builders";
import {
  atStartOfFirstTurn,
  atStartOfTurn,
  either,
  onChallenge,
  onDawn,
  onDissolved,
  onDusk,
  onMaterialized,
  onNight,
  sourceIn,
  triggered,
  triggeringCard,
  untilNextDay,
  untilOpponentPays,
  untilYourNextTurn,
  whenAbandon,
  whenDiscard,
  whenDraw,
  whenLeavesPlay,
  whenLeavesVoid,
  whenMaterialize,
  whenOpponentPlays,
  whenOpponentScores,
  whenScores,
  whenYouChallengeWith,
  whenYouPlay,
  whileSourceInPlay,
} from "../dsl/triggers";
import type { AbilityList } from "../dsl/types";
import * as p from "../effects/primitives";
import { parseAvatarId, parseDreamsignId } from "../../types/identifiers";
import { syntheticId } from "./synthetic-cards";

function card(index: number, cardType: "character" | "event", cost: number, abilities: AbilityList, spark = 1): EngineCardDefinition {
  return {
    id: syntheticId(600 + index),
    cardType,
    costs: [energy(cost)],
    spark: cardType === "character" ? spark : null,
    subtype: cardType === "character" ? "Warrior" : "",
    speed: "standard",
    status: "authored",
    abilities,
  };
}

const character = (index: number, cost: number, abilities: AbilityList, spark = 1) => card(index, "character", cost, abilities, spark);
const spell = (index: number, cost: number, abilities: AbilityList) => card(index, "event", cost, abilities);

function emblemText(index: number): `5e5e5e5e-0000-4000-8000-${string}` {
  return `5e5e5e5e-0000-4000-8000-${(700 + index).toString(16).padStart(12, "0")}`;
}

/** Trigger and duration fixtures by role. */
export const TRIGGER = {
  /** "▸Materialized: Draw a card." */
  materializedDraw: character(1, 1, () => [triggered(onMaterialized(), p.draw(1))]),
  /** "▸Dawn: Gain 1●." */
  dawnEnergy: character(2, 1, () => [triggered(onDawn(), p.gainEnergy(1))]),
  /** "▸Dusk: Gain 1⍟." */
  duskPoints: character(3, 2, () => [triggered(onDusk(), p.gainPoints(1))]),
  /** "▸Night: This character gains +1✦ until end of turn." */
  nightPump: character(4, 1, () => [triggered(onNight(), p.gainSpark(self(), 1, "untilEndOfTurn"))]),
  /** "▸Challenge: An enemy gains −1✦ until your next turn." */
  challengeShrink: character(5, 2, () => [triggered(onChallenge(), p.gainSpark(target(enemyCharacter()), -1, untilYourNextTurn()))], 2),
  /** "▸Dissolved: Dissolve an enemy." — a target prompt raised by a trigger. */
  dissolvedRevenge: character(6, 2, () => [triggered(onDissolved(), p.dissolve(target(enemyCharacter())))]),
  /** "▸Materialized: You may draw 2 cards." — a confirm prompt raised by a trigger. */
  materializedMayDraw: character(7, 2, () => [triggered(onMaterialized(), p.optional(p.draw(2)))]),
  /** "When you play an event, this character gains +1✦ until end of turn." */
  eventPump: character(8, 1, () => [triggered(whenYouPlay({ cardType: "event" }), p.gainSpark(self(), 1, "untilEndOfTurn"))]),
  /** "When you play your second card in a turn, gain 1⍟." */
  secondCardPoints: character(9, 1, () => [triggered(whenYouPlay({}, 2), p.gainPoints(1))]),
  /** "Once per turn, when you materialize a warrior, gain 1●." */
  warriorEnergyOnce: character(10, 1, () => [triggered(whenMaterialize(characterYouControl({ subtype: "Warrior" })), p.gainEnergy(1), { oncePerTurn: true })]),
  /** "▸Dawn: If this card is in your void, gain 1⍟." */
  voidDawnPoints: character(11, 1, () => [triggered(onDawn(), p.gainPoints(1), { zone: "void", condition: sourceIn("void") })]),
  /** "When a character you control leaves play, gain 1●." */
  leavesPlayEnergy: character(12, 2, () => [triggered(whenLeavesPlay(characterYouControl()), p.gainEnergy(1))]),
  /** "When this character scores ⍟, draw a card." */
  scoresDraw: character(13, 2, () => [triggered(whenScores(), p.draw(1))], 2),
  /** "When you challenge with 2 or more characters, gain 1●." */
  challengeWithTwo: character(14, 1, () => [triggered(whenYouChallengeWith(2), p.gainEnergy(1))]),
  /** "▸Materialized, ▸Dawn: Gain 1●." */
  materializedOrDawn: character(15, 2, () => [triggered(either(onMaterialized(), onDawn()), p.gainEnergy(1))]),
  /** "When you materialize another character, it gains +1✦ until end of turn." */
  materializePumpsIt: character(16, 2, () => [triggered(whenMaterialize(characterYouControl({ another: true })), p.gainSpark(triggeringCard(), 1, "untilEndOfTurn"))]),
  /** "▸Materialized: Another character you control gains +2✦ while this character is in play." */
  whilePresentPump: character(17, 2, () => [triggered(onMaterialized(), p.gainSpark(target(characterYouControl({ another: true })), 2, whileSourceInPlay()))]),
  /** "When you abandon a character, draw a card." */
  abandonDraw: character(18, 1, () => [triggered(whenAbandon(), p.draw(1))]),
  /** "When the opponent scores ⍟, gain 1●." */
  opponentScoresEnergy: character(19, 1, () => [triggered(whenOpponentScores(), p.gainEnergy(1))]),
  /** "Until end of turn, when you play a character, draw a card." */
  floatingDraw: spell(20, 1, () => [event(p.floating(whenYouPlay({ cardType: "character" }), p.draw(1)))]),
  /** "The next time you play an event this turn, gain 2⍟." */
  delayedPoints: spell(21, 0, () => [event(p.delayed(whenYouPlay({ cardType: "event" }), p.gainPoints(2), "untilEndOfTurn"))]),
  /** "A character you control gains +2✦ until your next turn." */
  pumpUntilNextTurn: spell(22, 1, () => [event(p.gainSpark(target(characterYouControl()), 2, untilYourNextTurn()))]),
  /** "A character you control gains +2✦ until the next Day phase." */
  pumpUntilNextDay: spell(23, 1, () => [event(p.gainSpark(target(characterYouControl()), 2, untilNextDay()))]),
  /** "An enemy gains −2✦ until the opponent pays 1●." */
  shrinkUntilPays: spell(24, 1, () => [event(p.gainSpark(target(enemyCharacter()), -2, untilOpponentPays(1)))]),
  /** "An enemy's triggered abilities don't trigger this turn." */
  silenceEnemy: spell(25, 0, () => [event(p.disableTriggers(target(enemyCharacter()), "untilEndOfTurn"))]),
  /** "Trigger the ▸Materialized abilities of a character you control." */
  retrigger: spell(26, 1, () => [event(p.triggerAbility(target(characterYouControl()), "materialized"))]),
  /** "▸Materialized: The next time a character you control leaves play, gain 2●." — a delayed trigger made by a trigger. */
  delayedByTrigger: character(27, 1, () => [triggered(onMaterialized(), p.delayed(whenLeavesPlay(characterYouControl()), p.gainEnergy(2)))]),
  /** "When you draw your second card in a turn, gain 1●." */
  secondDrawEnergy: character(28, 2, () => [triggered(whenDraw("you", 2), p.gainEnergy(1))]),
  /** "Until your next turn, at the start of your turn, gain 1⍟." — a floating trigger at its own boundary. */
  turnStartUntilNextTurn: spell(29, 0, () => [event(p.floating(atStartOfTurn(), p.gainPoints(1), untilYourNextTurn()))]),
  /** "When the opponent plays a card, if this card is in your hand, the next time you play a card, gain 1●." — a hidden source's delayed trigger. */
  handDelayed: character(30, 1, () => [triggered(whenOpponentPlays(), p.delayed(whenYouPlay(), p.gainEnergy(1)), { zone: "hand" })]),
  /** "When the opponent plays a card, prevent a card the opponent controls." — a trigger that empties the stack. */
  preventOnPlay: character(31, 2, () => [triggered(whenOpponentPlays(), p.prevent(stackItem({ controller: "opponent" })))]),
  /** "▸Dissolved: Dissolve two enemies." — a required two-target trigger. */
  dissolvedTwo: character(32, 2, () => [triggered(onDissolved(), p.dissolve(target(enemyCharacter(), 2)))]),
} as const satisfies Record<string, EngineCardDefinition>;

export const TRIGGER_CARDS: readonly EngineCardDefinition[] = Object.values(TRIGGER);

/** Synthetic emblems with triggered abilities. */
export const TRIGGER_AVATAR = {
  /** "When you discard a card, gain 1●." */
  discardEnergy: { id: parseAvatarId(emblemText(1)), status: "authored", abilities: () => [triggered(whenDiscard(), p.gainEnergy(1))] },
  /** "When you play an event, draw a card." */
  eventDraw: { id: parseAvatarId(emblemText(2)), status: "authored", abilities: () => [triggered(whenYouPlay({ cardType: "event" }), p.draw(1))] },
} as const satisfies Record<string, EngineAvatarDefinition>;

export const TRIGGER_DREAMSIGN = {
  /** "At the start of your first turn, draw a card." */
  firstTurnDraw: { id: parseDreamsignId(emblemText(11)), status: "authored", abilities: () => [triggered(atStartOfFirstTurn(), p.draw(1))] },
  /** "At the start of your turn, gain 1●." */
  turnEnergy: { id: parseDreamsignId(emblemText(12)), status: "authored", abilities: () => [triggered(atStartOfTurn(), p.gainEnergy(1))] },
  /** "When a card leaves your void, gain 1●." */
  voidLeaves: { id: parseDreamsignId(emblemText(13)), status: "authored", abilities: () => [triggered(whenLeavesVoid(), p.gainEnergy(1))] },
  /** "When you play an event, draw a card." */
  eventDraw: { id: parseDreamsignId(emblemText(14)), status: "authored", abilities: () => [triggered(whenYouPlay({ cardType: "event" }), p.draw(1))] },
} as const satisfies Record<string, EngineDreamsignDefinition>;

export const TRIGGER_EMBLEMS: EmblemDefinitions = {
  avatars: Object.values(TRIGGER_AVATAR),
  dreamsigns: Object.values(TRIGGER_DREAMSIGN),
};
