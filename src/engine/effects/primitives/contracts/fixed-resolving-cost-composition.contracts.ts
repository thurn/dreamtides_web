/** Resolving fixed payments keep their own cost independently of the parent play route. */
import { describe, expect, it } from "vitest";
import { event, energy } from "../../../dsl/builders";
import type { EngineCardDefinition } from "../../../catalog";
import { createEngine } from "../../../engine";
import { type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { boardState } from "../../../testing/board";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { ScriptedSource } from "../../../steps/sources";
import { draw } from "../draw";
import { payTo } from "../pay-to";
const PLAYER: Side = "player";
const deck = Array.from({ length: 4 }, () => v.vanilla1.id);
describe("fixed resolving-payment cost composition", () => {
  const subject: EngineCardDefinition = {
    ...v.event0, id: syntheticId(0x43890), status: "authored", costs: [energy(3)],
    abilities: () => [event(payTo({ energy: 2, discard: 1 }, draw(1)))],
  };
  const paymentEngine = createEngine(testCatalog([subject]));
  it.each([
    { change: { kind: "cardCost", mode: "increase", amount: 2 } as const, outer: 5 },
    { change: { kind: "cost", amount: -2, next: false, filter: {} } as const, outer: 1 },
  ])("changes the parent cost to $outer and leaves the resolving payment at 2", ({ change, outer }) => {
    const { state, ids } = boardState(paymentEngine.catalog, { active: PLAYER, phase: "day", player: { hand: [subject.id, v.vanilla1.id, v.vanilla2.id], back: [v.vanilla1.id], energy: 10, deck }, enemy: { deck } });
    const target = ids.player.hand[0];
    const prepared: BattleState = { ...state, nextEffect: state.nextEffect + 1, floating: [{ id: `e${state.nextEffect}`, controller: PLAYER, source: ids.player.back[0]!, timestamp: 1, expiry: { at: "endOfTurn" }, change: change.kind === "cardCost" ? { ...change, instance: target } : { ...change, player: PLAYER } }] };
    const result = paymentEngine.apply(prepared, PLAYER, { kind: "play", card: target, from: "hand" }, new ScriptedSource([true, [ids.player.hand[1]]]));
    expect(result.state.sides.player.currentEnergy).toBe(10 - outer - 2);
    expect(result.events.filter((e) => e.kind === "energyChanged" && e.cause === "payment").map((e) => e.kind === "energyChanged" ? e.change : 0)).toEqual([-outer, -2]);
    expect(result.state.sides.player.deck).toHaveLength(3);
  });
  it("resolves an affordable parent without offering an unaffordable inner payment", () => {
    const { state, ids } = boardState(paymentEngine.catalog, { active: PLAYER, phase: "day", player: { hand: [subject.id, v.vanilla1.id], energy: 3, deck }, enemy: { deck } });
    const result = paymentEngine.apply(state, PLAYER, { kind: "play", card: ids.player.hand[0], from: "hand" }, new ScriptedSource([]));
    expect(result.state.sides.player.currentEnergy).toBe(0);
    expect(result.state.sides.player.hand).toEqual(ids.player.hand.slice(1));
    expect(result.state.sides.player.deck).toEqual(ids.player.deck);
  });
});

