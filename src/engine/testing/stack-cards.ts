/**
 * Synthetic fixtures for the stack: activated abilities, prevent effects,
 * "cannot be prevented", a payable effect, and synthetic avatars and
 * dreamsigns. Test fixtures only, never catalog content. UUID prefix
 * `5e5e5e5e-…-0000000003xx` for cards and `…-0000000004xx` for emblems.
 */
import type {
  EmblemDefinitions,
  EngineAvatarDefinition,
  EngineCardDefinition,
  EngineDreamsignDefinition,
} from "../catalog";
import {
  abandonCost,
  activated,
  characterYouControl,
  discardCost,
  energy,
  energyX,
  enemyCharacter,
  event,
  exhaustSelf,
  keyword,
  self,
  stackItem,
  target,
  x,
} from "../dsl/builders";
import type { AbilityList } from "../dsl/types";
import * as p from "../effects/primitives";
import { registerPayable } from "../rules/payable";
import { opponent } from "../state/ids";
import { parseAvatarId, parseDreamsignId } from "../../types/identifiers";
import { syntheticId } from "./synthetic-cards";

function card(
  index: number,
  cardType: "character" | "event",
  cost: number,
  abilities: AbilityList,
  speed: EngineCardDefinition["speed"] = "standard",
): EngineCardDefinition {
  return {
    id: syntheticId(300 + index),
    cardType,
    cost,
    spark: cardType === "character" ? 1 : null,
    subtype: cardType === "character" ? "Warrior" : "",
    speed,
    keywords: [],
    status: "authored",
    abilities,
  };
}

function emblemUuidText(index: number): `5e5e5e5e-0000-4000-8000-${string}` {
  return `5e5e5e5e-0000-4000-8000-${(400 + index).toString(16).padStart(12, "0")}`;
}

/** Stack fixtures by role. */
export const STACK = {
  /** ❖❖ "Prevent an event the opponent played." */
  preventEvent: card(1, "event", 1, () => [event(p.prevent(stackItem({ controller: "opponent", cardType: "event" })))], "interrupt"),
  /** ❖❖ "Prevent a played character. Put it on top of its owner's deck." */
  preventCharacterToDeck: card(2, "event", 1, () => [event(p.prevent(stackItem({ cardType: "character" }), { destination: "deckTop" }))], "interrupt"),
  /** ❖❖ "Prevent a card the opponent played. Return it to its owner's hand." */
  preventToHand: card(3, "event", 0, () => [event(p.prevent(stackItem({ controller: "opponent" }), { destination: "hand" }))], "interrupt"),
  /** ❖❖ "Prevent a card the opponent played unless they pay 2●." */
  preventUnlessPays: card(4, "event", 1, () => [event(p.prevent(stackItem({ controller: "opponent" }), { unlessPays: 2 }))], "interrupt"),
  /** "This event cannot be prevented. Draw a card." */
  unpreventableDraw: card(5, "event", 1, () => [keyword("cannotBePrevented"), event(p.draw(1))]),
  /** "1●, ☾: Draw a card." */
  drawForEnergyAndExhaust: card(6, "character", 1, () => [activated([energy(1), exhaustSelf()], p.draw(1))]),
  /** "1●: This character gains +1✦ until end of turn." (❖ ability) */
  fastPump: card(7, "character", 1, () => [activated([energy(1)], p.gainSpark(self(), 1, "untilEndOfTurn"), { speed: "fast" })]),
  /** "1●: Draw a card." (❖❖ ability) */
  interruptDraw: card(8, "character", 1, () => [activated([energy(1)], p.draw(1), { speed: "interrupt" })]),
  /** "1●, ☾: Prevent an event the opponent played." (❖❖ ability) */
  interruptPreventer: card(9, "character", 2, () => [
    activated([energy(1), exhaustSelf()], p.prevent(stackItem({ controller: "opponent", cardType: "event" })), { speed: "interrupt" }),
  ]),
  /** "X●: Gain X⍟." */
  pointsForX: card(10, "character", 1, () => [activated([energyX()], p.gainPoints(x()))]),
  /** "Once per turn: Gain 1●." */
  oncePerTurnEnergy: card(11, "character", 1, () => [activated([], p.gainEnergy(1), { oncePerTurn: true })]),
  /** "Abandon a character: Draw 2 cards." */
  abandonToDraw: card(12, "character", 1, () => [activated([abandonCost()], p.draw(2))]),
  /** "Discard a card: Dissolve an enemy." (❖ ability) */
  discardToDissolve: card(13, "character", 1, () => [activated([discardCost(1)], p.dissolve(target(enemyCharacter())), { speed: "fast" })]),
  /** "Abandon a character: Another character you control gains +2✦." */
  abandonToPump: card(14, "character", 1, () => [activated([abandonCost()], p.gainSpark(target(characterYouControl()), 2))]),
  /** "Until the opponent pays 2●, …": registers a payable effect (C7). */
  payableEffect: {
    ...card(15, "event", 0, () => []),
    synthetic: {
      resolve: (ctx, item) => {
        registerPayable(ctx, opponent(item.controller), 2, item.instance);
      },
    },
  },
} as const satisfies Record<string, EngineCardDefinition>;

export const STACK_CARDS: readonly EngineCardDefinition[] = Object.values(STACK);

/** Synthetic avatars by role. */
export const AVATAR = {
  /** "☾: Draw a card." */
  drawer: { id: parseAvatarId(emblemUuidText(1)), status: "authored", abilities: () => [activated([exhaustSelf()], p.draw(1))] },
  /** "1●, ☾: Prevent an event the opponent played." (❖❖ ability) */
  preventer: {
    id: parseAvatarId(emblemUuidText(2)),
    status: "authored",
    abilities: () => [
      activated([energy(1), exhaustSelf()], p.prevent(stackItem({ controller: "opponent", cardType: "event" })), { speed: "interrupt" }),
    ],
  },
  /** "☾: Each character you control gains +1✦ until end of turn." (❖ ability) */
  rally: {
    id: parseAvatarId(emblemUuidText(3)),
    status: "authored",
    abilities: () => [
      activated([exhaustSelf()], p.gainSpark({ kind: "all", selector: characterYouControl() }, 1, "untilEndOfTurn"), { speed: "fast" }),
    ],
  },
} as const satisfies Record<string, EngineAvatarDefinition>;

/** Synthetic dreamsigns by role. */
export const DREAMSIGN = {
  /** "2●: Gain 1⍟." */
  points: { id: parseDreamsignId(emblemUuidText(11)), status: "authored", abilities: () => [activated([energy(2)], p.gainPoints(1))] },
} as const satisfies Record<string, EngineDreamsignDefinition>;

export const SYNTHETIC_EMBLEMS: EmblemDefinitions = {
  avatars: Object.values(AVATAR),
  dreamsigns: Object.values(DREAMSIGN),
};
