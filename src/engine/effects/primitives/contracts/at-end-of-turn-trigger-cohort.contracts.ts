/**
 * Borrowed Minutes' shape, `withMaterialized(materialize(everyIn("void", …,
 * { costAtMost: x() })), delayed(atEndOfTurn(), banishCards([capturedCards()])))`:
 * the X bound is read once as the effect resolves against each void card's
 * copiable cost, and at end of turn only the members still in play are
 * banished, whoever controls them, with no hidden card leaking.
 */
import { describe, expect, it } from "vitest";
import { BASE_VARIANT, NO_DECK_MODS } from "../../../dsl/types";
import { battleSeed, SIDES, type InstanceId } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { determinizationDivergences } from "../../../testing/determinization-fidelity";
import { Answers, banished, endTurn, engine, F, handCard, play, setup, v, waiting, zone } from "./at-end-of-turn-trigger-support";
import { decklists } from "./with-materialized-support";

/** The void characters `x` materializes from the void `cards`, after `prepare` adjusts the board. */
function borrowFor(x: number, cards: readonly (typeof v.vanilla0.id)[], prepare: (state: BattleState, voidIds: readonly InstanceId[]) => BattleState = (state) => state) {
  const { state, ids } = setup({ hand: [F.borrow.id, F.cheapen.id], void: [...cards] });
  const ready = prepare(state, ids.player.void);
  const raised = play(ready, handCard(ready, F.borrow), new Answers([x]));
  return { raised, entered: ids.player.void.filter((id) => zone(raised.state, id) === "play"), voidIds: ids.player.void };
}

describe("atEndOfTurn with a materialized cohort", () => {
  it("takes for X = 0 only the void characters whose copiable cost is 0●, X in a cost counting as 0", () => {
    const { raised, entered, voidIds } = borrowFor(0, [v.vanilla0.id, v.vanilla1.id, F.oneX.id, v.vanilla0.id, v.event0.id]);
    expect(entered).toEqual([voidIds[0], voidIds[3]]);
    expect(raised.state.sides.player.currentEnergy).toBe(8);
    const ended = endTurn(raised.state);
    expect(banished(ended.events)).toEqual(entered);
  });

  it("reads the paid X against copiable cost: deck-entry cost reductions count, play-cost changes do not", () => {
    const { entered, voidIds } = borrowFor(1, [v.vanilla1.id, F.oneX.id, v.vanilla3.id, v.vanilla2.id, v.vanilla5.id], (state, ids) => {
      const reduced = ids[2];
      state.instances[reduced] = { ...state.instances[reduced], variant: { ...BASE_VARIANT, deckMods: { ...NO_DECK_MODS, costReduction: 2 } } };
      // "Characters you play cost 2● less" changes what playing vanilla2 costs, not its copiable cost.
      return play(state, handCard(state, F.cheapen)).state;
    });
    expect(entered).toEqual([voidIds[0], voidIds[1], voidIds[2]]);
  });

  it("spares a member an opponent's response dissolved and banishes one the opponent took control of", () => {
    const { state, ids } = setup(
      { hand: [F.borrow.id, F.draw.id, F.draw.id], void: [v.vanilla1.id, v.vanilla2.id], deck: [v.event0.id, v.event0.id, v.event0.id] },
      { hand: [F.kill.id, F.steal.id], energy: 2 },
    );
    const [dissolved, stolen] = ids.player.void;
    let current = play(state, handCard(state, F.borrow), new Answers([2])).state;
    for (const [response, member] of [[F.kill, dissolved], [F.steal, stolen]] as const) {
      const cast = engine.apply(current, "player", { kind: "play", card: handCard(current, F.draw), from: "hand" }, new Answers()).state;
      current = play(cast, handCard(cast, response, "enemy"), new Answers([], [[member]]), "enemy").state;
    }
    expect([zone(current, dissolved), current.instances[stolen].controller]).toEqual(["void", "enemy"]);
    const ended = endTurn(current);
    expect(banished(ended.events)).toEqual([stolen]);
    expect(ended.state.sides.player.banished).toEqual([stolen]);
    expect(zone(ended.state, dissolved)).toBe("void");
  });

  it("banishes neither a figment copy of a member nor a member returned to hand, with views that agree with every determinization", () => {
    const { state, ids } = setup({ hand: [F.borrow.id, F.copy.id, F.bounce.id], void: [v.vanilla1.id, v.vanilla2.id] });
    const [copied, returned] = ids.player.void;
    let current = play(state, handCard(state, F.borrow), new Answers([2])).state;
    current = play(current, handCard(current, F.copy), new Answers([], [[copied]])).state;
    const copy = current.sides.player.backRank.find((id) => id !== null && current.instances[id].printing.kind === "figmentCopy")!;
    current = play(current, handCard(current, F.bounce), new Answers([], [[returned]])).state;
    expect(zone(current, returned)).toBe("hand");

    const ended = endTurn(current);
    const paused = waiting(ended.steps);
    // The enemy saw the member return to hand, so both views name it.
    for (const viewer of SIDES) expect(engine.view(paused, viewer).triggerQueue[0].captured).toEqual([copied, returned]);
    expect(determinizationDivergences(engine, paused, decklists(paused), battleSeed("end-of-turn"), 0)).toEqual([]);
    expect(banished(ended.events)).toEqual([copied]);
    expect([zone(ended.state, copy), zone(ended.state, returned)]).toEqual(["play", "hand"]);
    for (const viewer of SIDES) expect(engine.view(ended.state, viewer).floating).toEqual([]);
  });
});
