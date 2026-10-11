import { describe, expect, it } from "vitest";
import { DSL } from "../../../testing/dsl-cards";
import { playFromHand, runScenario } from "../../../testing/scenario";
import { engine, deck } from "./cards-support";

describe("card primitives", () => {
  it("draw moves cards from the top of the deck to hand", () => {
    const { state, ids } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.drawTwo.id], energy: 1, deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(state.sides.player.hand).toEqual(ids.player.deck.slice(0, 2));
  });

  it("reads the amplified variant", () => {
    const run = (amplified: boolean) =>
      runScenario(engine, {
        board: {
          active: "player",
          phase: "day",
          player: { hand: [{ cardId: DSL.amplifiedDraw.id, amplified }], energy: 1, deck },
          enemy: { deck },
        },
        steps: (ids) => [playFromHand(ids, "player")],
      });
    expect(run(false).state.sides.player.hand).toHaveLength(2);
    expect(run(true).state.sides.player.hand).toHaveLength(3);
  });
});
