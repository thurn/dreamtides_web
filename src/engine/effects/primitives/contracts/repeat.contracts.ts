import { describe, expect, it } from "vitest";
import { boardState } from "../../../testing/board";
import { DSL } from "../../../testing/dsl-cards";
import { playFromHand, runScenario } from "../../../testing/scenario";
import { engine, deck, pointsFromZeroX } from "./flow-support";

describe("flow primitives", () => {
  it("repeat and X: X is chosen at play time, paid, and read on resolution", () => {
    const { state, answers } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.pointsTimesX.id], energy: 4, deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
      answers: () => [3],
    });
    expect(answers[0]).toMatchObject({ value: 3 });
    expect(state.sides.player).toMatchObject({ score: 3, currentEnergy: 1 });
  });

  it("a fixed cost plus X prompts for X up to the energy left after the fixed part, and pays both", () => {
    const { state, answers, events } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.fixedPlusXPoints.id], energy: 4, deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
      answers: () => [3],
    });
    expect(answers[0]).toMatchObject({ value: 3 });
    expect(state.sides.player).toMatchObject({ score: 3, currentEnergy: 0 });
    // The fixed part is paid first, then X.
    const spent = events.flatMap((event) => (event.kind === "energyChanged" && event.side === "player" ? [event.current] : []));
    expect(spent.slice(0, 2)).toEqual([3, 0]);
    const tooMuch = () =>
      runScenario(engine, {
        board: { active: "player", phase: "day", player: { hand: [DSL.fixedPlusXPoints.id], energy: 4, deck }, enemy: { deck } },
        steps: (ids) => [playFromHand(ids, "player")],
        answers: () => [4],
      });
    expect(tooMuch).toThrow();
  });

  it("a fixed cost plus X needs the fixed part and X's minimum to be playable", () => {
    const playable = (energy: number) => {
      const { state } = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [DSL.fixedPlusXPoints.id], energy, deck }, enemy: { deck } });
      return engine.legalActions(state, "player").some((action) => action.kind === "play");
    };
    expect(playable(1)).toBe(false);
    expect(playable(2)).toBe(true);
  });

  it("X is at least 1 unless the definition widens it to 0", () => {
    const playable = (cardId: typeof DSL.pointsTimesX.id) => {
      const { state } = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [cardId], energy: 0, deck }, enemy: { deck } });
      return engine.legalActions(state, "player").some((action) => action.kind === "play");
    };
    expect(playable(DSL.pointsTimesX.id)).toBe(false);
    expect(playable(pointsFromZeroX.id)).toBe(true);
  });
});
