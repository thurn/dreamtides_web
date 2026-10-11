import { describe, expect, it } from "vitest";
import { playFromHand, runScenario } from "../../../testing/scenario";
import { engine, deck, rampOne } from "./resources-support";

describe("resource primitives", () => {
  it("gainMaxEnergy raises maximum and current energy", () => {
    const { state, events } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [rampOne.id], energy: 3, deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(state.sides.player).toMatchObject({ currentEnergy: 4, maxEnergy: 4 });
    expect(events.filter((item) => item.kind === "energyChanged")).toEqual([
      { kind: "energyChanged", side: "player", current: 4, max: 4, change: 1, maxChange: 1, cause: "effect" },
    ]);
  });
});
