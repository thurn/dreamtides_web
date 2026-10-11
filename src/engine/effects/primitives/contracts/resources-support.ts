import { createEngine } from "../../../engine";
import { event, noCardsIn } from "../../../dsl/builders";
import { DSL, DSL_CARDS } from "../../../testing/dsl-cards";
import { syntheticId } from "../../../testing/synthetic-cards";
import { draw } from "../draw";
import { gainMaxEnergy } from "../gain-max-energy";
import { ifThen } from "../if-then";
import { sequence } from "../sequence";
import { winTheGame } from "../win-the-game";
import { SYNTHETIC, testCatalog } from "../../../testing/synthetic-cards";

export const rampOne = {
  ...DSL.gainTwoEnergy,
  id: syntheticId(290),
  abilities: () => [event(gainMaxEnergy(1))],
};

/** "Draw a card. If you have no cards in your deck, you win the game." */
export const drawThenWinIfDeckEmpty = {
  ...DSL.winIfDeckEmpty,
  id: syntheticId(293),
  abilities: () => [event(sequence(draw(1), ifThen(noCardsIn("deck"), winTheGame())))],
};

export const engine = createEngine(testCatalog([...DSL_CARDS, rampOne, drawThenWinIfDeckEmpty]));

export const deck = Array.from({ length: 5 }, () => SYNTHETIC.vanilla1.id);
