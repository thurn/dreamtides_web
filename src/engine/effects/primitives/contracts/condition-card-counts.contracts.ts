import { describe, expect, it } from "vitest";
import { NO_DECK_MODS } from "../../../dsl/types";
import { DSL } from "../../../testing/dsl-cards";
import { playFromHand, runScenario } from "../../../testing/scenario";
import { engine, v, deck, handCountDiscard, countResponse, filteredVoidCount } from "./flow-support";

describe("flow primitives", () => {
  it("card counts use the opponent's hand relative to either controller, including short and empty hands", () => {
    for (const side of ["player", "enemy"] as const) {
      const opponent = side === "player" ? "enemy" : "player";
      for (const size of [0, 1, 4, 5, 6]) {
        const count = Math.min(size, size >= 5 ? 2 : 1);
        const { state, events } = runScenario(engine, {
          board: { active: side, phase: "day", [side]: { hand: [handCountDiscard.id], deck }, [opponent]: { hand: Array.from({ length: size }, () => v.vanilla1.id), deck } },
          steps: (ids) => [playFromHand(ids, side)],
          answers: (ids) => size > count ? [ids[opponent].hand.slice(0, count)] : [],
        });
        expect(state.sides[opponent].hand).toHaveLength(size - count);
        const discarded = events.filter((event) => event.kind === "discarded");
        expect(discarded).toHaveLength(count);
        expect(discarded.every((event) => event.side === opponent)).toBe(true);
      }
    }
  });

  it("card counts read the hand after responses resolve, before the conditional discard", () => {
    for (const amplified of [false, true]) {
      const size = amplified ? 4 : 5;
      const count = amplified ? 2 : 1;
      const { state, events } = runScenario(engine, {
        board: { active: "player", phase: "day", player: { hand: [handCountDiscard.id], deck }, enemy: { hand: [{ cardId: countResponse.id, amplified }, ...Array.from({ length: size - 1 }, () => v.vanilla1.id)], deck } },
        steps: (ids) => [playFromHand(ids, "player"), playFromHand(ids, "enemy")],
        answers: (ids) => [ids.enemy.hand.slice(1, 1 + count)],
      });
      expect(state.sides.enemy.hand).toHaveLength(size - 1 + (amplified ? 2 : 0) - count);
      expect(events.filter((event) => event.kind === "discarded")).toHaveLength(count);
    }
  });

  it("filtered zone counts use effective card types, inclusive bounds, subtypes, and empty-deck counts", () => {
    for (const eventsInVoid of [1, 2, 3]) {
      const { state } = runScenario(engine, {
        board: {
          active: "player", phase: "day",
          player: {
            hand: [filteredVoidCount.id, { cardId: v.vanilla1.id, amplified: false, deckMods: { ...NO_DECK_MODS, typeChange: { cardType: "event", subtype: "" } } }],
            void: [v.vanilla1.id, DSL.handOffering.id, ...Array.from({ length: eventsInVoid }, () => v.event0.id)], deck,
          },
          enemy: { void: [v.event0.id, v.event1.id, v.event0.id] },
        },
        steps: (ids) => [playFromHand(ids, "player")],
      });
      expect(state.sides.player.score).toBe(eventsInVoid === 2 ? 7 : 6);
    }
  });

  it("a conditional discard reclaimed from the void pays one discard before resolving and is banished", () => {
    const { state, ids, events } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { void: [handCountDiscard.id], hand: [v.vanilla1.id], deck }, enemy: { hand: [v.vanilla1.id], deck } },
      steps: (ids) => [{ side: "player", action: { kind: "play", card: ids.player.void[0], from: "void" } }],
    });
    expect(state.instances[ids.player.void[0]].zone).toBe("banished");
    expect(state.sides.player.void).toEqual(ids.player.hand);
    expect(state.sides.enemy.void).toEqual(ids.enemy.hand);
    expect(events.filter((event) => event.kind === "discarded").map((event) => event.side)).toEqual(["player", "enemy"]);
  });
});
