/** Resource primitives: gainEnergy, gainMaxEnergy, gainPoints. */
import { describe, expect, it } from "vitest";
import { createEngine } from "../../engine";
import { event } from "../../dsl/builders";
import { DSL, DSL_CARDS } from "../../testing/dsl-cards";
import { syntheticId } from "../../testing/synthetic-cards";
import { gainMaxEnergy } from "./gain-max-energy";
import { playFromHand, runScenario } from "../../testing/scenario";
import { SYNTHETIC, testCatalog } from "../../testing/synthetic-cards";

const rampOne = {
  ...DSL.gainTwoEnergy,
  id: syntheticId(290),
  abilities: () => [event(gainMaxEnergy(1))],
};
const engine = createEngine(testCatalog([...DSL_CARDS, rampOne]));
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
});
