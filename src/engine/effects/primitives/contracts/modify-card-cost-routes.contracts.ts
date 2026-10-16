/** Card setters replace the ordinary energy component, preserving chosen route and additional payments. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { createEngine, type Engine } from "../../../engine";
import { additionalCost, choiceCost, discardCostFilter, energy, energyX, event, everyIn, keyword, optionalCost, pointsCost, reclaim } from "../../../dsl/builders";
import type { Ability, CardCost } from "../../../dsl/types";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { stateHash } from "../../../state/hash";
import type { Side } from "../../../state/ids";
import { SIDES, opponent } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { boardState } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { drawMatching } from "../draw-matching";
import { gainPoints } from "../gain-points";
import { modifyCardCost } from "../modify-card-cost";
import { costModifier } from "../cost-modifier";
import { grantReclaim } from "../grant-reclaim";
import { playFromZone } from "../play-from-zone";
import { sequence } from "../sequence";
import { discard } from "../discard";
import { returnFromVoid } from "../return-from-void";
import type { ResolvingEffect } from "../../registry";

const deck = Array.from({ length: 8 }, () => v.vanilla1.id);
function resolved(engine: Engine, initial: BattleState): BattleState {
  let state = initial;
  while (state.stack.length > 0) {
    const decision = engine.decision(state);
    if (decision?.kind !== "respond") throw new Error("expected response");
    state = engine.apply(state, decision.side, { kind: "pass" }, NO_PROMPTS).state;
  }
  return state;
}
interface SetupOptions {
  readonly abilities?: readonly Ability[];
  readonly costs?: readonly CardCost[];
  readonly set?: number;
  readonly more?: number;
  readonly effects?: readonly ResolvingEffect[];
  readonly utility?: ResolvingEffect;
  readonly keepInHand?: boolean;
  readonly displayedCost?: number;
}
function prepared(side: Side, reclaimEnergy: number, optionalEnergy: boolean, available: number, options: SetupOptions = {}) {
  const character: EngineCardDefinition = {
    ...v.vanilla2, id: syntheticId(0x41900), status: "authored",
    costs: options.costs ?? v.vanilla2.costs,
    abilities: () => [...(options.abilities ?? [reclaim(energy(reclaimEnergy))]), ...(optionalEnergy ? [additionalCost(optionalCost(energy(1)))] : [])],
  };
  const drawnEffect = modifyCardCost(drawMatching({ cardType: "character", costAtMost: 2 }), { set: options.set ?? 0 });
  const drawEffect = options.more === undefined ? drawnEffect : modifyCardCost(drawnEffect, { increase: options.more });
  const setter: EngineCardDefinition = {
    ...v.event0, id: syntheticId(0x41901), status: "authored",
    abilities: () => [event(sequence(drawEffect, ...(options.effects ?? [])))],
  };
  const discarder: EngineCardDefinition = {
    ...v.event0, id: syntheticId(0x41902), status: "authored",
    abilities: () => [additionalCost(discardCostFilter({ cardType: "character" })), event(gainPoints(1))],
  };
  const utility: EngineCardDefinition = {
    ...v.event0, id: syntheticId(0x41903), status: "authored",
    abilities: () => [event(options.utility ?? gainPoints(0))],
  };
  const engine = createEngine(testCatalog([character, setter, discarder, utility]));
  const { state: initial, ids } = boardState(engine.catalog, {
    active: side, phase: "day",
    [side]: { hand: [setter.id, discarder.id, ...(options.utility === undefined ? [] : [utility.id]) ], energy: available, deck: [character.id, ...deck] },
    [opponent(side)]: { deck },
  });
  const source = ids[side].deck[0];
  const drawn = resolved(engine, engine.apply(initial, side, { kind: "play", card: ids[side].hand[0], from: "hand" }, NO_PROMPTS).state);
  expect(engine.view(drawn, side).instances[source]?.characteristics.cost).toBe(options.displayedCost ?? Math.max(0, (options.set ?? 0) + (options.more ?? 0)));
  if (options.keepInHand) return { engine, state: drawn, source, utility: ids[side].hand[2], fodder: ids[side].hand[1] };
  const state = resolved(engine, engine.apply(drawn, side, { kind: "play", card: ids[side].hand[1], from: "hand" }, NO_PROMPTS).state);
  expect(state.instances[source].zone).toBe("void");
  return { engine, state, source, utility: ids[side].hand[2], fodder: ids[side].hand[1] };
}

function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("expected applied intent");
  return outcome.slice;
}
const sliceOf = (state: BattleState): BattleSlice => ({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 });

describe("modifyCardCost route components", () => {
  it.each(SIDES)("%s pays an accepted optional energy cost on explicit Reclaim 0", (side) => {
    const { engine, state, source } = prepared(side, 0, true, 1);
    const action = { kind: "play", card: source, from: "void" } as const;
    expect(engine.legalActions(state, side)).toContainEqual(action);
    const result = engine.apply(state, side, action, new ScriptedSource([true]));
    expect(result.state.sides[side].currentEnergy).toBe(0);
    expect(result.answers).toContainEqual(expect.objectContaining({ value: true }));
    expect(result.state.sides[opponent(side)].currentEnergy).toBe(state.sides[opponent(side)].currentEnergy);
    expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  });

  it.each(SIDES)("%s preserves explicit Reclaim 5 in legality and committed payment", (side) => {
    const { engine, state, source } = prepared(side, 5, false, 5);
    const short = { ...state, sides: { ...state.sides, [side]: { ...state.sides[side], currentEnergy: 4 } } };
    const action = { kind: "play", card: source, from: "void" } as const;
    const offeredAtFour = engine.legalActions(short, side).some((candidate) => candidate.kind === "play" && candidate.card === source && candidate.from === "void");
    const result = engine.apply(state, side, action, NO_PROMPTS);
    expect({ offeredAtFour, energyPaid: state.sides[side].currentEnergy - result.state.sides[side].currentEnergy }).toEqual({ offeredAtFour: false, energyPaid: 5 });
    expect(result.state.instances[source].status.reclaimed).toBe(true);
    expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  });


  it.each(SIDES)("%s can decline optional energy on the explicit replacement route", (side) => {
    const { engine, state, source } = prepared(side, 0, true, 1);
    const result = engine.apply(state, side, { kind: "play", card: source, from: "void" }, new ScriptedSource([false]));
    expect(result.state.sides[side].currentEnergy).toBe(1);
    expect(result.answers).toContainEqual(expect.objectContaining({ value: false }));
    expect(result.state.instances[source].status.playedViaReclaim).toBe(true);
    expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  });

  it.each(SIDES)("%s uses the normal component for hand and plain Reclaim", (side) => {
    for (const keepInHand of [true, false]) {
      const { engine, state, source } = prepared(side, 0, true, 1, { abilities: [keyword("reclaim")], keepInHand });
      const result = engine.apply(state, side, { kind: "play", card: source, from: keepInHand ? "hand" : "void" }, new ScriptedSource([true]));
      expect(result.state.sides[side].currentEnergy).toBe(0);
      expect(result.answers).toContainEqual(expect.objectContaining({ value: true }));
      expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
    }
  });

  it.each(SIDES)("%s prices a chosen permission and Reclaim route independently", (side) => {
    const { engine, state, source } = prepared(side, 5, false, 5, { effects: [playFromZone("void", { cardType: "character" })] });
    for (const [route, paid, reclaimed] of [[0, 0, false], [1, 5, true]] as const) {
      const result = engine.apply(state, side, { kind: "play", card: source, from: "void" }, new ScriptedSource([route]));
      expect(result.state.sides[side].currentEnergy).toBe(5 - paid);
      expect(result.state.instances[source].status.playedViaReclaim).toBe(reclaimed);
    }
    const short = { ...state, sides: { ...state.sides, [side]: { ...state.sides[side], currentEnergy: 4 } } };
    const chosen = engine.apply(short, side, { kind: "play", card: source, from: "void" }, NO_PROMPTS);
    expect(chosen.answers).toContainEqual(expect.objectContaining({ value: 0 }));
    expect(chosen.state.sides[side].currentEnergy).toBe(4);
    expect(chosen.state.instances[source].status.playedViaReclaim).toBe(false);
  });

  it.each(SIDES)("%s keeps granted replacement costs and uses the latest explicit grant", (side) => {
    for (const costs of [[], [energy(5)]] as const) {
      const { engine, state, source, utility } = prepared(side, 3, true, 6, {
        utility: sequence(grantReclaim(everyIn("void"), { costs: [energy(2)] }), grantReclaim(everyIn("void"), { costs }), grantReclaim(everyIn("void"))),
      });
      const granted = resolved(engine, engine.apply(state, side, { kind: "play", card: utility, from: "hand" }, NO_PROMPTS).state);
      const result = engine.apply(granted, side, { kind: "play", card: source, from: "void" }, new ScriptedSource([true]));
      expect(result.state.sides[side].currentEnergy).toBe(costs.length === 0 ? 5 : 0);
      expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
    }
  });

  it.each(SIDES)("%s preserves Offering's additional energy and banishment with a nonzero setter", (side) => {
    const { engine, state, source, fodder } = prepared(side, 0, true, 3, { abilities: [keyword("offering")], set: 2, keepInHand: true });
    const result = engine.apply(state, side, { kind: "play", card: source, from: "hand" }, new ScriptedSource([1, true]));
    expect(result.state.sides[side].currentEnergy).toBe(2);
    expect(result.state.instances[fodder].zone).toBe("banished");
    expect(result.state.instances[source].status.offering).toBe(true);
    expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  });

  it.each(SIDES)("%s preserves Reclaim X bounds, mandatory and optional energy", (side) => {
    const { engine, state, source } = prepared(side, 0, true, 5, {
      displayedCost: 1, costs: [energy(2), energyX(0)], abilities: [reclaim(energy(1), energyX(0)), additionalCost(energy(1))],
    });
    const fold = createFoldAdapter(engine);
    const opened = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side, action: { kind: "play", card: source, from: "void" } }));
    expect(fold.pending(opened)?.prompt).toMatchObject({ kind: "chooseNumber", min: 0, max: 3 });
    const result = engine.apply(state, side, { kind: "play", card: source, from: "void" }, new ScriptedSource([2, true]));
    expect(result.state.sides[side].currentEnergy).toBe(0);
    expect(result.state.instances[source].status.playedViaReclaim).toBe(true);
  });

  it.each(SIDES)("%s pays the selected alternative energy and nonenergy cost", (side) => {
    const { engine, state, source } = prepared(side, 0, false, 2, {
      abilities: [reclaim(energy(1)), additionalCost(choiceCost([energy(3)], [energy(1), pointsCost(1)]))],
    });
    const result = engine.apply(state, side, { kind: "play", card: source, from: "void" }, NO_PROMPTS);
    expect(result.state.sides[side].currentEnergy).toBe(0);
    expect(result.state.sides[side].score).toBe(state.sides[side].score - 1);
    expect(result.state.sides[opponent(side)].score).toBe(state.sides[opponent(side)].score);
  });

  it.each(SIDES)("%s applies taxes, reductions and the floor after replacement costs", (side) => {
    for (const [tax, reduction, paid] of [[3, -1, 7], [1, -8, 0]]) {
      const { engine, state, source, utility } = prepared(side, 5, false, 7, {
        utility: sequence(costModifier("you", { cardType: "character" }, tax), costModifier("you", { cardType: "character" }, reduction)),
      });
      const modified = resolved(engine, engine.apply(state, side, { kind: "play", card: utility, from: "hand" }, NO_PROMPTS).state);
      const result = engine.apply(modified, side, { kind: "play", card: source, from: "void" }, NO_PROMPTS);
      expect(result.state.sides[side].currentEnergy).toBe(7 - paid);
      expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
    }
  });

  it.each(SIDES)("%s cancels, reloads and resumes a route and optional payment exactly once", (side) => {
    const { engine, state, source } = prepared(side, 0, true, 1, { effects: [playFromZone("void", { cardType: "character" })] });
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const opened = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side, action: { kind: "play", card: source, from: "void" } }));
    const pending = fold.pending(opened)!;
    const cancelled = applied(fold.reduce(opened, { kind: "cancel", side, promptId: pending.prompt.id }));
    expect(stateHash(cancelled.committed)).toBe(stateHash(state));
    const saved = JSON.parse(JSON.stringify(opened)) as BattleSlice;
    const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
    expect(fresh.reduce(saved, { kind: "answer", side: opponent(side), promptId: pending.prompt.id, value: 1 })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fresh.reduce(saved, { kind: "answer", side, promptId: pending.prompt.id, value: 8 })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    const routed = applied(fresh.reduce(saved, { kind: "answer", side, promptId: pending.prompt.id, value: 1 }));
    expect(stateHash(routed.committed)).toBe(stateHash(state));
    const optional = fresh.pending(routed)!;
    expect(optional.prompt).toMatchObject({ kind: "confirm", purpose: { role: "optionalCost" } });
    const paid = applied(fresh.reduce(routed, { kind: "answer", side, promptId: optional.prompt.id, value: true }));
    expect(paid.committed.sides[side].currentEnergy).toBe(0);
    expect(paid.committed.instances[source].status.playedViaReclaim).toBe(true);
    expect(fresh.reduce(paid, { kind: "answer", side, promptId: optional.prompt.id, value: true }).kind).toBe("bounced");
    expect(invariantViolations(paid.committed, engine.catalog)).toEqual([]);
  });

  it.each(SIDES)("%s replaces a nonzero own setter with explicit Reclaim", (side) => {
    const { engine, state, source } = prepared(side, 5, false, 7, { set: 2 });
    const action = { kind: "play", card: source, from: "void" } as const;
    const five = { ...state, sides: { ...state.sides, [side]: { ...state.sides[side], currentEnergy: 5 } } };
    const offeredAtFive = engine.legalActions(five, side).some(candidate => candidate.kind === "play" && candidate.card === source && candidate.from === "void");
    const result = engine.apply(state, side, action, NO_PROMPTS);
    expect({ offeredAtFive, energyPaid: 7 - result.state.sides[side].currentEnergy }).toEqual({ offeredAtFive: true, energyPaid: 5 });
    expect(result.state.instances[source].status.playedViaReclaim).toBe(true);
    expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  });

  it.each(SIDES)("%s uses its latest normal setter and keeps increases on both chosen routes", (side) => {
    const { engine, state, source, utility } = prepared(side, 5, false, 11, {
      set: 4, more: 2, effects: [playFromZone("void", { cardType: "character" })],
      utility: sequence(
        modifyCardCost(returnFromVoid(everyIn("void", { cardType: "character" })), { set: 2 }),
        costModifier("you", { cardType: "character" }, 3),
        costModifier("you", { cardType: "character" }, -1),
        discard(1),
      ),
    });
    const modified = resolved(engine, engine.apply(state, side, { kind: "play", card: utility, from: "hand" }, NO_PROMPTS).state);
    expect(engine.view(modified, side).instances[source]?.characteristics.cost).toBe(6);
    expect(modified.instances[source].zone).toBe("void");
    for (const [route, paid, reclaimed] of [[0, 6, false], [1, 9, true]] as const) {
      const result = engine.apply(modified, side, { kind: "play", card: source, from: "void" }, new ScriptedSource([route]));
      expect(result.state.sides[side].currentEnergy).toBe(11 - paid);
      expect(result.state.instances[source].status.playedViaReclaim).toBe(reclaimed);
      expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
    }
    const short = { ...modified, sides: { ...modified.sides, [side]: { ...modified.sides[side], currentEnergy: 8 } } };
    const normal = engine.apply(short, side, { kind: "play", card: source, from: "void" }, NO_PROMPTS);
    expect(normal.state.sides[side].currentEnergy).toBe(2);
    expect(normal.state.instances[source].status.playedViaReclaim).toBe(false);
  });

});
