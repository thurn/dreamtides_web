/** Independent counted stack copies through public steps and replay-suspended intents. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { additionalCost, anyCharacter, costPaid, energy, energyX, enemyCharacter, event, optionalCost, self, stackItem, target, targetWhen, x } from "../../../dsl/builders";
import { onMaterialized, triggered, triggeringCard, whenYouPlay } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import { eventSeenBy, type EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { Answer, Prompt } from "../../../prompts/types";
import type { Action } from "../../../rules/actions";
import { cloneState } from "../../../state/clone";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { battleSeed, opponent, SIDES, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { runStep } from "../../../steps/runner";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import type { StepResult } from "../../../steps/types";
import { boardState, type SideSetup } from "../../../testing/board";
import { determinizationDivergences } from "../../../testing/determinization-fidelity";
import { invariantViolations } from "../../../testing/invariants";
import { eventRedactionViolations } from "../../../testing/redaction";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { at, passUntil } from "../../../testing/trigger-harness";
import { chooseOne } from "../choose-one";
import { banish } from "../banish";
import { copyCardTimes, type CopyCardTimesNode } from "../copy-card";
import { delayed } from "../floating-trigger";
import { gainPoints } from "../gain-points";
import { gainSpark } from "../gain-spark";
import { prevent } from "../prevent";
import { sequence } from "../sequence";
import { decklists } from "./with-materialized-support";

const deck = Array.from({ length: 8 }, () => v.vanilla1.id);
function card(index: number, abilities: EngineCardDefinition["abilities"], extra: Partial<EngineCardDefinition> = {}): EngineCardDefinition {
  return { ...v.event0, id: syntheticId(0x99000 + index), status: "authored", abilities, ...extra };
}
const stackRef = { kind: "stackTarget", selector: stackItem({}) } as const;
const counted = (times: number, index = times) => card(index, () => [triggered(whenYouPlay(), copyCardTimes(triggeringCard(), times))], { cardType: "character", spark: 1, costs: [energy(4)] });
const delayedCount = card(10, () => [event(delayed(whenYouPlay({ cardType: "event", costAtMost: 2 }), copyCardTimes(triggeringCard(), 2), "untilEndOfTurn"))]);
const materializer = card(11, () => [triggered(onMaterialized(), delayed(whenYouPlay({ cardType: "event", costAtMost: 2 }), copyCardTimes(triggeringCard(), 2), "untilEndOfTurn"))], { cardType: "character", spark: 1 });
const modal = card(12, () => [event(chooseOne(gainSpark(target(anyCharacter()), 1), gainPoints(2)))]);
const paid = card(13, () => [additionalCost(optionalCost(energy(1))), event(gainSpark(targetWhen(costPaid(0), anyCharacter({ costAtMost: x() }), anyCharacter({ costAtMost: 0 })), 1))], { costs: [energyX()] });
const points = card(14, () => [event(gainPoints(1))]);
const high = card(15, () => [event(gainPoints(1))], { costs: [energy(3)] });
const mirror = card(16, () => [event(copyCardTimes(stackRef, 2))], { speed: "interrupt" });
const prevention = card(17, () => [event(prevent(stackItem({})))], { speed: "interrupt" });
const fallback = card(18, () => [event(gainSpark(target(anyCharacter()), 1))]);
const missing = card(19, () => [event(copyCardTimes(triggeringCard(), 2))]);
function fixture(side: Side, definitions: readonly EngineCardDefinition[], mine: SideSetup = {}, theirs: SideSetup = {}) {
  const engine = createEngine(testCatalog(definitions));
  const setup = boardState(engine.catalog, { active: side, phase: "day", [side]: { deck, energy: 10, ...mine }, [opponent(side)]: { deck, hand: [v.interruptEvent.id], energy: 1, ...theirs } });
  return { engine, ...setup, side, other: opponent(side) };
}
function play(id: InstanceId, from: "hand" | "void" = "hand"): Action { return { kind: "play", card: id, from }; }
function physical(id: InstanceId | null | undefined): InstanceId {
  if (id === null || id === undefined) throw new Error("Expected occupied synthetic slot");
  return id;
}
function copies(events: readonly EngineEvent[]): InstanceId[] { return events.flatMap(e => e.kind === "cardCopied" ? [e.copy] : []); }
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("Expected applied intent");
  return outcome.slice;
}
function done(result: StepResult) {
  if (result.kind !== "done") throw new Error("Expected complete step");
  return result;
}
function slice(committed: BattleState): BattleSlice { return { committed, inFlight: null, publishedEvents: 0, attempt: 0 }; }
function act(f: ReturnType<typeof fixture>, state: BattleState, side: Side, action: Action, answers: readonly Answer[] = []) {
  const source = new ScriptedSource(answers);
  const prompts: Prompt[] = [];
  const result = f.engine.apply(state, side, action, { answer(prompt) { prompts.push(prompt); return source.answer(prompt); } });
  source.assertExhausted();
  expect(invariantViolations(result.state, f.engine.catalog)).toEqual([]);
  return { ...result, prompts };
}

for (const side of SIDES) describe(`${side} counted copies`, () => {
  it.each([0, 1, 3])("makes %i distinct physical copies above the original without play/payment/priority/random changes", (times) => {
    const listener = counted(times);
    const f = fixture(side, [listener, points], { back: [listener.id], hand: [{ cardId: points.id, amplified: true }] });
    const before = cloneState(f.state);
    const result = act(f, f.state, side, play(f.ids[side].hand[0]));
    const made = copies(result.events);
    expect(made).toHaveLength(times); expect(new Set(made).size).toBe(times);
    expect(result.state.stack.map(item => item.kind === "card" ? item.instance : null)).toEqual([f.ids[side].hand[0], ...[...made].reverse()]);
    for (const id of made) expect(result.state.instances[id]).toMatchObject({ printing: { kind: "card", cardId: points.id }, owner: side, controller: side, zone: "stack", variant: { amplified: true }, status: { created: true } });
    expect(result.events.filter(e => e.kind === "cardPlayed")).toHaveLength(1);
    expect(result.events.filter(e => e.kind === "energyChanged")).toHaveLength(0);
    expect(result.state.turnLog.played[side].map(item => item.instance)).toEqual([f.ids[side].hand[0]]);
    expect(result.state.priority).toBe(f.other); expect(result.state.rng).toEqual(before.rng);
    expect(f.state).toEqual(before);
    const settled = passUntil(f.engine, result.state, state => state.stack.length === 0);
    expect(settled.steps.flatMap(step => step.events).filter(e => e.kind === "resolved").map(e => e.kind === "resolved" ? e.instance : null)).toEqual([...made, f.ids[side].hand[0]]);
    expect(settled.state.sides[side].score).toBe(times + 1);
    for (const id of made) expect(settled.state.instances[id]).toBeUndefined();
  });

  it("chooses each copy's modes and targets independently", () => {
    const listener = counted(2);
    const f = fixture(side, [listener, modal], { back: [listener.id, v.vanilla1.id, v.vanilla2.id], hand: [modal.id] });
    const [first, second] = f.ids[side].back.slice(1).map(physical);
    const result = act(f, f.state, side, play(f.ids[side].hand[0]), [0, [first], 1, 0, [second]]);
    const made = copies(result.events);
    const choices = made.map(id => result.state.stack.find(item => item.kind === "card" && item.instance === id));
    expect(choices).toMatchObject([{ choices: [{ modes: [1], targets: [] }] }, { choices: [{ modes: [0], targets: [[second]] }] }]);
    const settled = passUntil(f.engine, result.state, state => state.stack.length === 0).state;
    expect(settled.sides[side].score).toBe(2);
    expect(f.engine.view(settled, side).instances[first]?.characteristics?.spark).toBe(2);
    expect(f.engine.view(settled, side).instances[second]?.characteristics?.spark).toBe(3);
  });

  it.each([false, true])("carries X and optional-paid=%s into every retarget without repaying", pays => {
    const listener = counted(2);
    const f = fixture(side, [listener, paid], { back: [v.vanilla0.id, v.vanilla1.id, v.vanilla2.id, listener.id], hand: [paid.id] });
    const targets = f.ids[side].back.slice(0, 3).map(physical);
    const answers: Answer[] = [2, pays, ...(pays ? targets.map(id => [id]) : [])];
    const result = act(f, f.state, side, play(f.ids[side].hand[0]), answers);
    const made = copies(result.events);
    for (const id of made) expect(result.state.stack.find(item => item.kind === "card" && item.instance === id)).toMatchObject({ x: 2, optionalPaid: [pays] });
    if (pays) expect(result.prompts.filter(prompt => prompt.kind === "chooseTargets").map(prompt => prompt.candidates)).toEqual([targets, targets, targets]);
    expect(result.state.sides[side].currentEnergy).toBe(10 - 2 - Number(pays));
    expect(result.events.filter(e => e.kind === "energyChanged")).toHaveLength(pays ? 2 : 1);
    expect(result.answers.filter(a => a.auto !== true).filter(a => a.value === 2 || a.value === pays)).toHaveLength(2);
    const settled = passUntil(f.engine, result.state, state => state.stack.length === 0).state;
    expect(f.engine.view(settled, side).instances[targets[0]]?.characteristics?.spark).toBe(pays ? 1 : 3);
    expect(f.engine.view(settled, side).instances[targets[1]]?.characteristics?.spark).toBe(pays ? 2 : 1);
    expect(f.engine.view(settled, side).instances[targets[2]]?.characteristics?.spark).toBe(pays ? 3 : 2);
  });

  it("preserves public copy identities and private unrelated cards across views, redaction, clones and saves", () => {
    const listener = counted(2);
    const f = fixture(side, [listener, points], { back: [listener.id], hand: [points.id, v.vanilla5.id] });
    const result = act(f, f.state, side, play(f.ids[side].hand[0]));
    const hidden = f.ids[side].hand[1];
    for (const viewer of SIDES) {
      expect(f.engine.view(result.state, viewer).stack.map(item => item.kind === "card" ? item.instance : null)).toEqual(result.state.stack.map(item => item.kind === "card" ? item.instance : null));
      expect(f.engine.view(result.state, viewer).instances[hidden]).toEqual(viewer === side ? expect.anything() : undefined);
      const visible = result.events.flatMap(e => { const seen = eventSeenBy(e, viewer, result.state); return seen === null ? [] : [seen]; });
      expect(copies(visible)).toEqual(copies(result.events));
    }
    expect(eventRedactionViolations(result.events, f.state, result.state)).toEqual([]);
    expect(determinizationDivergences(f.engine, result.state, decklists(result.state), battleSeed("copy-card-times"), 0)).toEqual([]);
    const cloned = cloneState(result.state); const loaded = deserializeState(serializeState(result.state));
    expect(stateHash(cloned)).toBe(stateHash(loaded)); expect(loaded).toEqual(result.state);
    expect(cloned.stack).not.toBe(result.state.stack);
  });

  it("consumes only the first qualifying own event, and an unused delayed count expires at Ending", () => {
    const f = fixture(side, [delayedCount, high, points], { hand: [delayedCount.id, high.id, v.vanilla0.id, points.id, points.id] });
    let state = act(f, f.state, side, play(f.ids[side].hand[0])).state;
    state = passUntil(f.engine, state, current => current.stack.length === 0).state;
    expect(state.floating).toHaveLength(1);
    state = act(f, state, side, play(f.ids[side].hand[1])).state;
    state = passUntil(f.engine, state, current => current.stack.length === 0).state;
    expect(state.floating).toHaveLength(1);
    state = act(f, state, side, play(f.ids[side].hand[2])).state;
    state = passUntil(f.engine, state, current => current.stack.length === 0).state;
    expect(state.floating).toHaveLength(1);
    const first = act(f, state, side, play(f.ids[side].hand[3]));
    expect(copies(first.events)).toHaveLength(2); expect(first.state.floating).toHaveLength(0);
    state = passUntil(f.engine, first.state, current => current.stack.length === 0).state;
    expect(copies(act(f, state, side, play(f.ids[side].hand[4])).events)).toHaveLength(0);
    const fresh = fixture(side, [delayedCount], { hand: [delayedCount.id] });
    const armed = act(fresh, fresh.state, side, play(fresh.ids[side].hand[0])).state;
    expect(passUntil(fresh.engine, armed, at(fresh.engine, fresh.other, "day")).state.floating).toHaveLength(0);
  });

  it("reserves counted character-copy capacity and prevents an individual copy independently", () => {
    const listener = counted(3);
    const f = fixture(side, [listener, prevention], { back: [listener.id, ...Array.from({ length: 7 }, () => v.vanilla0.id)], hand: [v.vanilla1.id] }, { hand: [prevention.id] });
    const result = act(f, f.state, side, play(f.ids[side].hand[0]));
    expect(copies(result.events)).toHaveLength(1);
    expect(result.events.filter(e => e.kind === "capacityReached")).toHaveLength(2);
    const prevented = act(f, result.state, f.other, play(f.ids[f.other].hand[0]), [[copies(result.events)[0]]]);
    expect(prevented.state.instances[copies(result.events)[0]]).toBeUndefined();
  });

  it("makes no copy when its subject is absent from the stack", () => {
    const f = fixture(side, [missing], { hand: [missing.id] });
    expect(copies(act(f, f.state, side, play(f.ids[side].hand[0])).events)).toEqual([]);
  });

  it("keeps a materialized delayed ability after its source departs and ignores the opponent's event", () => {
    const removal = card(22, () => [event(banish(target(anyCharacter())))], { costs: [energy(3)] });
    const f = fixture(side, [materializer, removal, points], { hand: [materializer.id, removal.id, points.id] }, { hand: [points.id] });
    let state = act(f, f.state, side, play(f.ids[side].hand[0])).state;
    state = passUntil(f.engine, state, current => current.stack.length === 0).state;
    expect(state.floating).toHaveLength(1);
    state = act(f, state, side, play(f.ids[side].hand[1])).state;
    expect(state.instances[f.ids[side].hand[0]].zone).toBe("banished");
    expect(state.floating).toHaveLength(1);
    const opponentPlay = done(runStep({ ...state, turn: { ...state.turn, active: f.other } }, { kind: "play", card: f.ids[f.other].hand[0], from: "hand" }, NO_PROMPTS, f.engine.catalog));
    expect(opponentPlay.state.floating).toHaveLength(1); expect(opponentPlay.state.triggerQueue).toHaveLength(0);
    const qualified = act(f, state, side, play(f.ids[side].hand[2]));
    expect(copies(qualified.events)).toHaveLength(2); expect(qualified.state.floating).toHaveLength(0);
  });

  it("copies an opponent's physical stack item for its own controller", () => {
    const f = fixture(side, [points, mirror], { hand: [points.id] }, { hand: [mirror.id] });
    const played = act(f, f.state, side, play(f.ids[side].hand[0]));
    const mirrored = act(f, played.state, f.other, play(f.ids[f.other].hand[0]));
    expect(copies(mirrored.events)).toHaveLength(2);
    expect(mirrored.events.filter(e => e.kind === "cardCopied")).toEqual(copies(mirrored.events).map(copy => ({ kind: "cardCopied", side: f.other, original: f.ids[side].hand[0], copy })));
    const settled = passUntil(f.engine, mirrored.state, current => current.stack.length === 0).state;
    expect(settled.sides[side].score).toBe(1); expect(settled.sides[f.other].score).toBe(2);
  });

  it("keeps each original target when the copies have no legal target and skips that effect part", () => {
    const restricted = card(23, () => [event(gainSpark(target(enemyCharacter()), 1))]);
    const f = fixture(side, [restricted, mirror], { hand: [restricted.id] }, { back: [v.vanilla1.id], hand: [mirror.id] });
    const original = f.ids[f.other].back[0]!;
    const played = act(f, f.state, side, play(f.ids[side].hand[0]));
    const mirrored = act(f, played.state, f.other, play(f.ids[f.other].hand[0]));
    expect(copies(mirrored.events)).toHaveLength(2);
    expect(mirrored.events.filter(e => e.kind === "noLegalTarget")).toHaveLength(2);
    expect(f.engine.view(mirrored.state, f.other).instances[original]?.characteristics?.spark).toBe(2);
    expect(mirrored.answers.filter(answer => answer.auto !== true)).toHaveLength(0);
  });
});

for (const side of SIDES) describe(`${side} counted-copy suspended fold`, () => {
  function paused() {
    const listener = counted(2);
    const f = fixture(side, [listener, fallback], { back: [listener.id, v.vanilla1.id], hand: [fallback.id] });
    const fold = createFoldAdapter(f.engine, { checkEventPrefix: true });
    let current = applied(fold.reduce(slice(f.state), { kind: "battleAction", side, action: play(f.ids[side].hand[0]) }));
    const answer = (value: Answer) => {
      const prompt = fold.pending(current)!.prompt;
      current = applied(fold.reduce(current, { kind: "answer", side, promptId: prompt.id, value }));
    };
    answer([physical(f.ids[side].back[0])]); answer([physical(f.ids[side].back[1])]);
    const pending = fold.pending(current)!;
    expect(pending.display.stack).toHaveLength(2); expect(current.committed.stack).toHaveLength(1);
    return { ...f, fold, current, pending };
  }
  it("reloads after the first provisional copy and commits each copy once with a stable event prefix", () => {
    const f = paused();
    const reloaded = JSON.parse(JSON.stringify(f.current)) as BattleSlice;
    const cold = createFoldAdapter(f.engine, { checkEventPrefix: true });
    expect(cold.pending(reloaded)).toEqual(f.pending);
    const intent = { kind: "answer", side, promptId: f.pending.prompt.id, value: [physical(f.ids[side].back[0])] } as const;
    const warm = f.fold.reduce(f.current, intent); const resumed = cold.reduce(reloaded, intent);
    expect(resumed).toEqual(warm);
    const committed = applied(resumed).committed;
    expect(committed.stack).toHaveLength(3);
    expect(new Set(committed.stack.map(item => item.kind === "card" ? item.instance : null)).size).toBe(3);
    expect(f.current.committed.stack).toHaveLength(1);
  });
  it("rejects invalid, stale, foreign and concurrent answers and refuses cancellation of an automatic trigger", () => {
    const f = paused(); const promptId = f.pending.prompt.id;
    expect(f.fold.reduce(f.current, { kind: "answer", side, promptId, value: [f.ids[f.other].hand[0]] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(f.fold.reduce(f.current, { kind: "answer", side: f.other, promptId, value: [physical(f.ids[side].back[0])] })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(f.fold.reduce(f.current, { kind: "battleAction", side: f.other, action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(f.fold.reduce(f.current, { kind: "cancel", side, promptId })).toEqual({ kind: "bounced", reason: "notCancellable" });
    const accepted = applied(f.fold.reduce(f.current, { kind: "answer", side, promptId, value: [physical(f.ids[side].back[0])] }));
    expect(f.fold.reduce(accepted, { kind: "answer", side, promptId, value: [physical(f.ids[side].back[0])] })).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
  });
  it("cancels the original play before commitment without consuming its waiting delayed copies", () => {
    const f = fixture(side, [delayedCount, fallback], { hand: [delayedCount.id, fallback.id], back: [v.vanilla0.id, v.vanilla1.id] });
    const armed = passUntil(f.engine, act(f, f.state, side, play(f.ids[side].hand[0])).state, current => current.stack.length === 0).state;
    const fold = createFoldAdapter(f.engine);
    const opened = applied(fold.reduce(slice(armed), { kind: "battleAction", side, action: play(f.ids[side].hand[1]) }));
    const cancelled = applied(fold.reduce(opened, { kind: "cancel", side, promptId: fold.pending(opened)!.prompt.id }));
    expect(cancelled.committed).toEqual(armed); expect(cancelled.committed.floating).toHaveLength(1);
    const resumed = applied(fold.reduce(cancelled, { kind: "battleAction", side, action: play(f.ids[side].hand[1]) }));
    expect(fold.reduce(resumed, { kind: "answer", side, promptId: fold.pending(opened)!.prompt.id, value: [physical(f.ids[side].back[0])] })).toEqual({ kind: "bounced", reason: "stalePrompt" });
  });
  it("rolls back a partial copy after a malformed later count throws, then supports clean recovery", () => {
    const malformed: CopyCardTimesNode = { op: "copyCardTimes", card: triggeringCard(), times: -1 };
    const broken = card(20, () => [triggered(whenYouPlay({ cardType: "event" }), sequence(copyCardTimes(triggeringCard(), 1), malformed))], { cardType: "character", spark: 1 });
    const f = fixture(side, [broken, points], { back: [broken.id], hand: [points.id] });
    const played = done(runStep(f.state, { kind: "play", card: f.ids[side].hand[0], from: "hand" }, NO_PROMPTS, f.engine.catalog));
    expect(() => runStep(played.state, { kind: "resolveTrigger" }, NO_PROMPTS, f.engine.catalog)).toThrow(RangeError);
    expect(played.state.stack).toHaveLength(1); expect(played.state.nextInstance).toBe(f.state.nextInstance);
    const fold = createFoldAdapter(f.engine); const failed = fold.reduce(slice(f.state), { kind: "battleAction", side, action: play(f.ids[side].hand[0]) });
    if (failed.kind !== "applied") throw new Error("Expected contained engine failure");
    expect(failed.error).not.toBeNull(); expect(failed.slice.committed).toEqual(played.state);
    expect(failed.published.some(e => e.kind === "cardCopied")).toBe(false);
    const repaired = { ...broken, abilities: () => [triggered(whenYouPlay({ cardType: "event" }), copyCardTimes(triggeringCard(), 1))] };
    const repairedEngine = createEngine(testCatalog([repaired, points]));
    const recovered = done(runStep(played.state, { kind: "resolveTrigger" }, NO_PROMPTS, repairedEngine.catalog));
    expect(copies(recovered.events)).toHaveLength(1); expect(recovered.state.stack).toHaveLength(2);
  });
});

describe("copy count validation", () => {
  it.each([-1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects malformed count %s in the public builder and resolver before any write", times => {
    expect(() => copyCardTimes(self(), times)).toThrow(RangeError);
    const malformed: CopyCardTimesNode = { op: "copyCardTimes", card: self(), times };
    const source = card(21, () => [event(malformed)]);
    const f = fixture("player", [source], { hand: [source.id] });
    const played = done(runStep(f.state, { kind: "play", card: f.ids.player.hand[0], from: "hand" }, NO_PROMPTS, f.engine.catalog));
    const before = cloneState(played.state);
    expect(() => runStep(played.state, { kind: "resolveTop" }, NO_PROMPTS, f.engine.catalog)).toThrow(RangeError);
    expect(played.state).toEqual(before);
  });
});
