import { describe, expect, it } from "vitest";
import { DSL } from "../../../testing/dsl-cards";
import { playFromHand, runScenario } from "../../../testing/scenario";
import { engine, v, deck } from "./cards-support";

describe("card primitives", () => {
  it("discard has the player choose, discarding the whole hand when it is short", () => {
    const chosen = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.discardTwo.id, v.vanilla1.id, v.vanilla2.id, v.vanilla3.id], deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
      answers: (ids) => [[ids.player.hand[1], ids.player.hand[3]]],
    });
    expect(chosen.state.sides.player.hand).toEqual([chosen.ids.player.hand[2]]);
    const short = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.discardTwo.id, v.vanilla1.id], deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(short.state.sides.player.hand).toEqual([]);
    expect(short.answers).toEqual([expect.objectContaining({ auto: true })]);
  });
});
