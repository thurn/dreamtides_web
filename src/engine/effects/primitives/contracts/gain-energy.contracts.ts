import { describe, expect, it } from "vitest";
import { DSL } from "../../../testing/dsl-cards";
import { playFromHand, runScenario } from "../../../testing/scenario";
import { engine, deck } from "./resources-support";

describe("resource primitives", () => {
  it("gainEnergy adds current energy for the turn only", () => {
    const { state, events } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.gainTwoEnergy.id], energy: 3, deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(state.sides.player).toMatchObject({ currentEnergy: 5, maxEnergy: 3 });
    expect(events.filter((item) => item.kind === "energyChanged")).toEqual([
      { kind: "energyChanged", side: "player", current: 5, max: 3, change: 2, maxChange: 0, cause: "effect" },
    ]);
  });
});
