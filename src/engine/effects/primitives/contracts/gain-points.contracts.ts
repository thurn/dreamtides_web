import { describe, expect, it } from "vitest";
import { DSL } from "../../../testing/dsl-cards";
import { playFromHand, runScenario } from "../../../testing/scenario";
import { engine, deck } from "./resources-support";

describe("resource primitives", () => {
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
