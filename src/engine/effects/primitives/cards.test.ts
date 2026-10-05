/** Card primitives: draw, discard, foresee, erode. */
import { describe, expect, it } from "vitest";
import { createEngine } from "../../engine";
import { DSL, DSL_CARDS } from "../../testing/dsl-cards";
import { playFromHand, runScenario } from "../../testing/scenario";
import { SYNTHETIC, testCatalog } from "../../testing/synthetic-cards";

const engine = createEngine(testCatalog(DSL_CARDS));
const v = SYNTHETIC;
const deck = [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id, v.vanilla5.id];

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

  it("random discard draws from its own random stream without a prompt", () => {
    const { state, answers } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.opponentDiscardsRandom.id], energy: 1, deck }, enemy: { hand: [v.vanilla1.id, v.vanilla2.id], deck } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(state.sides.enemy.hand).toHaveLength(1);
    expect(state.rng["random:discard"]).toBe(1);
    expect(answers).toEqual([]);
  });

  it("foresee reorders the top cards and sends the chosen ones to the void", () => {
    const { state, ids } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.foreseeTwo.id], deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
      answers: (ids) => [[{ card: ids.player.deck[1], to: "top" }, { card: ids.player.deck[0], to: "void" }]],
    });
    expect(state.sides.player.deck.slice(0, 3)).toEqual([ids.player.deck[1], ids.player.deck[2], ids.player.deck[3]]);
    expect(state.sides.player.void).toContain(ids.player.deck[0]);
  });

  it("erode moves the top cards to the void and causes Fatigue from an empty deck", () => {
    const { state } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.erodeThree.id], deck }, enemy: { deck: [v.vanilla1.id] } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(state.sides.enemy.void).toHaveLength(1);
    expect(state.sides.enemy.fatigueCount).toBe(2);
    expect(state.sides.player.score).toBe(1 + 2);
  });
});
