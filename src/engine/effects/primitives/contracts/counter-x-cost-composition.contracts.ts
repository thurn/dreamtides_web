import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { activated, countersCost, countersXCost, energy, energyX } from "../../../dsl/builders";
import { createEngine } from "../../../engine";
import { opponent, SIDES } from "../../../state/ids";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { boardState } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { gainPoints } from "../gain-points";

const deck = Array.from({ length: 4 }, () => v.vanilla1.id);

/** Fixed and variable counters add; only the separately printed energy parts spend energy. */
describe.each(SIDES)("counter-X composition payments by %s", side => {
  const rows = [
    { label: "meaningful zero", costs: [countersXCost(0)], x: 0, counters: 4, energy: 5, events: [] },
    { label: "fixed plus variable counters", costs: [countersCost(1), countersXCost()], x: 2, counters: 1, energy: 5, events: [3, 1] },
    { label: "shared energy and repeated counter X", costs: [energy(1), energyX(0), countersXCost(0), countersXCost(0)], x: 2, counters: 0, energy: 2, events: [2, 0] },
  ];
  it.each(rows)("$label pays the ruled separate budgets", row => {
    const sourceCard: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x69310), status: "authored", abilities: () => [activated(row.costs, gainPoints(1))] };
    const paymentEngine = createEngine(testCatalog([sourceCard]));
    const other = opponent(side);
    const { state, ids } = boardState(paymentEngine.catalog, { active: side, phase: "day",
      [side]: { back: [sourceCard.id], energy: 5, deck }, [other]: { hand: [v.interruptEvent.id], energy: 1, deck } });
    const source = ids[side].back[0]!;
    state.instances[source].status.counters = 4;
    const paid = paymentEngine.apply(state, side, { kind: "activate", source, ability: 0 }, new ScriptedSource([row.x]));
    expect(paid.state.stack[0]?.x).toBe(row.x);
    expect(paid.state.instances[source].status.counters).toBe(row.counters);
    expect(paid.state.sides[side].currentEnergy).toBe(row.energy);
    expect(paid.events.filter(event => event.kind === "countersChanged").map(event => event.counters)).toEqual(row.events);
    const done = paymentEngine.apply(paid.state, other, { kind: "pass" }, NO_PROMPTS);
    expect(done.state.sides[side].score).toBe(1);
    expect(invariantViolations(done.state, paymentEngine.catalog)).toEqual([]);
  });
});
