import { describe, expect, it } from "vitest";
import type { EngineEvent } from "../../../events";
import { DSL } from "../../../testing/dsl-cards";
import { playFromHand, runScenario } from "../../../testing/scenario";
import { engine, deck, drawThenWinIfDeckEmpty } from "./resources-support";

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
