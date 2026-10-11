import type { EngineCardDefinition } from "../../../catalog";
import { conditionCardCounts, discardCost, enemyCharacter, energyX, event, noCardsIn, reclaim, target } from "../../../dsl/builders";
import { createEngine } from "../../../engine";
import { DSL, DSL_CARDS } from "../../../testing/dsl-cards";
import { SYNTHETIC, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { banish } from "../banish";
import { chooseOne } from "../choose-one";
import { dissolve } from "../dissolve";
import { discard } from "../discard";
import { draw } from "../draw";
import { gainPoints } from "../gain-points";
import { ifThen } from "../if-then";
import { sequence } from "../sequence";

/** "X●, X from 0: Gain X⍟." */
export const pointsFromZeroX: EngineCardDefinition = { ...DSL.pointsTimesX, id: syntheticId(291), costs: [energyX(0)] };

/** "Choose one: Dissolve an enemy; or banish an enemy." Both modes need a target. */
export const dissolveOrBanish: EngineCardDefinition = {
  ...DSL.chooseDissolveOrPoints,
  id: syntheticId(292),
  abilities: () => [event(chooseOne(dissolve(target(enemyCharacter())), banish(target(enemyCharacter()))))],
};

export const handCountDiscard: EngineCardDefinition = {
  ...DSL.discardTwo,
  id: syntheticId(293),
  abilities: () => [
    event(ifThen(conditionCardCounts("hand", 5, { player: "opponent" }), discard(2, "opponent"), discard(1, "opponent"))),
    reclaim(discardCost()),
  ],
};

export const countResponse: EngineCardDefinition = {
  ...DSL.chooseDrawOrPoints,
  id: syntheticId(294),
  speed: "interrupt",
  abilities: (variant) => [event(draw(variant.amplified ? 2 : 0))],
};

export const filteredVoidCount: EngineCardDefinition = {
  ...DSL.chooseDrawOrPoints,
  id: syntheticId(295),
  abilities: () => [event(sequence(
    discard(1),
    ifThen(conditionCardCounts("void", 3, { filter: { cardType: "event" }, atMost: 3 }), gainPoints(1)),
    ifThen(conditionCardCounts("void", 1, { filter: { cardType: "character", subtype: "Warrior" }, atMost: 1 }), gainPoints(2)),
    ifThen(noCardsIn("deck", "opponent"), gainPoints(4)),
  ))],
};

export const engine = createEngine(testCatalog([...DSL_CARDS, pointsFromZeroX, dissolveOrBanish, handCountDiscard, countResponse, filteredVoidCount]));

export const v = SYNTHETIC;

export const deck = Array.from({ length: 5 }, () => v.vanilla1.id);
