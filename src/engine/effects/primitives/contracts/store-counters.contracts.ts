/**
 * "Store N⧗" (`storeCounters`), on synthetic cards: the source in play gains
 * N counters, announced publicly with the new total; stored counters pay ⧗
 * costs; a source that left play before the effect resolves stores nothing
 * (RD-hv-umm2.94-1); and storing and spending survive reload, refuse stale
 * and foreign input, and commit with their step or not at all.
 */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition, EngineDreamsignDefinition } from "../../../catalog";
import { abandonCost, activated, countersCost, enemyCharacter, energy, event, self, target } from "../../../dsl/builders";
import { triggered, whenYouPlay } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import { eventSeenBy, type EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { Answer, Prompt } from "../../../prompts/types";
import type { Action } from "../../../rules/actions";
import { stateHash } from "../../../state/hash";
import type { InstanceId, Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { stepForAction } from "../../../steps/driver";
import { runStep } from "../../../steps/runner";
import { ScriptedSource } from "../../../steps/sources";
import type { AnswerSource } from "../../../steps/types";
import { unannouncedChanges } from "../../../testing/announced-changes";
import { boardState, type SideSetup } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { parseDreamsignId } from "../../../../types/identifiers";
import { dissolve } from "../dissolve";
import { gainEnergy } from "../gain-energy";
import { returnToHand } from "../return-to-hand";
import { sequence } from "../sequence";
import { storeCounters } from "../store-counters";

const character = (index: number, abilities: EngineCardDefinition["abilities"]): EngineCardDefinition => ({
  id: syntheticId(index), cardType: "character", costs: [energy(1)], spark: 1, subtype: "Synth", speed: "standard", status: "authored", abilities,
});
const interrupt = (index: number, abilities: EngineCardDefinition["abilities"]): EngineCardDefinition => ({
  id: syntheticId(index), cardType: "event", costs: [energy(1)], spark: null, subtype: "", speed: "interrupt", status: "authored", abilities,
});

/** "Abandon a character: Store 1⧗. / 2⧗: Gain 1●." */
const binder = character(9400, () => [activated([abandonCost()], storeCounters(1)), activated([countersCost(2)], gainEnergy(1))]);
/** "When you play an event, store 2⧗." */
const eventCounter = character(9401, () => [triggered(whenYouPlay({ cardType: "event" }), storeCounters(2))]);
/** An activated "Store 1⧗, then store -1⧗": the second part fails after the first stored. */
const failsAfterStoring = character(9402, () => [activated([], sequence(storeCounters(1), storeCounters(-1)))]);
/** "Store 0⧗": stores nothing. */
const storesNothing = character(9403, () => [activated([], storeCounters(0))]);
/** "When you play an event, return this character to hand. / When you play an event, store 1⧗." */
const leavesFirst = character(9406, () => [
  triggered(whenYouPlay({ cardType: "event" }), returnToHand(self())),
  triggered(whenYouPlay({ cardType: "event" }), storeCounters(1)),
]);
/** Interrupt: "Dissolve an enemy character." */
const dissolveEnemy = interrupt(9404, () => [event(dissolve(target(enemyCharacter())))]);
/** Interrupt: "Return an enemy character to hand." */
const bounceEnemy = interrupt(9405, () => [event(returnToHand(target(enemyCharacter())))]);
/** A dreamsign: "When you play an event, store 1⧗." */
const emblemCounter: EngineDreamsignDefinition = {
  id: parseDreamsignId("5e5e5e5e-0000-4000-8000-00000000d940"), status: "authored",
  abilities: () => [triggered(whenYouPlay({ cardType: "event" }), storeCounters(1))],
};

const engine = createEngine(testCatalog([binder, eventCounter, failsAfterStoring, storesNothing, dissolveEnemy, bounceEnemy, leavesFirst], { dreamsigns: [emblemCounter] }));
const deck = [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id, v.vanilla5.id];

/** The enemy holds an Interrupt by default, so an item waits on the stack until the enemy passes. */
const board = (player: SideSetup, enemy: SideSetup = {}) =>
  boardState(engine.catalog, { active: "player", phase: "day", player: { deck, energy: 3, ...player }, enemy: { deck, hand: [v.interruptEvent.id], energy: 5, ...enemy } });

/** Answers prompts from a script, keeping each prompt it was asked. */
class Recording implements AnswerSource {
  readonly prompts: Prompt[] = [];
  private next = 0;
  constructor(private readonly answers: readonly Answer[]) {}
  answer(prompt: Prompt): Answer {
    this.prompts.push(prompt);
    const value = this.answers[this.next++];
    if (value === undefined) throw new Error(`no answer for ${prompt.purpose.role}`);
    return value;
  }
}

function run(state: BattleState, side: Side, action: Action, answers: readonly Answer[] = []) {
  const source = new Recording(answers);
  const result = engine.apply(state, side, action, source);
  expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  expect(unannouncedChanges(result.events, state, result.state)).toEqual([]);
  return { ...result, prompts: source.prompts };
}
const activate = (source: InstanceId, ability: number): Action => ({ kind: "activate", source, ability });
const pass = (state: BattleState) => run(state, "enemy", { kind: "pass" });
const activations = (state: BattleState, side: Side = "player") => engine.legalActions(state, side).filter((action) => action.kind === "activate");
const counterEvents = (events: readonly EngineEvent[]) => events.filter((event) => event.kind === "countersChanged");
const counters = (state: BattleState, id: InstanceId) => state.instances[id].status.counters;
const sliceOf = (state: BattleState): BattleSlice => ({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`expected an applied intent, got ${JSON.stringify(outcome)}`);
  return outcome.slice;
}

/** Activates the binder's store ability, abandoning `fodder`, and resolves it. */
function storeOnce(state: BattleState, source: InstanceId, fodder: InstanceId) {
  const activated = run(state, "player", activate(source, 0), [[fodder]]);
  return { activated, resolved: pass(activated.state) };
}

describe("storeCounters", () => {
  it("adds N⧗ to the source in play and announces the new total to both sides", () => {
    const { state, ids } = board({ back: [eventCounter.id], hand: [v.event1.id] });
    const source = ids.player.back[0]!;
    state.instances[source].status.counters = 3;
    // Triggered abilities do not use the stack: the trigger stores as the event is played.
    const resolved = run(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" });
    expect(resolved.state.stack).toHaveLength(1);
    const stored = counterEvents(resolved.events);
    expect(stored).toEqual([{ kind: "countersChanged", instance: source, counters: 5 }]);
    expect(counters(resolved.state, source)).toBe(5);
    for (const viewer of ["player", "enemy"] as const) expect(eventSeenBy(stored[0], viewer, resolved.state)).toEqual(stored[0]);
  });

  it("stores 0⧗ without a change or an event", () => {
    const { state, ids } = board({ back: [storesNothing.id] });
    const resolved = pass(run(state, "player", activate(ids.player.back[0]!, 0)).state);
    expect(counterEvents(resolved.events)).toEqual([]);
    expect(counters(resolved.state, ids.player.back[0]!)).toBe(0);
  });

  it("stores ⧗ with an abandon cost, which may abandon the source itself, storing nothing", () => {
    const { state, ids } = board({ back: [binder.id, v.vanilla1.id] });
    const [source, fodder] = [ids.player.back[0]!, ids.player.back[1]!];
    const { activated: paid, resolved } = storeOnce(state, source, fodder);
    expect(paid.prompts.map((prompt) => prompt.purpose.role)).toEqual(["abandonCost"]);
    expect(paid.events).toContainEqual({ kind: "abandoned", instance: fodder, side: "player" });
    expect(counterEvents(resolved.events)).toEqual([{ kind: "countersChanged", instance: source, counters: 1 }]);

    const self = run(state, "player", activate(source, 0), [[source]]);
    expect(self.state.instances[source].zone).toBe("void");
    const nothing = pass(self.state);
    expect(counterEvents(nothing.events)).toEqual([]);
    expect(nothing.state.instances[source]).toMatchObject({ zone: "void", status: { counters: 0 } });
  });

  it("stores nothing on a source an opponent's response removed, which returns to play with no ⧗", () => {
    for (const response of [dissolveEnemy, bounceEnemy]) {
      const { state, ids } = board({ back: [binder.id, v.vanilla1.id], hand: [] }, { hand: [response.id] });
      const [source, fodder] = [ids.player.back[0]!, ids.player.back[1]!];
      state.instances[source].status.counters = 2;
      const paid = run(state, "player", activate(source, 0), [[fodder]]);
      const responded = run(paid.state, "enemy", { kind: "play", card: ids.enemy.hand[0], from: "hand" }, [[source]]);
      const resolved = run(responded.state, "player", { kind: "pass" });
      const settled = resolved.state.stack.length > 0 ? pass(resolved.state) : resolved;
      expect(settled.state.stack).toEqual([]);
      expect(settled.state.instances[source].zone).not.toBe("play");
      expect(counters(settled.state, source)).toBe(0);
      expect(counterEvents([...resolved.events, ...settled.events])).toEqual([]);
    }
  });

  it("stores nothing on a triggered source an earlier trigger of the same event removed from play", () => {
    const { state, ids } = board({ back: [leavesFirst.id], hand: [v.event1.id] });
    const source = ids.player.back[0]!;
    state.instances[source].status.counters = 2;
    const played = run(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" });
    expect(played.events).toContainEqual({ kind: "returnedToHand", instance: source, side: "player" });
    expect(counterEvents(played.events)).toEqual([]);
    expect(played.state.instances[source]).toMatchObject({ zone: "hand", status: { counters: 0 } });
  });

  it("fails as a definition error on an emblem, which stores no counters, committing nothing", () => {
    const { state, ids } = board({ hand: [v.event1.id], dreamsigns: [emblemCounter.id] });
    const before = stateHash(state);
    expect(() => engine.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, new ScriptedSource([]))).toThrow(/stores no counters/);
    expect(stateHash(state)).toBe(before);
  });
});

describe("spending stored ⧗", () => {
  it("offers a ⧗ ability only with enough stored, pays as it goes on the stack, and resolves after its source left play", () => {
    const { state, ids } = board({ back: [binder.id, v.vanilla1.id, v.vanilla2.id] }, { hand: [dissolveEnemy.id] });
    const [source, first, second] = [ids.player.back[0]!, ids.player.back[1]!, ids.player.back[2]!];
    const once = storeOnce(state, source, first).resolved.state;
    expect(activations(once)).toEqual([activate(source, 0)]);
    const twice = storeOnce(once, source, second).resolved.state;
    expect(counters(twice, source)).toBe(2);
    // The source can always pay its own abandon cost; the spend needs both stored ⧗.
    expect(activations(twice)).toEqual([activate(source, 0), activate(source, 1)]);

    const spent = run(twice, "player", activate(source, 1));
    expect(counterEvents(spent.events)).toEqual([{ kind: "countersChanged", instance: source, counters: 0 }]);
    expect(spent.state.stack).toHaveLength(1);
    // The opponent dissolves the source in response; the paid ability resolves anyway (rules § Activated abilities).
    const responded = run(spent.state, "enemy", { kind: "play", card: ids.enemy.hand[0], from: "hand" }, [[source]]);
    let current = run(responded.state, "player", { kind: "pass" }).state;
    while (current.stack.length > 0) current = run(current, current.priority ?? "player", { kind: "pass" }).state;
    expect(current.instances[source].zone).toBe("void");
    expect(current.sides.player.currentEnergy).toBe(twice.sides.player.currentEnergy + 1);
  });

  it("bounces a spend offered before the stored ⧗ dropped below its cost", () => {
    const { state, ids } = board({ back: [binder.id] });
    const source = ids.player.back[0]!;
    state.instances[source].status.counters = 2;
    const action = activate(source, 1);
    expect(activations(state)).toContainEqual(action);
    const drained = structuredClone(state);
    drained.instances[source].status.counters = 1;
    expect(createFoldAdapter(engine).reduce(sliceOf(drained), { kind: "battleAction", side: "player", action })).toEqual({ kind: "bounced", reason: "illegalAction" });
    expect(() => engine.apply(drained, "player", action, new ScriptedSource([]))).toThrow();
    // A source that left play offers no activation at all.
    const gone = run(state, "player", activate(source, 0), [[source]]).state;
    expect(activations(gone)).toEqual([]);
  });
});

describe("storeCounters across suspension and failure", () => {
  it("reloads the abandon-cost choice unchanged, commits nothing until answered, and refuses stale, foreign and concurrent input", () => {
    const { state, ids } = board({ back: [binder.id, v.vanilla1.id] });
    const [source, fodder] = [ids.player.back[0]!, ids.player.back[1]!];
    const action = activate(source, 0);
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const opened = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action }));
    const pending = fold.pending(opened)!;
    expect(pending.prompt).toMatchObject({ kind: "chooseCards", cancellable: true, purpose: { role: "abandonCost" } });
    expect(stateHash(opened.committed)).toBe(stateHash(state));

    const saved = JSON.parse(JSON.stringify(opened)) as BattleSlice;
    const cold = createFoldAdapter(createEngine(engine.catalog), { checkEventPrefix: true });
    expect(cold.pending(saved)).toEqual(pending);
    const answer = (side: Side, value: Answer, slice: BattleSlice = saved) => cold.reduce(slice, { kind: "answer", side, promptId: pending.prompt.id, value });

    expect(answer("enemy", [fodder])).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(cold.reduce(saved, { kind: "battleAction", side: "player", action })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(answer("player", [ids.enemy.hand[0]])).toEqual({ kind: "bounced", reason: "illegalAnswer" });

    const cancelled = applied(cold.reduce(saved, { kind: "cancel", side: "player", promptId: pending.prompt.id }));
    expect(cancelled.committed).toEqual(state);
    const reopened = applied(cold.reduce(cancelled, { kind: "battleAction", side: "player", action }));
    expect(answer("player", [fodder], reopened)).toEqual({ kind: "bounced", reason: "stalePrompt" });

    const paid = applied(answer("player", [fodder]));
    expect(paid.inFlight).toBeNull();
    expect(paid.committed.instances[fodder].zone).toBe("void");
    expect(paid.committed.stack[0]).toMatchObject({ kind: "ability", source });
    expect(answer("player", [fodder], paid)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    const stored = applied(cold.reduce(paid, { kind: "battleAction", side: "enemy", action: { kind: "pass" } }));
    expect(counters(stored.committed, source)).toBe(1);
  });

  it("commits neither the stored ⧗ nor its event when the resolution fails after storing", () => {
    const { state, ids } = board({ back: [failsAfterStoring.id] });
    const source = ids.player.back[0]!;
    const onStack = run(state, "player", activate(source, 0)).state;
    const before = stateHash(onStack);
    const observed: EngineEvent[] = [];
    const resolveStep = stepForAction(onStack, { kind: "pass" });
    expect(() => runStep(onStack, resolveStep, new ScriptedSource([]), engine.catalog, { observeEvent: (item) => observed.push(item) })).toThrow(/cannot store -1⧗/);
    expect(counterEvents(observed)).toEqual([{ kind: "countersChanged", instance: source, counters: 1 }]);
    expect(stateHash(onStack)).toBe(before);
    expect(counters(onStack, source)).toBe(0);

    const outcome = createFoldAdapter(engine).reduce(sliceOf(onStack), { kind: "battleAction", side: "enemy", action: { kind: "pass" } });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected an engine error");
    expect(outcome.published).toEqual([]);
    expect(stateHash(outcome.slice.committed)).toBe(before);
  });
});
