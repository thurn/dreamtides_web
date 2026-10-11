/**
 * Cost modifications as continuous effects, including "next card"
 * modifiers.
 */
import { describe, expect, it } from "vitest";
import { printedCard } from "../catalog";
import { createFoldAdapter, type BattleSlice } from "../fold/slice";
import { serializeState, stateHash } from "../state/hash";
import type { InstanceId, Side } from "../state/ids";
import type { BattleState } from "../state/types";
import { runStep } from "../steps/runner";
import { NO_PROMPTS, ScriptedSource } from "../steps/sources";
import { CONTINUOUS_DREAMSIGN } from "../testing/continuous-cards";
import { DSL } from "../testing/dsl-cards";
import { adjustedEnergy, costModifier } from "./costs";
import { twoPlusX, kicker, engine, catalog, c, v, deck, board, float, play } from "./continuous.fixtures";

/** The energy `side` would pay to play `card` now, X counted as 0. */
function costOf(state: BattleState, card: InstanceId | undefined, side: Side = "player"): number {
  if (card === undefined) throw new Error("no card");
  const definition = printedCard(catalog, state.instances[card].printing);
  const fixed = definition.costs.reduce((total, cost) => total + (cost.cost === "energy" ? cost.amount : 0), 0);
  return adjustedEnergy(fixed, costModifier(state, catalog, card, side));
}

describe("cost modifications", () => {
  it("raise costs, then lower them, never below 0", () => {
    const { state, ids } = board({ player: { hand: [v.event1.id], energy: 0, deck }, enemy: { deck } });
    const card = ids.player.hand[0];
    float(state, { kind: "cost", player: "player", filter: {}, amount: -3, next: false }, 1);
    float(state, { kind: "cost", player: "player", filter: {}, amount: 1, next: false }, 2);
    // 1● + 1● − 3●, floored at 0 once the increase has applied.
    expect(costOf(state, card)).toBe(0);
    expect(engine.legalActions(state, "player")).toContainEqual({ kind: "play", card, from: "hand" });
    expect(engine.view(state, "player").instances[card]?.characteristics.cost).toBe(0);
  });

  it("apply static increases and reductions by player and card type, in legality and payment", () => {
    const { state, ids } = board({
      player: { back: [c.eventTax.id, c.opponentTax.id], hand: [v.event1.id, v.vanilla3.id], dreamsigns: [CONTINUOUS_DREAMSIGN.discount.id], energy: 2, deck },
      enemy: { hand: [v.vanilla1.id], deck },
    });
    expect(costOf(state, ids.player.hand[0])).toBe(2);
    expect(costOf(state, ids.player.hand[1])).toBe(2);
    expect(costOf(state, ids.enemy.hand[0], "enemy")).toBe(2);
    const played = play(state, "player", ids.player.hand[1]).state;
    expect(played.sides.player.currentEnergy).toBe(0);
  });

  it("apply to the whole energy cost of a card with an X part", () => {
    const { state, ids } = board({ player: { back: [c.characterDiscount.id], hand: [twoPlusX.id], energy: 3, deck }, enemy: { deck } });
    float(state, { kind: "cost", player: "player", filter: { cardType: "event" }, amount: -3, next: false }, 1);
    // 2● + X − 3●: X may go up to 4 with 3● available.
    const result = play(state, "player", ids.player.hand[0], [4]);
    expect(result.state.sides.player).toMatchObject({ currentEnergy: 0, score: 4 });
  });

  it("apply to the energy of a paid optional cost, which a reduction can make free", () => {
    for (const [energyAvailable, left] of [[0, 0], [1, 1]] as const) {
      const { state, ids } = board({ player: { hand: [kicker.id], energy: energyAvailable, deck }, enemy: { deck } });
      float(state, { kind: "cost", player: "player", filter: {}, amount: -2, next: false }, 1);
      // 0● plus the optional 2●, less 2●: the option is offered and costs nothing.
      const source = new ScriptedSource([true]);
      const result = engine.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, source);
      source.assertExhausted();
      expect(result.state.sides.player).toMatchObject({ currentEnergy: left, score: 2 });
    }
  });

  it("use up a 'next card' modifier on the next matching play only", () => {
    const { state, ids } = board({ player: { hand: [c.nextEventDiscount.id, v.vanilla1.id, v.event1.id, v.event1.id], energy: 2, deck }, enemy: { deck } });
    let next = play(state, "player", ids.player.hand[0]).state;
    expect(next.floating).toHaveLength(1);
    // A character does not match the filter and leaves it in place; legality and views never use it up.
    next = play(next, "player", ids.player.hand[1]).state;
    engine.legalActions(next, "player");
    engine.view(next, "player");
    expect(next.floating).toHaveLength(1);
    expect(next.sides.player.currentEnergy).toBe(1);
    const discounted = play(next, "player", ids.player.hand[2]);
    expect(discounted.state.floating).toEqual([]);
    expect(discounted.events).toContainEqual({ kind: "effectEnded", effect: next.floating[0].id });
    expect(discounted.state.sides.player.currentEnergy).toBe(1);
    expect(costOf(discounted.state, ids.player.hand[3])).toBe(1);
  });

  it("leave a 'next card' modifier in place when a play stops before its commit point", () => {
    const { state, ids } = board({ player: { hand: [DSL.pointsTimesX.id], energy: 3, deck }, enemy: { deck } });
    float(state, { kind: "cost", player: "player", filter: {}, amount: -1, next: true }, 1);
    const before = serializeState(state);
    // The X prompt has no answer: the step throws and its private copy is dropped.
    expect(() => runStep(state, { kind: "play", from: "hand", card: ids.player.hand[0] }, NO_PROMPTS, catalog)).toThrow();
    expect(serializeState(state)).toBe(before);
  });

  it("survive a reload while a discounted play waits at its X prompt, and use the modifier up once", () => {
    const { state, ids } = board({ player: { hand: [DSL.pointsTimesX.id], energy: 2, deck }, enemy: { deck } });
    const discount = float(state, { kind: "cost", player: "player", filter: {}, amount: -1, next: true }, 1);
    const card = ids.player.hand[0];
    const fold = createFoldAdapter(engine);
    const started: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const suspended = fold.reduce(started, { kind: "battleAction", side: "player", action: { kind: "play", card, from: "hand" } });
    if (suspended.kind !== "applied") throw new Error("bounced");
    const reloaded = JSON.parse(JSON.stringify(suspended.slice)) as BattleSlice;
    const fresh = createFoldAdapter(engine);
    const pending = fresh.pending(reloaded);
    // X goes up to 3: 2● available plus the 1● discount.
    expect(pending?.prompt).toMatchObject({ kind: "chooseNumber", min: 1, max: 3 });
    expect(reloaded.committed.floating.map((effect) => effect.id)).toEqual([discount]);
    const answered = fresh.reduce(reloaded, { kind: "answer", side: "player", promptId: pending!.prompt.id, value: 3 });
    if (answered.kind !== "applied" || answered.error !== null) throw new Error("answer failed");
    const inline = play(state, "player", card, [3]).state;
    expect(stateHash(answered.slice.committed)).toBe(stateHash(inline));
    expect(inline.floating).toEqual([]);
    expect(inline.sides.player).toMatchObject({ currentEnergy: 0, score: 3 });
  });

  it("tax the opponent's next card", () => {
    const { state, ids } = board({ player: { hand: [c.nextCardTax.id], deck }, enemy: { hand: [v.vanilla1.id], energy: 1, deck } });
    const taxed = play(state, "player", ids.player.hand[0]).state;
    expect(costOf(taxed, ids.enemy.hand[0], "enemy")).toBe(2);
    expect(costOf(taxed, ids.enemy.hand[0], "player")).toBe(1);
  });
});
