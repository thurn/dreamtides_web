/** Nonresolving counter bounds read live play state, independently of a pending activation. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { characteristics } from "../../../continuous/characteristics";
import { abandonSelfCost, activated, all, characterYouControl, controls, count, enemyCharacter, staticAbility, storedCounters } from "../../../dsl/builders";
import { conditionHoldsWith, type ConditionScope } from "../../../dsl/conditions";
import { matchingCharacters } from "../../../dsl/selectors";
import { createEngine } from "../../../engine";
import { opponent, SIDES, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { boardState } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { unannouncedChanges } from "../../../testing/announced-changes";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { gainPoints } from "../gain-points";
import { sparkModifier } from "../spark-modifier";
import { storeCounters } from "../store-counters";

const deck = Array.from({ length: 8 }, () => v.vanilla1.id);
const affordable = () => characterYouControl({ costAtMost: storedCounters() });

function fixture(side: Side, mode: "selector" | "while" = "selector") {
  const card: EngineCardDefinition = {
    ...v.vanilla5,
    id: syntheticId(0x69500),
    status: "authored",
    abilities: () => [
      activated([], storeCounters(1)),
      activated([abandonSelfCost()], gainPoints(count(enemyCharacter({ costAtMost: storedCounters() })))),
      mode === "selector"
        ? staticAbility(sparkModifier(all(affordable()), 5))
        : staticAbility(sparkModifier(all(characterYouControl({ costAtLeast: 2, costAtMost: 2 })), 7), {
            while: controls(affordable(), 3),
          }),
    ],
  };
  const engine = createEngine(testCatalog([card]));
  const other = opponent(side);
  const { state, ids } = boardState(engine.catalog, {
    active: side, phase: "day", scoreToWin: 100,
    [side]: { back: [card.id, v.vanilla0.id, v.vanilla1.id, v.vanilla2.id], deck },
    // An actual response card keeps activation resolution pending until this side passes.
    [other]: { back: [v.vanilla0.id, v.vanilla1.id, v.vanilla2.id], hand: [v.interruptEvent.id], energy: 1, deck },
  });
  const source = ids[side].back[0]!;
  const own = ids[side].back.slice(1).map(id => id!);
  const opposing = ids[other].back.map(id => id!);
  expect(new Set([source, ...own, ...opposing]).size).toBe(7);
  return { engine, state, source, side, other, own, opposing };
}

function store(f: ReturnType<typeof fixture>, state: BattleState, expected: number) {
  const pending = f.engine.apply(state, f.side, { kind: "activate", source: f.source, ability: 0 }, NO_PROMPTS);
  const result = f.engine.apply(pending.state, f.other, { kind: "pass" }, NO_PROMPTS);
  expect(result.events).toContainEqual({ kind: "countersChanged", instance: f.source, counters: expected });
  expect(result.state.instances[f.source].status.counters).toBe(expected);
  expect(result.state.stack).toEqual([]);
  expect(invariantViolations(result.state, f.engine.catalog)).toEqual([]);
  expect(unannouncedChanges(result.events, pending.state, result.state)).toEqual([]);
  return result.state;
}

function sparks(f: ReturnType<typeof fixture>, state: BattleState) {
  const read = characteristics(state, f.engine.catalog);
  expect(f.opposing.map(id => read.of(id).spark)).toEqual([0, 1, 2]);
  return f.own.map(id => read.of(id).spark);
}

describe.each(SIDES)("stored-counter live scopes controlled by %s", side => {
  it("updates a real static selector after each successful stored counter", () => {
    const f = fixture(side);
    expect(sparks(f, f.state)).toEqual([5, 1, 2]);
    const one = store(f, f.state, 1);
    expect(sparks(f, one)).toEqual([5, 6, 2]);
    const two = store(f, one, 2);
    expect(sparks(f, two)).toEqual([5, 6, 7]);
    expect(two.floating).toEqual([]);
  });

  it("gates a real static while by its current stored-counter bound", () => {
    const f = fixture(side, "while");
    expect(sparks(f, f.state)).toEqual([0, 1, 2]);
    const one = store(f, f.state, 1);
    expect(sparks(f, one)).toEqual([0, 1, 2]);
    const two = store(f, one, 2);
    expect(sparks(f, two)).toEqual([0, 1, 9]);
    expect(two.floating).toEqual([]);
  });

  it("reads departed zero in an independent condition while the pending activation retains two", () => {
    const f = fixture(side);
    const two = store(f, store(f, f.state, 1), 2);
    const pending = f.engine.apply(two, side, { kind: "activate", source: f.source, ability: 1 }, new ScriptedSource([[f.source]]));
    const state = pending.state;
    expect(state.instances[f.source]).toMatchObject({ zone: "void", status: { counters: 0 } });
    expect(state.stack).toHaveLength(1);
    expect(state.stack[0]).toMatchObject({ kind: "ability", source: f.source, paymentSourceCounters: 2 });
    expect(invariantViolations(state, f.engine.catalog)).toEqual([]);
    expect(sparks(f, state)).toEqual([0, 1, 2]);

    const selector = enemyCharacter({ costAtMost: storedCounters() });
    const scope: ConditionScope = { controller: side, source: f.source, optionalPaid: [] };
    const read = characteristics(state, f.engine.catalog);
    expect(matchingCharacters(state, f.engine.catalog, selector, side, f.source)).toEqual([f.opposing[0]]);
    expect(conditionHoldsWith(state, f.engine.catalog, id => read.of(id), controls(selector, 3), scope)).toBe(false);
    expect(conditionHoldsWith(state, f.engine.catalog, id => read.of(id), {
      ...controls(selector), atMost: 1,
    }, scope)).toBe(true);
    // The independent read neither consumes nor overwrites the resolving ability's scalar.
    expect(state.stack[0]).toMatchObject({ paymentSourceCounters: 2 });
    const result = f.engine.apply(state, f.other, { kind: "pass" }, NO_PROMPTS);
    expect(result.state.sides[side].score).toBe(3);
    expect(result.state.stack).toEqual([]);
    expect(invariantViolations(result.state, f.engine.catalog)).toEqual([]);
    expect(unannouncedChanges(result.events, state, result.state)).toEqual([]);
  });
});
