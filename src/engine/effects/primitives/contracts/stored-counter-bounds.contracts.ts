/** Source-counter bounds use the same live and own-payment reads as numeric values. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { abandonSelfCost, activated, all, controls, costExactly, count, countersCost, enemyCharacter, energy, event, everyIn, fromVoid, randomCharacter, returnCost, storedCounters, stackItem, supported, target, targetWhen } from "../../../dsl/builders";
import type { CharacterSelector, Cost } from "../../../dsl/types";
import { whenYouPlay } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import type { EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { Answer, Prompt } from "../../../prompts/types";
import { stateHash, serializeState, deserializeState } from "../../../state/hash";
import { opponent, SIDES, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { runStep } from "../../../steps/runner";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import type { AnswerSource } from "../../../steps/types";
import { boardState } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { unannouncedChanges } from "../../../testing/announced-changes";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import type { ResolvingEffect } from "../../registry";
import { abandon } from "../abandon";
import { chooseOne } from "../choose-one";
import { dissolve } from "../dissolve";
import { delayed } from "../floating-trigger";
import { gainPoints } from "../gain-points";
import { gainSpark } from "../gain-spark";
import { ifThen } from "../if-then";
import { materialize } from "../materialize";
import { prevent } from "../prevent";
import { payTo } from "../pay-to";
import { returnToHand } from "../return-to-hand";
import { sequence } from "../sequence";
import { storeCounters } from "../store-counters";

const deck = Array.from({ length: 8 }, () => v.vanilla1.id);
const response: EngineCardDefinition = { ...v.interruptEvent, id: syntheticId(0x693ff), costs: [energy(0)], status: "authored",
  abilities: () => [event(returnToHand(target(enemyCharacter())))] };
const reenter: EngineCardDefinition = { ...response, id: syntheticId(0x693fe),
  abilities: () => [event(materialize(everyIn("void", {}, { player: "opponent" })))] };
const below = () => enemyCharacter({ costAtMost: storedCounters() });
function fixture(side: Side, effect: ResolvingEffect, costs: readonly Cost[] = [], counters = 2, responseCard = response, interrupt = false) {
  const card: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x69300), status: "authored", abilities: () => [activated(costs, effect, { speed: interrupt ? "interrupt" : "standard" })] };
  const engine = createEngine(testCatalog([card, responseCard]));
  const other = opponent(side);
  const { state: placed, ids } = boardState(engine.catalog, { active: side, phase: "day", scoreToWin: 100,
    [side]: { back: [card.id, card.id, v.vanilla1.id], hand: [v.event1.id], energy: 5, deck },
    [other]: { back: [v.vanilla0.id, v.vanilla1.id, v.vanilla2.id, v.vanilla3.id], void: [v.vanilla0.id, v.vanilla1.id, v.vanilla2.id, v.vanilla3.id], hand: [responseCard.id], energy: 5, deck },
  });
  const state = { ...placed, config: { ...placed.config, autoAnswerForcedPrompts: false } };
  const source = ids[side].back[0]!;
  state.instances[source].status.counters = counters;
  state.instances[ids[side].back[1]!].status.counters = 3;
  const action = { kind: "activate", source, ability: 0 } as const;
  return { card, engine, state, ids, source, side, other, action };
}
class Answers implements AnswerSource {
  readonly prompts: Prompt[] = [];
  private next = 0;
  constructor(private readonly values: readonly Answer[]) {}
  answer(prompt: Prompt): Answer {
    this.prompts.push(prompt);
    const answer = this.values[this.next++];
    if (answer === undefined) throw new Error(`missing ${prompt.purpose.role} answer`);
    return answer;
  }
}
const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`unexpected ${JSON.stringify(outcome)}`);
  return outcome.slice;
}
function activate(f: ReturnType<typeof fixture>, answers: readonly Answer[] = []) {
  return f.engine.apply(f.state, f.side, f.action, new ScriptedSource(answers));
}
function resolve(f: ReturnType<typeof fixture>, state: BattleState, answers: AnswerSource = NO_PROMPTS) {
  const result = f.engine.apply(state, f.other, { kind: "pass" }, answers);
  expect(invariantViolations(result.state, f.engine.catalog)).toEqual([]);
  expect(unannouncedChanges(result.events, state, result.state)).toEqual([]);
  return result;
}
const zones = (f: ReturnType<typeof fixture>, state: BattleState) => f.ids[f.other].back.map(id => state.instances[id!].zone);

describe.each(SIDES)("stored-counter selector bounds controlled by %s", side => {
  it.each(["costAtMost", "costAtLeast", "sparkAtMost", "sparkAtLeast"] as const)("compares the typed inclusive $0 boundary and meaningful zero", field => {
    for (const counters of [0, 2]) {
      const selector: CharacterSelector = enemyCharacter({ [field]: storedCounters() });
      const f = fixture(side, dissolve(all(selector)), [], counters);
      const result = resolve(f, activate(f).state);
      const threshold = field.endsWith("Most") ? (value: number) => value <= counters : (value: number) => value >= counters;
      expect(zones(f, result.state)).toEqual([0, 1, 2, 3].map(value => threshold(value) ? "void" : "play"));
      expect(result.state.instances[f.ids[side].back[1]!].status.counters).toBe(3);
    }
  });

  it("reads the source after preceding instructions and counts the same live bound", () => {
    const f = fixture(side, sequence(storeCounters(1), gainPoints(count(below())), dissolve(all(below()))), [], 1);
    const result = resolve(f, activate(f).state);
    expect(result.state.sides[side].score).toBe(3);
    expect(zones(f, result.state)).toEqual(["void", "void", "void", "play"]);
    expect(result.state.instances[f.source].status.counters).toBe(2);
  });

  it("uses independent counts for two physical copies of one source definition", () => {
    const f = fixture(side, gainPoints(count(below())), [], 1);
    const first = resolve(f, activate(f).state);
    const second = f.engine.apply(first.state, side, { ...f.action, source: f.ids[side].back[1]! }, NO_PROMPTS);
    expect(resolve(f, second.state).state.sides[side].score).toBe(6);
  });

  it.each(["ordinary", "created", "return"] as const)("retains the count after earlier payment before %s source departure", departure => {
    const costs = [countersCost(1), departure === "return" ? returnCost({ another: false }) : abandonSelfCost()];
    const f = fixture(side, dissolve(all(below())), costs, 3);
    if (departure === "created") f.state.instances[f.source].status.created = true;
    const paid = activate(f, [[f.source]]);
    expect(paid.state.stack[0]).toMatchObject({ paymentSourceCounters: 2 });
    if (departure === "created") expect(paid.state.instances[f.source]).toBeUndefined();
    const reload = deserializeState(serializeState(paid.state));
    expect(stateHash(reload)).toBe(stateHash(paid.state));
    expect(zones(f, resolve(f, reload).state)).toEqual(["void", "void", "void", "play"]);
  });

  it("checks chosen targets against the live count after payment, without replacing the target", () => {
    const f = fixture(side, sequence(dissolve(target(below())), gainPoints(1)), [countersCost(1)], 2);
    const answers = new Answers([[f.ids[f.other].back[2]!]]);
    const paid = f.engine.apply(f.state, side, f.action, answers);
    expect(answers.prompts[0]).toMatchObject({ candidates: f.ids[f.other].back.slice(0, 3) });
    const result = resolve(f, paid.state);
    expect(zones(f, result.state)).toEqual(["play", "play", "play", "play"]);
    expect(result.events).toContainEqual({ kind: "noLegalTarget", source: f.source });
    expect(result.state.sides[side].score).toBe(1);
  });

  it("rechecks an ordinary chosen target using its own removal-payment snapshot", () => {
    const f = fixture(side, dissolve(target(below())), [countersCost(1), abandonSelfCost()], 3);
    const paid = activate(f, [[f.ids[f.other].back[2]!], [f.source]]);
    expect(resolve(f, paid.state).state.instances[f.ids[f.other].back[2]!].zone).toBe("void");
  });

  it("reads cleared zero after an opponent response without creating counter history", () => {
    const f = fixture(side, dissolve(all(below())));
    const paid = activate(f);
    expect(paid.state.stack[0]).not.toHaveProperty("paymentSourceCounters");
    const responseState = f.engine.apply(paid.state, f.other, { kind: "play", card: f.ids[f.other].hand[0], from: "hand" }, new ScriptedSource([[f.source]]));
    const result = f.engine.apply(responseState.state, side, { kind: "pass" }, NO_PROMPTS);
    expect(result.state.instances[f.source]).toMatchObject({ zone: "hand", status: { counters: 0 } });
    expect(zones(f, result.state)).toEqual(["void", "play", "play", "play"]);
  });

  it("uses a reentered source's live zero ahead of its retained payment count", () => {
    const f = fixture(side, dissolve(all(below())), [abandonSelfCost()], 2, reenter);
    const paid = activate(f, [[f.source]]);
    const responding = f.engine.apply(paid.state, f.other, { kind: "play", card: f.ids[f.other].hand[0], from: "hand" }, NO_PROMPTS);
    const result = f.engine.apply(responding.state, side, { kind: "pass" }, NO_PROMPTS);
    expect(result.state.instances[f.source]).toMatchObject({ zone: "play", controller: f.other, status: { counters: 0 } });
    expect(zones(f, result.state)).toEqual(["void", "play", "play", "play"]);
  });

  it("forwards the same snapshot through condition counts and conditional target predicates", () => {
    const conditional = targetWhen(controls(below(), 3), below(), enemyCharacter({ costAtMost: 0 }));
    const f = fixture(side, sequence(ifThen(controls(below(), 3), gainPoints(1)), dissolve(conditional)), [abandonSelfCost()]);
    const paid = activate(f, [[f.ids[f.other].back[2]!], [f.source]]);
    const result = resolve(f, paid.state);
    expect(result.state.sides[side].score).toBe(1);
    expect(result.state.instances[f.ids[f.other].back[2]!].zone).toBe("void");
  });

  it("starts a newly scheduled delayed trigger with no inherited payment-counter snapshot", () => {
    const f = fixture(side, delayed(whenYouPlay({ cardType: "event" }), gainPoints(count(below()))), [abandonSelfCost()]);
    const paid = activate(f, [[f.source]]);
    expect(paid.state.stack[0]).toMatchObject({ paymentSourceCounters: 2 });
    const waiting = resolve(f, paid.state).state;
    expect(waiting.floating[0].change).not.toHaveProperty("paymentSourceCounters");
    const triggering = f.engine.apply(waiting, side, { kind: "play", card: f.ids[side].hand[0], from: "hand" }, NO_PROMPTS);
    expect(triggering.state.sides[side].score).toBe(1);
    expect(triggering.state.instances[f.source].zone).toBe("void");
  });

  it("offers deferred modes and targets from the same activation's snapshot", () => {
    const body = chooseOne(dissolve(target(enemyCharacter(costExactly(storedCounters())))), dissolve(target(enemyCharacter({ costAtLeast: 5 }))));
    const f = fixture(side, payTo({}, body), [abandonSelfCost()]);
    const paid = activate(f, [[f.source]]);
    const answers = new Answers([true, 0, [f.ids[f.other].back[2]!]]);
    const result = resolve(f, paid.state, answers);
    expect(answers.prompts.map(prompt => prompt.purpose.role)).toEqual(["optionalCost", "chooseOne", "target"]);
    expect(answers.prompts[1]).toMatchObject({ options: [{ mode: 0, legal: true }, { mode: 1, legal: false }] });
    expect(result.state.instances[f.ids[f.other].back[2]!].zone).toBe("void");
  });

  it("rechecks void target bounds with the same removal-payment snapshot", () => {
    const f = fixture(side, materialize(fromVoid({}, { player: "opponent", costAtMost: storedCounters() })), [abandonSelfCost()]);
    const card = f.ids[f.other].void[2];
    const paid = activate(f, [[card], [f.source]]);
    expect(resolve(f, paid.state).state.instances[card].zone).toBe("play");
  });

  it("forwards the snapshot into the opponent's non-targeting prevent payment", () => {
    const plain: EngineCardDefinition = { ...response, abilities: () => [] };
    const f = fixture(side, prevent(stackItem({ controller: "opponent" }), { unlessAbandons: costExactly(storedCounters()) }), [abandonSelfCost()], 2, plain, true);
    const opening = f.engine.apply(f.state, side, { kind: "play", card: f.ids[side].hand[0], from: "hand" }, NO_PROMPTS);
    const answering = f.engine.apply(opening.state, f.other, { kind: "play", card: f.ids[f.other].hand[0], from: "hand" }, NO_PROMPTS);
    const answers = new Answers([[f.ids[f.other].hand[0]], [f.source], true, [f.ids[f.other].back[2]!]]);
    const result = f.engine.apply(answering.state, side, f.action, answers);
    expect(answers.prompts.map(prompt => prompt.purpose.role)).toEqual(["target", "abandonCost", "preventUnlessAbandons", "abandon"]);
    expect(answers.prompts[3]).toMatchObject({ candidates: [f.ids[f.other].back[2]] });
    expect(result.state.instances[f.ids[f.other].back[2]!].zone).toBe("void");
    expect(result.events.filter(event => event.kind === "prevented")).toEqual([]);
  });

  it("bounds a non-targeting random choice and a resolving abandonment by the snapshot", () => {
    const f = fixture(side, sequence(dissolve(randomCharacter(enemyCharacter(costExactly(storedCounters())))), abandon("opponent", { costAtMost: storedCounters() })), [abandonSelfCost()]);
    const paid = activate(f, [[f.source]]);
    const answers = new Answers([[f.ids[f.other].back[1]!]]);
    const result = resolve(f, paid.state, answers);
    expect(answers.prompts[0]).toMatchObject({ candidates: f.ids[f.other].back.slice(0, 2) });
    expect(zones(f, result.state)).toEqual(["play", "void", "void", "play"]);
    expect(result.state.rng["random:selection"]).toBe(1);
  });
});

describe("stored-counter bound interruption and recovery", () => {
  it("uses live stored counters to bound actual supported characters", () => {
    const card: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x69301), status: "authored", abilities: () => [activated([], gainSpark(supported({ costAtMost: storedCounters() }), 1))] };
    const engine = createEngine(testCatalog([card]));
    const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { back: [null, card.id], front: [v.vanilla1.id, v.vanilla3.id], deck }, enemy: { hand: [v.interruptEvent.id], energy: 1, deck } });
    const source = ids.player.back[1]!;
    state.instances[source].status.counters = 1;
    const paid = engine.apply(state, "player", { kind: "activate", source, ability: 0 }, NO_PROMPTS);
    const done = engine.apply(paid.state, "enemy", { kind: "pass" }, NO_PROMPTS);
    expect(done.state.instances[ids.player.front[0]!].status.gainedSpark).toBe(1);
    expect(done.state.instances[ids.player.front[1]!].status.gainedSpark).toBe(0);
  });

  it("reloads a postcommit deferred target and refuses invalid, stale, foreign and concurrent answers", () => {
    const f = fixture("player", payTo({}, dissolve(target(enemyCharacter(costExactly(storedCounters()))))), [abandonSelfCost()]);
    const paid = activate(f, [[f.source]]).state;
    const adapter = createFoldAdapter(f.engine, { checkEventPrefix: true });
    const open = applied(adapter.reduce(slice(paid), { kind: "battleAction", side: "enemy", action: { kind: "pass" } }));
    const accepted = applied(adapter.reduce(open, { kind: "answer", side: "player", promptId: adapter.pending(open)!.prompt.id, value: true }));
    const cold = createFoldAdapter(createEngine(f.engine.catalog), { checkEventPrefix: true });
    const reload = JSON.parse(JSON.stringify(accepted)) as BattleSlice;
    const prompt = cold.pending(reload)!.prompt;
    expect(prompt).toMatchObject({ kind: "chooseTargets", candidates: [f.ids.enemy.back[2]], cancellable: false });
    const answer = (value: Answer, side: Side = "player") => cold.reduce(reload, { kind: "answer", side, promptId: prompt.id, value });
    expect(answer([f.ids.enemy.back[3]!])).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(answer([f.ids.enemy.back[2]!], "enemy")).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(cold.reduce(reload, { kind: "battleAction", side: "player", action: f.action })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(cold.reduce(reload, { kind: "cancel", side: "player", promptId: prompt.id }).kind).toBe("bounced");
    const prior = adapter.pending(open)!.prompt.id;
    expect(cold.reduce(reload, { kind: "answer", side: "player", promptId: prior, value: true })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    const done = applied(answer([f.ids.enemy.back[2]!]));
    expect(done.committed.instances[f.ids.enemy.back[2]!].zone).toBe("void");
    expect(done.committed.stack).toEqual([]);
    expect(cold.reduce(done, { kind: "answer", side: "player", promptId: prompt.id, value: [f.ids.enemy.back[2]!] })).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
  });

  it("rolls back a successful bound-driven removal prefix when a later instruction fails", () => {
    const f = fixture("player", sequence(dissolve(all(below())), storeCounters(-1)));
    const paid = activate(f).state;
    const before = stateHash(paid);
    const observed: EngineEvent[] = [];
    expect(() => runStep(paid, { kind: "resolveTop" }, NO_PROMPTS, f.engine.catalog, { observeEvent: event => observed.push(event) })).toThrow();
    expect(observed.filter(event => event.kind === "dissolved").map(event => event.instance)).toEqual(f.ids.enemy.back.slice(0, 3));
    expect(stateHash(paid)).toBe(before);
    const outcome = createFoldAdapter(f.engine).reduce(slice(paid), { kind: "battleAction", side: "enemy", action: { kind: "pass" } });
    if (outcome.kind !== "applied") throw new Error("expected failed resolution");
    expect(outcome.error).not.toBeNull();
    expect(outcome.published).toEqual([]);
    expect(stateHash(outcome.slice.committed)).toBe(before);
  });
});
