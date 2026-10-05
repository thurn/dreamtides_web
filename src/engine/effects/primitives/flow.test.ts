/** Flow primitives: sequence, chooseOne, optional, ifThen, repeat; X. */
import { describe, expect, it } from "vitest";
import { createEngine } from "../../engine";
import { DSL, DSL_CARDS } from "../../testing/dsl-cards";
import { playFromHand, runScenario } from "../../testing/scenario";
import { SYNTHETIC, testCatalog } from "../../testing/synthetic-cards";

const engine = createEngine(testCatalog(DSL_CARDS));
const v = SYNTHETIC;
const deck = Array.from({ length: 5 }, () => v.vanilla1.id);

describe("flow primitives", () => {
  it("sequence runs its effects in order", () => {
    const { events } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.drawThenEnergy.id], energy: 1, deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    const kinds = events.map((event) => event.kind);
    expect(kinds.indexOf("cardDrawn")).toBeLessThan(kinds.lastIndexOf("energyChanged"));
  });

  it("chooseOne resolves only the chosen mode", () => {
    const { state } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.chooseDrawOrPoints.id], deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
      answers: () => [1],
    });
    expect(state.sides.player).toMatchObject({ score: 1, hand: [] });
  });

  it("optional asks and does nothing when declined", () => {
    const declined = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.mayDrawTwo.id], deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
      answers: () => [false],
    });
    expect(declined.state.sides.player.hand).toEqual([]);
    const accepted = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.mayDrawTwo.id], deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
      answers: () => [true],
    });
    expect(accepted.state.sides.player.hand).toHaveLength(2);
  });

  it("ifThen checks its condition when it resolves", () => {
    const met = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.drawIfTwoWarriors.id], back: [v.vanilla1.id, v.vanilla2.id], deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(met.state.sides.player.hand).toHaveLength(1);
    const unmet = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.drawIfTwoWarriors.id], back: [v.vanilla1.id], deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(unmet.state.sides.player).toMatchObject({ hand: [], currentEnergy: 1 });
  });

  it("repeat and X: X is chosen at play time, paid, and read on resolution", () => {
    const { state, answers } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.pointsTimesX.id], energy: 4, deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
      answers: () => [3],
    });
    expect(answers[0]).toMatchObject({ value: 3 });
    expect(state.sides.player).toMatchObject({ score: 3, currentEnergy: 1 });
  });
});
