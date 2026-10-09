/** Resource and victory primitives: gainEnergy, gainMaxEnergy, gainPoints, winTheGame. */
import { describe, expect, it } from "vitest";
import { createEngine } from "../../engine";
import type { EngineEvent } from "../../events";
import { event, noCardsIn } from "../../dsl/builders";
import { DSL, DSL_CARDS } from "../../testing/dsl-cards";
import { syntheticId } from "../../testing/synthetic-cards";
import { draw } from "./draw";
import { gainMaxEnergy } from "./gain-max-energy";
import { ifThen } from "./if-then";
import { sequence } from "./sequence";
import { winTheGame } from "./win-the-game";
import { playFromHand, runScenario } from "../../testing/scenario";
import { SYNTHETIC, testCatalog } from "../../testing/synthetic-cards";

const rampOne = {
  ...DSL.gainTwoEnergy,
  id: syntheticId(290),
  abilities: () => [event(gainMaxEnergy(1))],
};
/** "Draw a card. If you have no cards in your deck, you win the game." */
const drawThenWinIfDeckEmpty = {
  ...DSL.winIfDeckEmpty,
  id: syntheticId(293),
  abilities: () => [event(sequence(draw(1), ifThen(noCardsIn("deck"), winTheGame())))],
};
const engine = createEngine(testCatalog([...DSL_CARDS, rampOne, drawThenWinIfDeckEmpty]));
const deck = Array.from({ length: 5 }, () => SYNTHETIC.vanilla1.id);

describe("resource primitives", () => {
  it("gainEnergy adds current energy for the turn only", () => {
    const { state } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.gainTwoEnergy.id], energy: 3, deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(state.sides.player).toMatchObject({ currentEnergy: 5, maxEnergy: 3 });
  });

  it("gainMaxEnergy raises maximum and current energy", () => {
    const { state } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [rampOne.id], energy: 3, deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(state.sides.player).toMatchObject({ currentEnergy: 4, maxEnergy: 4 });
  });

  it("gainPoints awards points without a character scoring, and losses stop at 0", () => {
    const gain = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.gainThreePoints.id], energy: 1, deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(gain.state.sides.player.score).toBe(3);
    expect(gain.events).toContainEqual(expect.objectContaining({ kind: "pointsScored", cause: "effect", amount: 3 }));
    const loss = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.opponentLosesFive.id], energy: 1, deck }, enemy: { score: 2, deck } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(loss.state.sides.enemy.score).toBe(0);
  });

  it("gainPoints reports the actual change: a loss clamped at 0, and no event for no change", () => {
    const loss = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.opponentLosesFive.id], energy: 1, deck }, enemy: { score: 2, deck } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(loss.events.filter((event) => event.kind === "pointsScored")).toEqual([
      expect.objectContaining({ side: "enemy", amount: -2, cause: "effect" }),
    ]);
    const none = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.opponentLosesFive.id], energy: 1, deck }, enemy: { score: 0, deck } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(none.events.some((event) => event.kind === "pointsScored")).toBe(false);
  });
});

function endings(events: readonly EngineEvent[]): EngineEvent[] {
  return events.filter((event) => event.kind === "winConditionMet" || event.kind === "battleEnded");
}

describe("victory primitive", () => {
  it("winTheGame wins for its controller in the step's victory check only if it resolved", () => {
    const won = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.winIfDeckEmpty.id], energy: 1, deck: [] }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(won.state.result).toEqual({ kind: "victory", winner: "player", reason: "winCondition" });
    expect(endings(won.events)).toEqual([
      { kind: "winConditionMet", side: "player", sources: [won.ids.player.hand[0]] },
      { kind: "battleEnded", result: won.state.result },
    ]);
    const lost = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.winIfDeckEmpty.id], energy: 1, deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(lost.state.result).toBeNull();
    expect(endings(lost.events)).toEqual([]);
  });

  it("winTheGame and the opponent reaching the threshold in the same step draw", () => {
    // Drawing from the empty deck is Fatigue, which gives the opponent its last point.
    const { state, events } = runScenario(engine, {
      board: {
        active: "player",
        phase: "day",
        scoreToWin: 10,
        player: { hand: [drawThenWinIfDeckEmpty.id], energy: 1, deck: [] },
        enemy: { score: 9, deck },
      },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(state.sides.enemy.score).toBe(10);
    expect(state.result).toEqual({ kind: "draw", reason: "winCondition" });
    expect(endings(events).map((event) => event.kind)).toEqual(["winConditionMet", "battleEnded"]);
  });
});
