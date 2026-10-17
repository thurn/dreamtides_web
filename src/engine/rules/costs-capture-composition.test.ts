/** Public payment composition: a shared captured X and distinct prepared occurrences. */
import { expect, it } from "vitest";
import type { EngineCardDefinition } from "../catalog";
import { abandonCost, abandonSparkCapture, activated, additionalCost, characterYouControl, choiceCost, discardCostFilter, energy, energyX, event, optionalCost, target, x } from "../dsl/builders";
import type { AdditionalCost } from "../dsl/types";
import { gainPoints, gainSpark } from "../effects/primitives";
import { createEngine } from "../engine";
import type { EngineEvent } from "../events";
import { createFoldAdapter, type BattleSlice } from "../fold/slice";
import { promptFingerprint } from "../prompts/fingerprint";
import type { Answer } from "../prompts/types";
import { stateHash } from "../state/hash";
import { opponent, SIDES, type Side } from "../state/ids";
import type { BattleState } from "../state/types";
import { ScriptedSource } from "../steps/sources";
import { boardState, type BoardSetup } from "../testing/board";
import { invariantViolations } from "../testing/invariants";
import { eventRedactionViolations, promptRedactionViolations, redactionViolations } from "../testing/redaction";
import { testCatalog } from "../testing/synthetic-cards";
import { promptView, view } from "../view/view";
import type { Action } from "./actions";
import { appliedSlice, deck, fixture, sliceOf, v } from "./costs.fixtures";

const equalCost = { costAtLeast: x(), costAtMost: x() };
const capture = () => discardCostFilter({}, { captureCost: true });
const directCosts = () => [capture(), abandonCost(equalCost)];
const repeatedCosts = () => {
  const same = capture();
  return [same, same];
};
const gainTarget = () => gainSpark(target(characterYouControl(equalCost)), 1);

function definition(index: number, activation: boolean, costs: () => AdditionalCost[], targeted: boolean): EngineCardDefinition {
  const effect = targeted ? gainTarget() : gainPoints(x());
  return {
    ...fixture(index, activation ? "character" : "event", () => activation
      ? [activated([energy(1), ...costs()], effect)]
      : [additionalCost(...costs()), event(effect)]),
    costs: [energy(1)],
  };
}

const cards = [false, true].flatMap(activation => [
  definition(100 + Number(activation), activation, directCosts, false),
  definition(102 + Number(activation), activation, repeatedCosts, true),
]);
const optional = definition(104, false, () => [capture(), optionalCost(energy(1), abandonCost(equalCost))], false);
const alternative = definition(105, true, () => [capture(), choiceCost([abandonCost(equalCost)], [energy(5)])], false);
const stored = definition(106, true, () => [abandonCost(equalCost)], false);
const repeatedSpark = definition(107, true, () => {
  const same = abandonSparkCapture();
  return [same, same];
}, true);
const energyAgreement = { ...definition(108, false, repeatedCosts, true), costs: [energyX(0)] };
const countAgreement = definition(109, false, () => [...repeatedCosts(), discardCostFilter({}, { count: "x" })], true);
const engine = createEngine(testCatalog([...cards, optional, alternative, stored, repeatedSpark, energyAgreement, countAgreement]));

/** Explicit interactive configuration keeps every payment decision observable. */
function board(setup: BoardSetup) {
  const { state, ids } = boardState(engine.catalog, setup);
  return { state: { ...state, config: { ...state.config, autoAnswerForcedPrompts: false } }, ids };
}

/** Every answer is exercised through cold reload, cancellation and concealed projections before committing. */
function through(state: BattleState, side: Side, action: Action, answers: readonly Answer[]) {
  const scripted = new ScriptedSource(answers);
  const inline = engine.apply(state, side, action, scripted);
  scripted.assertExhausted();
  let fold = createFoldAdapter(createEngine(engine.catalog), { checkEventPrefix: true });
  const opened = fold.reduce(sliceOf(state), { kind: "battleAction", side, action });
  let slice = appliedSlice(opened);
  const events: EngineEvent[] = opened.kind === "applied" ? [...opened.published] : [];
  for (const [index, value] of answers.entries()) {
    const pending = fold.pending(slice)!;
    const { prompt, display } = pending;
    expect(prompt.cancellable).toBe(true);
    expect(events).toEqual([]);
    expect(stateHash(slice.committed)).toBe(stateHash(state));
    expect(promptRedactionViolations(prompt, display, engine.catalog)).toEqual([]);
    for (const hidden of state.sides[side].hand) {
      expect(view(display, opponent(side), engine.catalog).instances[hidden]).toBeUndefined();
      expect(JSON.stringify(promptView(prompt, opponent(side), display))).not.toContain(`"${hidden}"`);
    }
    const { id: _id, ...surface } = prompt;
    expect(promptFingerprint(surface)).toBe(inline.answers[index].fingerprint);
    slice = JSON.parse(JSON.stringify(slice)) as BattleSlice;
    fold = createFoldAdapter(createEngine(engine.catalog), { checkEventPrefix: true });
    expect(fold.pending(slice)?.prompt).toEqual(prompt);
    expect(fold.reduce(slice, { kind: "answer", side: opponent(side), promptId: prompt.id, value })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fold.reduce(slice, { kind: "answer", side, promptId: prompt.id, value: [] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    const cancelled = fold.reduce(slice, { kind: "cancel", side, promptId: prompt.id });
    expect(stateHash(appliedSlice(cancelled).committed)).toBe(stateHash(state));
    expect(cancelled).toMatchObject({ published: [] });
    const outcome = fold.reduce(slice, { kind: "answer", side, promptId: prompt.id, value });
    slice = appliedSlice(outcome);
    if (outcome.kind === "applied") events.push(...outcome.published);
  }
  expect(slice.inFlight).toBeNull();
  expect(events).toEqual(inline.events);
  expect(stateHash(slice.committed)).toBe(stateHash(inline.state));
  expect(invariantViolations(slice.committed, engine.catalog)).toEqual([]);
  expect(eventRedactionViolations(events, state, slice.committed)).toEqual([]);
  expect(redactionViolations(slice.committed, engine.catalog)).toEqual([]);
  return { state: slice.committed, events };
}

for (const side of SIDES) for (const activation of [false, true]) {
  it(`propagates a captured X to a later direct payment for ${side} ${activation ? "activation" : "play"}`, () => {
    const card = cards[Number(activation) * 2];
    const { state, ids } = board({
      active: side, phase: "day",
      [side]: { deck, hand: [...(activation ? [] : [card.id]), v.vanilla2.id], back: [...(activation ? [card.id] : []), v.vanilla2.id], energy: 3 },
      [opponent(side)]: { deck, hand: [v.interruptEvent.id], energy: 5 },
    });
    const source = activation ? ids[side].back[0]! : ids[side].hand[0];
    const discarded = ids[side].hand[activation ? 0 : 1];
    const abandoned = ids[side].back[activation ? 1 : 0]!;
    if (activation) state.instances[source].status.x = 1;
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const action = activation ? { kind: "activate", source, ability: 0 } as const : { kind: "play", card: source, from: "hand" } as const;
    const opened = appliedSlice(fold.reduce(sliceOf(state), { kind: "battleAction", side, action }));
    const first = fold.pending(opened)!.prompt;
    expect(first).toMatchObject({ kind: "chooseCards", candidates: [discarded] });
    const chosen = appliedSlice(fold.reduce(opened, { kind: "answer", side, promptId: first.id, value: [discarded] }));
    const second = fold.pending(chosen)!.prompt;
    expect(second).toMatchObject({ kind: "chooseCards", candidates: [abandoned] });
    expect(stateHash(chosen.committed)).toBe(stateHash(state));
    const paid = appliedSlice(fold.reduce(chosen, { kind: "answer", side, promptId: second.id, value: [abandoned] }));
    expect(paid.committed.stack[0]?.x).toBe(2);
    expect(paid.committed.sides[side].currentEnergy).toBe(2);
    expect(new Set(paid.committed.sides[side].void)).toEqual(new Set([discarded, abandoned]));
    const replayed = through(state, side, action, [[discarded], [abandoned]]);
    expect(replayed.events.filter(e => e.kind === "discarded" || e.kind === "abandoned")).toEqual([
      { kind: "discarded", side, instance: discarded }, { kind: "abandoned", side, instance: abandoned },
    ]);
    const resolved = engine.apply(replayed.state, opponent(side), { kind: "pass" }, new ScriptedSource([]));
    expect(resolved.state.sides[side].score).toBe(2);
    if (activation) expect(replayed.state.instances[source].status.x).toBe(1);
  });

  it(`prepares reused capture descriptors by occurrence for ${side} ${activation ? "activation" : "play"}`, () => {
    const card = cards[Number(activation) * 2 + 1];
    const { state, ids } = board({
      active: side, phase: "day",
      [side]: { deck, hand: [...(activation ? [] : [card.id]), v.vanilla2.id, v.vanilla2.id], back: [...(activation ? [card.id] : []), v.vanilla2.id], energy: 3 },
      [opponent(side)]: { deck, hand: [v.interruptEvent.id], energy: 5 },
    });
    const source = activation ? ids[side].back[0]! : ids[side].hand[0];
    const payments = ids[side].hand.slice(activation ? 0 : 1);
    const targetCard = ids[side].back[activation ? 1 : 0]!;
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const action = activation ? { kind: "activate", source, ability: 0 } as const : { kind: "play", card: source, from: "hand" } as const;
    let slice = appliedSlice(fold.reduce(sliceOf(state), { kind: "battleAction", side, action }));
    for (const payment of payments) {
      const prompt = fold.pending(slice)!.prompt;
      expect(prompt.kind).toBe("chooseCards");
      slice = appliedSlice(fold.reduce(slice, { kind: "answer", side, promptId: prompt.id, value: [payment] }));
    }
    const prompt = fold.pending(slice)!.prompt;
    expect(prompt).toMatchObject({ kind: "chooseTargets", candidates: [targetCard] });
    expect(stateHash(slice.committed)).toBe(stateHash(state));
    const paid = appliedSlice(fold.reduce(slice, { kind: "answer", side, promptId: prompt.id, value: [targetCard] }));
    expect(paid.committed.stack[0]?.x).toBe(2);
    expect(new Set(paid.committed.sides[side].void)).toEqual(new Set(payments));
    expect(paid.committed.instances[targetCard].zone).toBe("play");
    expect(paid.committed.sides[side].currentEnergy).toBe(2);
    const replayed = through(state, side, action, [...payments.map(id => [id]), [targetCard]]);
    expect(replayed.events.filter(e => e.kind === "discarded")).toEqual(payments.map(instance => ({ kind: "discarded", side, instance })));
    const resolved = engine.apply(replayed.state, opponent(side), { kind: "pass" }, new ScriptedSource([]));
    expect(view(resolved.state, side, engine.catalog).instances[targetCard].characteristics.spark).toBe(3);
  });
}

for (const side of SIDES) {
  it(`uses captured X for nested optional affordability and payments for ${side}`, () => {
    for (const pays of [true, false]) {
      const { state, ids } = board({
        active: side, phase: "day",
        [side]: { deck, hand: [optional.id, v.vanilla2.id], back: [v.vanilla0.id, v.vanilla2.id], energy: 3 },
        [opponent(side)]: { deck, hand: [v.interruptEvent.id], energy: 5 },
      });
      const source = ids[side].hand[0];
      const payment = ids[side].back[1]!;
      const paid = through(state, side, { kind: "play", card: source, from: "hand" }, [[ids[side].hand[1]], pays, ...(pays ? [[payment]] : [])]);
      expect(paid.state.stack[0]).toMatchObject({ x: 2, optionalPaid: [pays] });
      expect(paid.state.sides[side].currentEnergy).toBe(pays ? 1 : 2);
      expect(paid.state.instances[payment].zone).toBe(pays ? "void" : "play");
      expect(paid.state.instances[ids[side].back[0]!].zone).toBe("play");
    }
  });

  it(`withholds a nested optional payment that cannot match captured X for ${side}`, () => {
    const { state, ids } = board({
      active: side, phase: "day",
      [side]: { deck, hand: [optional.id, v.vanilla2.id], back: [v.vanilla0.id], energy: 3 },
      [opponent(side)]: { deck, hand: [v.interruptEvent.id], energy: 5 },
    });
    const paid = through(state, side, { kind: "play", card: ids[side].hand[0], from: "hand" }, [[ids[side].hand[1]]]);
    expect(paid.state.stack[0]).toMatchObject({ x: 2, optionalPaid: [false] });
    expect(paid.state.sides[side].currentEnergy).toBe(2);
    expect(paid.state.instances[ids[side].back[0]!].zone).toBe("play");
  });

  it(`uses captured X over stored source X for nested alternatives for ${side}`, () => {
    const { state, ids } = board({
      active: side, phase: "day",
      [side]: { deck, hand: [v.vanilla2.id], back: [alternative.id, v.vanilla2.id], energy: 3 },
      [opponent(side)]: { deck, hand: [v.interruptEvent.id], energy: 5 },
    });
    const source = ids[side].back[0]!;
    state.instances[source].status.x = 1;
    const paid = through(state, side, { kind: "activate", source, ability: 0 }, [[ids[side].hand[0]], 0, [ids[side].back[1]!]]);
    expect(paid.state.stack[0]?.x).toBe(2);
    expect(paid.state.instances[source].status.x).toBe(1);
    expect(new Set(paid.state.sides[side].void)).toEqual(new Set([ids[side].hand[0], ids[side].back[1]]));
    expect(paid.state.sides[side].currentEnergy).toBe(2);
  });

  it(`retains stored source X for selectors when costs bind none for ${side}`, () => {
    const { state, ids } = board({
      active: side, phase: "day",
      [side]: { deck, back: [stored.id, v.vanilla1.id, v.vanilla2.id], energy: 3 },
      [opponent(side)]: { deck, hand: [v.interruptEvent.id], energy: 5 },
    });
    const source = ids[side].back[0]!;
    state.instances[source].status.x = 2;
    const paid = through(state, side, { kind: "activate", source, ability: 0 }, [[ids[side].back[2]!]]);
    expect(paid.state.stack[0]?.x).toBeNull();
    expect(paid.state.instances[source].status.x).toBe(2);
    expect(paid.state.instances[ids[side].back[1]!].zone).toBe("play");
    expect(paid.state.instances[ids[side].back[2]!].zone).toBe("void");
  });

  it(`reserves repeated effective-spark captures separately from the target for ${side}`, () => {
    for (const gained of [false, true]) {
      const { state, ids } = board({
        active: side, phase: "day",
        [side]: { deck, back: [repeatedSpark.id, gained ? v.vanilla1.id : v.vanilla2.id, gained ? v.vanilla1.id : v.vanilla2.id, v.vanilla2.id], energy: 3 },
        [opponent(side)]: { deck, hand: [v.interruptEvent.id], energy: 5 },
      });
      const [source, first, second, targetCard] = ids[side].back;
      state.instances[first!].status.gainedSpark = gained ? 1 : 0;
      state.instances[second!].status.gainedSpark = gained ? 1 : 0;
      const fold = createFoldAdapter(engine);
      let slice = appliedSlice(fold.reduce(sliceOf(state), { kind: "battleAction", side, action: { kind: "activate", source: source!, ability: 0 } }));
      for (const payment of [first!, second!]) {
        const prompt = fold.pending(slice)!.prompt;
        slice = appliedSlice(fold.reduce(slice, { kind: "answer", side, promptId: prompt.id, value: [payment] }));
      }
      const targetPrompt = fold.pending(slice)!.prompt;
      expect(targetPrompt).toMatchObject({ kind: "chooseTargets", candidates: [targetCard] });
      expect(fold.reduce(slice, { kind: "answer", side, promptId: targetPrompt.id, value: [first!] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
      expect(stateHash(slice.committed)).toBe(stateHash(state));
      const paid = through(state, side, { kind: "activate", source: source!, ability: 0 }, [[first!], [second!], [targetCard!]]);
      expect(paid.state.stack[0]).toMatchObject({ x: 2, choices: { targets: [[targetCard]] } });
      expect(paid.events.filter(e => e.kind === "abandoned")).toEqual([first, second].map(instance => ({ kind: "abandoned", side, instance })));
      expect(paid.state.instances[targetCard!].zone).toBe("play");
      expect(paid.state.sides[side].currentEnergy).toBe(2);
    }
  });

  it(`requires repeated copiable-cost captures to agree with energy X for ${side}`, () => {
    const { state, ids } = board({
      active: side, phase: "day",
      [side]: { deck, hand: [energyAgreement.id, v.vanilla1.id, v.vanilla2.id, v.vanilla2.id], back: [v.vanilla2.id], energy: 3 },
      [opponent(side)]: { deck, hand: [v.interruptEvent.id], energy: 5 },
    });
    const paid = through(state, side, { kind: "play", card: ids[side].hand[0], from: "hand" }, [2, [ids[side].hand[2]], [ids[side].hand[3]], [ids[side].back[0]!]]);
    expect(paid.state.stack[0]?.x).toBe(2);
    expect(paid.state.sides[side].currentEnergy).toBe(1);
    expect(paid.state.sides[side].hand).toEqual([ids[side].hand[1]]);
  });

  it(`shares captured X with a subsequent count while reserving distinct cards for ${side}`, () => {
    const { state, ids } = board({
      active: side, phase: "day",
      [side]: { deck, hand: [countAgreement.id, v.vanilla2.id, v.vanilla2.id, v.vanilla1.id, v.vanilla1.id], back: [v.vanilla2.id], energy: 3 },
      [opponent(side)]: { deck, hand: [v.interruptEvent.id], energy: 5 },
    });
    const paid = through(state, side, { kind: "play", card: ids[side].hand[0], from: "hand" }, [[ids[side].hand[1]], [ids[side].hand[2]], [ids[side].back[0]!], ids[side].hand.slice(3)]);
    expect(paid.state.stack[0]?.x).toBe(2);
    expect(paid.events.filter(e => e.kind === "discarded")).toEqual(ids[side].hand.slice(1).map(instance => ({ kind: "discarded", side, instance })));
    expect(paid.state.sides[side].currentEnergy).toBe(2);
  });

  it(`rejects conflicting repeated captures before making any payment for ${side}`, () => {
    const { state, ids } = board({
      active: side, phase: "day",
      [side]: { deck, hand: [cards[1].id, v.vanilla1.id, v.vanilla2.id], back: [v.vanilla1.id, v.vanilla2.id], energy: 3 },
      [opponent(side)]: { deck, hand: [v.interruptEvent.id], energy: 5 },
    });
    const before = stateHash(state);
    expect(createFoldAdapter(engine).reduce(sliceOf(state), { kind: "battleAction", side, action: { kind: "play", card: ids[side].hand[0], from: "hand" } })).toEqual({ kind: "bounced", reason: "illegalAction" });
    expect(stateHash(state)).toBe(before);
    expect(state.sides[side].void).toEqual([]);
    expect(state.sides[side].currentEnergy).toBe(3);
  });
}
