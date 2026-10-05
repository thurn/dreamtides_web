/** Additional costs of cards and the remaining cost kinds: alternatives, optional costs, ⧗, banish from void, reveal. */
import { describe, expect, it } from "vitest";
import { createEngine, IllegalAction } from "../engine";
import { createFoldAdapter } from "../fold/slice";
import type { Answer } from "../prompts/types";
import type { CardId, InstanceId, Side } from "../state/ids";
import type { BattleState } from "../state/types";
import { ScriptedSource } from "../steps/sources";
import { boardState, type SideSetup } from "../testing/board";
import { invariantViolations } from "../testing/invariants";
import { STACK, STACK_CARDS, SYNTHETIC_EMBLEMS } from "../testing/stack-cards";
import { SYNTHETIC, testCatalog } from "../testing/synthetic-cards";
import type { Action } from "./actions";

const engine = createEngine(testCatalog(STACK_CARDS, SYNTHETIC_EMBLEMS));
const v = SYNTHETIC;
const deck = [v.vanilla1.id, v.vanilla1.id, v.vanilla1.id];

/** The enemy holds an Interrupt, so it gets a window to respond and the played item waits on the stack. */
function board(player: SideSetup) {
  return boardState(engine.catalog, {
    active: "player",
    phase: "day",
    player: { deck, ...player },
    enemy: { deck, hand: [v.interruptEvent.id], energy: 5 },
  });
}

function run(state: BattleState, side: Side, action: Action, answers: readonly Answer[] = []) {
  const source = new ScriptedSource(answers);
  const result = engine.apply(state, side, action, source);
  source.assertExhausted();
  expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  return result;
}

function playFirst(state: BattleState, card: InstanceId, answers: readonly Answer[] = []) {
  return run(state, "player", { kind: "play", card, from: "hand" }, answers);
}

/** The enemy passes, resolving the top of the stack. */
function resolve(state: BattleState) {
  return run(state, "enemy", { kind: "pass" });
}

function plays(state: BattleState): InstanceId[] {
  return engine.legalActions(state, "player").flatMap((action) => (action.kind === "play" ? [action.card] : []));
}

function activations(state: BattleState) {
  return engine.legalActions(state, "player").filter((action) => action.kind === "activate");
}

/** Moves a card the player holds into its void. */
function toVoid(state: BattleState, id: InstanceId): void {
  state.sides.player.hand = state.sides.player.hand.filter((card) => card !== id);
  state.instances[id].zone = "void";
  state.sides.player.void.push(id);
}

function cardsOf(state: BattleState, ids: readonly InstanceId[]): CardId[] {
  return ids.map((id) => state.instances[id].cardId);
}

describe("additional costs to play a card", () => {
  it("asks which alternative of an \"A or B\" cost to pay, then the card that pays it, before the commit point", () => {
    const { state: start, ids } = board({ back: [v.vanilla1.id], hand: [STACK.abandonOrDiscardToDraw.id, v.vanilla2.id], energy: 1 });
    const [card, fodder] = ids.player.hand;
    const character = ids.player.back[0]!;
    const discarded = playFirst(start, card, [1]);
    expect(discarded.answers.map((answer) => answer.auto ?? false)).toEqual([false, true]);
    expect(discarded.events.map((event) => event.kind)).toEqual(["energyChanged", "discarded", "cardPlayed"]);
    expect(discarded.state.sides.player.void).toEqual([fodder]);
    expect(discarded.state.instances[character].zone).toBe("play");
    expect(resolve(discarded.state).state.sides.player.hand).toHaveLength(2);

    const abandoned = playFirst(start, card, [0]);
    expect(abandoned.events).toContainEqual({ kind: "abandoned", instance: character, side: "player" });
    expect(abandoned.state.sides.player.hand).toEqual([fodder]);
  });

  it("chooses the only payable alternative automatically and rejects a card no alternative can pay for", () => {
    const onlyCharacter = board({ back: [v.vanilla1.id], hand: [STACK.abandonOrDiscardToDraw.id], energy: 1 });
    const { state } = playFirst(onlyCharacter.state, onlyCharacter.ids.player.hand[0]);
    expect(state.sides.player.void).toEqual([onlyCharacter.ids.player.back[0]]);

    // The card itself never pays its own discard cost.
    const neither = board({ hand: [STACK.abandonOrDiscardToDraw.id], energy: 1 });
    expect(plays(neither.state)).toEqual([]);
    expect(() => playFirst(neither.state, neither.ids.player.hand[0])).toThrow(IllegalAction);
  });

  it("pays an optional cost only when chosen, records it on the stack item, and the effect reads it", () => {
    const { state: start, ids } = board({ hand: [STACK.optionalKicker.id, v.vanilla2.id], energy: 2 });
    const [card, fodder] = ids.player.hand;
    const paid = playFirst(start, card, [true]);
    expect(paid.state.stack).toEqual([{ kind: "card", instance: card, controller: "player", modes: [], targets: [], x: null, optionalPaid: [true] }]);
    expect(paid.state.sides.player.currentEnergy).toBe(0);
    expect(paid.state.sides.player.void).toEqual([fodder]);
    expect(resolve(paid.state).state.sides.player.score).toBe(4);

    const declined = playFirst(start, card, [false]);
    expect(declined.state.stack[0]?.optionalPaid).toEqual([false]);
    expect(declined.state.sides.player.currentEnergy).toBe(2);
    expect(declined.state.sides.player.hand).toEqual([fodder]);
    expect(resolve(declined.state).state.sides.player.score).toBe(1);
  });

  it("does not offer an optional cost that cannot be paid", () => {
    const { state: start, ids } = board({ hand: [STACK.optionalKicker.id, v.vanilla2.id], energy: 1 });
    const { state } = playFirst(start, ids.player.hand[0], []);
    expect(state.stack[0]?.optionalPaid).toEqual([false]);
    expect(state.sides.player.currentEnergy).toBe(1);
  });

  it("counts an optional cost as paid from the stack item alone, as a copy of the item does", () => {
    const { state: start, ids } = board({ hand: [STACK.optionalKicker.id] });
    const card = ids.player.hand[0];
    start.sides.player.hand = [];
    start.instances[card].zone = "stack";
    start.stack.push({ kind: "card", instance: card, controller: "player", modes: [], targets: [], x: null, optionalPaid: [true] });
    start.priority = "enemy";
    const { state } = resolve(start);
    expect(state.sides.player.score).toBe(4);
    expect(state.sides.player.currentEnergy).toBe(start.sides.player.currentEnergy);
  });

  it("banishes cards from the void to pay, and is not playable without enough of them", () => {
    const short = board({ hand: [STACK.banishVoidToDraw.id, v.vanilla1.id] });
    toVoid(short.state, short.ids.player.hand[1]);
    expect(plays(short.state)).toEqual([]);
    const { state: start, ids } = board({ hand: [STACK.banishVoidToDraw.id, v.vanilla1.id, v.event1.id] });
    const [card, first, second] = ids.player.hand;
    toVoid(start, first);
    toVoid(start, second);
    expect(plays(start)).toEqual([card]);
    const { state, events } = playFirst(start, card);
    expect(events.filter((event) => event.kind === "banished").map((event) => event.instance)).toEqual([first, second]);
    expect(state.sides.player.void).toEqual([]);
    expect([...state.sides.player.banished].sort()).toEqual([first, second].sort());
  });
});

describe("activated ability costs", () => {
  it("spends ⧗ from the source, and is unavailable without enough stored", () => {
    const empty = board({ back: [STACK.counterBattery.id] });
    expect(activations(empty.state)).toEqual([]);
    const { state: start, ids } = board({ back: [STACK.counterBattery.id] });
    const source = ids.player.back[0]!;
    start.instances[source].status.counters = 1;
    expect(activations(start)).toEqual([{ kind: "activate", source, ability: 0 }]);
    const { state, events } = run(start, "player", { kind: "activate", source, ability: 0 });
    expect(events.map((event) => event.kind)).toEqual(["countersChanged", "exhaustionChanged", "abilityActivated"]);
    expect(events[0]).toEqual({ kind: "countersChanged", instance: source, counters: 0 });
    expect(state.instances[source].status.counters).toBe(0);
  });

  it("reveals a matching card from hand, which stays there, and is unavailable without one", () => {
    const withoutWarrior = board({ back: [STACK.revealWarrior.id], hand: [v.event1.id] });
    expect(activations(withoutWarrior.state)).toEqual([]);
    const { state: start, ids } = board({ back: [STACK.revealWarrior.id], hand: [v.event1.id, v.vanilla1.id] });
    const source = ids.player.back[0]!;
    const warrior = ids.player.hand[1];
    const { state, events } = run(start, "player", { kind: "activate", source, ability: 0 });
    expect(events).toContainEqual({ kind: "revealed", side: "player", instances: [warrior] });
    expect(state.sides.player.hand).toEqual(ids.player.hand);
    expect(cardsOf(state, state.sides.player.hand)).toEqual([v.event1.id, v.vanilla1.id]);
  });

  it("takes an optional cost on an ability, and leaving play clears the abandoned card's ⧗", () => {
    const { state: start, ids } = board({ back: [STACK.optionalAbandonAbility.id, STACK.counterBattery.id], energy: 1 });
    const [source, fodder] = ids.player.back;
    start.instances[fodder!].status.counters = 2;
    const action: Action = { kind: "activate", source: source!, ability: 0 };
    const paid = run(start, "player", action, [true]);
    expect(paid.state.stack[0]?.optionalPaid).toEqual([true]);
    expect(paid.state.instances[fodder!]).toMatchObject({ zone: "void", status: { counters: 0 } });
    expect(resolve(paid.state).state.sides.player.score).toBe(2);

    const declined = run(start, "player", action, [false]);
    expect(declined.state.instances[fodder!]?.zone).toBe("play");
    expect(resolve(declined.state).state.sides.player.score).toBe(0);
  });

  it("suspends on cost choices before the commit point, where cancelling restores the committed state", () => {
    const { state, ids } = board({ hand: [STACK.optionalKicker.id, v.vanilla2.id, v.vanilla3.id], energy: 2 });
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const slice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const opened = fold.reduce(slice, { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } });
    if (opened.kind !== "applied") throw new Error("play bounced");
    const confirm = fold.pending(opened.slice);
    expect(confirm?.prompt).toMatchObject({ kind: "confirm", cancellable: true, purpose: { role: "optionalCost" } });
    const accepted = fold.reduce(opened.slice, { kind: "answer", side: "player", promptId: confirm!.prompt.id, value: true });
    if (accepted.kind !== "applied") throw new Error("answer bounced");
    const discard = fold.pending(accepted.slice);
    expect(discard?.prompt).toMatchObject({ kind: "chooseCards", cancellable: true, purpose: { role: "discardCost" } });
    const cancelled = fold.reduce(accepted.slice, { kind: "cancel", side: "player", promptId: discard!.prompt.id });
    if (cancelled.kind !== "applied") throw new Error("cancel bounced");
    expect(cancelled.slice.committed).toBe(state);
    expect(cancelled.slice.inFlight).toBeNull();
  });
});
