import { describe, expect, it } from "vitest";
import { eventSeenBy } from "../../../events";
import type { BattleState } from "../../../state/types";
import { DSL } from "../../../testing/dsl-cards";
import { playFromHand, runScenario } from "../../../testing/scenario";
import { engine, deck } from "./cards-support";

describe("card primitives", () => {
  it("foresee reorders the top cards and sends the chosen ones to the void", () => {
    const { state, ids } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.foreseeTwo.id], deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
      answers: (ids) => [[{ card: ids.player.deck[1], to: "top" }, { card: ids.player.deck[0], to: "void" }]],
    });
    expect(state.sides.player.deck.slice(0, 3)).toEqual([ids.player.deck[1], ids.player.deck[2], ids.player.deck[3]]);
    expect(state.sides.player.void).toContain(ids.player.deck[0]);
  });

  it("foresee publishes where each card went, naming the kept cards only to the foreseeing side", () => {
    const { state, ids, events } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.foreseeTwo.id], deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
      answers: (ids) => [[{ card: ids.player.deck[1], to: "top" }, { card: ids.player.deck[0], to: "void" }]],
    });
    const foresaw = events.filter((event) => event.kind === "foresaw");
    expect(foresaw).toEqual([{ kind: "foresaw", side: "player", kept: [ids.player.deck[1]], voided: [ids.player.deck[0]] }]);
    expect(eventSeenBy(foresaw[0], "player", state)).toEqual(foresaw[0]);
    expect(eventSeenBy(foresaw[0], "enemy", state)).toEqual({ kind: "foresaw", side: "player", kept: [null], voided: [ids.player.deck[0]] });
    // Once the deck is shuffled, nobody can identify the kept card any longer.
    const shuffled: BattleState = { ...state, knownTo: { player: [], enemy: [] } };
    expect(eventSeenBy(foresaw[0], "player", shuffled)).toEqual({ ...foresaw[0], kept: [null] });
  });

  it("positive foresee completes from an empty deck without a prompt", () => {
    const { events, answers } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.foreseeTwo.id], deck: [] }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(answers).toEqual([]);
    expect(events.filter((event) => event.kind === "foresaw")).toEqual([{ kind: "foresaw", side: "player", kept: [], voided: [] }]);
    expect(events.some((event) => event.kind === "fatigue" || event.kind === "shuffledIntoDeck")).toBe(false);
  });
});
