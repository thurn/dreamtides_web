/**
 * Additional costs of cards and the remaining cost kinds: alternatives,
 * optional costs, ⧗, banish from void, reveal; and legality by search, which
 * offers a play exactly when some path of answers reaches the commit point
 * with payable costs, and only answers that keep such a path open.
 */
import { describe, expect, it } from "vitest";
import { printedCardId, type EngineCardDefinition } from "../catalog";
import type { CardSubtype } from "../../types/card-identity";
import { abandonCost, activated, additionalCost, characterYouControl, choiceCost, discardCost, energy, event, revealCost, target } from "../dsl/builders";
import * as p from "../effects/primitives";
import { createEngine, IllegalAction } from "../engine";
import { eventVisibleTo, type EngineEvent } from "../events";
import { createFoldAdapter, type BattleSlice } from "../fold/slice";
import { legalityLogRecords, type EngineLogRecord } from "../log";
import { legalAnswers } from "../prompts/answers";
import { promptFingerprint } from "../prompts/fingerprint";
import type { Answer, ChooseNumberPrompt, Prompt } from "../prompts/types";
import { stateHash } from "../state/hash";
import { opponent, type CardId, type EffectId, type InstanceId, type Side } from "../state/ids";
import type { BattleState } from "../state/types";
import { Infeasible } from "../steps/errors";
import { searchCommitPoint, stepSearch, type StepSearch } from "../steps/feasibility";
import type { Step } from "../steps/kinds";
import { runStep } from "../steps/runner";
import { promptView } from "../view/view";
import { INTERACTIVE, ScriptedSource } from "../steps/sources";
import type { AnswerSource, RecordedAnswer, StepContext } from "../steps/types";
import { boardState, cardIdOf, type SideSetup } from "../testing/board";
import { invariantViolations } from "../testing/invariants";
import { promptRedactionViolations } from "../testing/redaction";
import { STACK, STACK_CARDS, SYNTHETIC_EMBLEMS } from "../testing/stack-cards";
import { PROMPTING } from "../testing/synthetic-effects";
import { SYNTHETIC, syntheticId, testCatalog } from "../testing/synthetic-cards";
import type { Action } from "./actions";
import { cardsAssignable } from "./costs";
import { createLegalityMemo, legalMoves, type BoundedLegality } from "./legality";
import { BATTLE } from "../../content/battle";

function fixture(index: number, cardType: "character" | "event", abilities: EngineCardDefinition["abilities"], subtype: CardSubtype = "Warrior"): EngineCardDefinition {
  return {
    id: syntheticId(0xf00 + index),
    cardType,
    costs: [energy(0)],
    spark: cardType === "character" ? 1 : null,
    subtype: cardType === "character" ? subtype : "",
    speed: "standard",
    status: "authored",
    abilities,
  };
}

/** The value of X: `a`, then `b`, each from 0 to `PAIR_MAX`. */
const PAIR_MAX = 7;
// eslint-disable-next-line dreamtides/engine-purity -- counts every run of a play step, dry or real
let pairRuns = 0;

/** A play hook choosing two numbers for `side`; a pair with `b < a` dead-ends, and `a = 3` is a rules bug when `broken`. */
function pairHook(side: (ctx: StepContext, self: InstanceId) => Side, broken = false): NonNullable<EngineCardDefinition["synthetic"]>["play"] {
  return (ctx, self) => {
    // eslint-disable-next-line dreamtides/engine-purity -- counts every run of a play step, dry or real
    pairRuns += 1;
    const asked = side(ctx, self);
    const purpose = { source: self, cardId: printedCardId(ctx.state.instances[self].printing), ability: 0, role: "chooseX" } as const;
    const a = ctx.choose<ChooseNumberPrompt>({ kind: "chooseNumber", side: asked, purpose, min: 0, max: PAIR_MAX });
    if (broken && a === 3) throw new Error("a rules bug on one answer path");
    const b = ctx.choose<ChooseNumberPrompt>({ kind: "chooseNumber", side: asked, purpose, min: 0, max: PAIR_MAX });
    if (b < a) throw new Infeasible("b < a");
    return {};
  };
}

const controller = (ctx: StepContext, self: InstanceId): Side => ctx.state.instances[self].controller;

/** Fixtures whose first-legal answer path dead-ends while another path pays. */
const SEARCH = {
  /** A character that is not a Warrior. */
  mage: fixture(0, "character", () => [], "Mage"),
  /** "To play this card, abandon a Warrior. A character you control gains +1✦." */
  pumpAbandoningWarrior: fixture(1, "event", () => [additionalCost(abandonCost({ subtype: "Warrior" })), event(p.gainSpark(target(characterYouControl()), 1))]),
  /** "To play this card, discard a card and reveal an event from your hand. Gain 1⍟." */
  discardThenRevealEvent: fixture(2, "event", () => [additionalCost(discardCost(1), revealCost(1, { cardType: "event" })), event(p.gainPoints(1))]),
  /** "To play this card, discard a card and reveal an event, or pay 5●. Gain 1⍟." */
  discardRevealOrEnergy: fixture(3, "event", () => [additionalCost(choiceCost([discardCost(1), revealCost(1, { cardType: "event" })], [energy(5)])), event(p.gainPoints(1))]),
  /** "To play this card, discard two cards, then reveal an event. Gain 1⍟." */
  discardTwoThenRevealEvent: fixture(4, "event", () => [additionalCost(discardCost(2), revealCost(1, { cardType: "event" })), event(p.gainPoints(1))]),
  /** "To play this card, discard a card, discard a card, and reveal an event. Gain 1⍟." */
  discardEachThenRevealEvent: fixture(5, "event", () => [additionalCost(discardCost(1), discardCost(1), revealCost(1, { cardType: "event" })), event(p.gainPoints(1))]),
  /** A Mage with "Abandon a Warrior: A character you control gains +1✦." */
  pumpingMage: fixture(6, "character", () => [activated([abandonCost({ subtype: "Warrior" })], p.gainSpark(target(characterYouControl()), 1))], "Mage"),
  /** Its player chooses `a`, then `b ≥ a`, at play time: the number of paths through an answer grows with it. */
  ascendingPair: { ...fixture(7, "event", () => []), synthetic: { play: pairHook(controller) } },
  /** As `ascendingPair`, but the opponent of its player chooses, while the card is still hidden in hand. */
  opponentPair: { ...fixture(8, "event", () => []), synthetic: { play: pairHook((ctx, self) => opponent(controller(ctx, self))) } },
  /** As `ascendingPair`, but rules code throws once `a = 3` is chosen. */
  brokenPair: { ...fixture(9, "event", () => []), synthetic: { play: pairHook(controller, true) } },
  /** An Interrupt: "To play this card, discard a card and reveal an event. Gain 1⍟." */
  revealingInterrupt: { ...fixture(10, "event", () => [additionalCost(discardCost(1), revealCost(1, { cardType: "event" })), event(p.gainPoints(1))]), speed: "interrupt" },
} as const satisfies Record<string, EngineCardDefinition>;

const engine = createEngine(testCatalog([...STACK_CARDS, ...Object.values(SEARCH), PROMPTING.drawX], SYNTHETIC_EMBLEMS));
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
  return ids.map((id) => cardIdOf(state, id));
}

describe("additional costs to play a card", () => {
  it("asks which alternative of an \"A or B\" cost to pay, then the card that pays it, before the commit point", () => {
    const { state: start, ids } = board({ back: [v.vanilla1.id], hand: [STACK.abandonOrDiscardToDraw.id, v.vanilla2.id], energy: 1 });
    const [card, fodder] = ids.player.hand;
    const character = ids.player.back[0]!;
    const discarded = playFirst(start, card, [1]);
    expect(discarded.answers.map((answer) => answer.auto ?? false)).toEqual([false, true]);
    expect(discarded.events.map((event) => event.kind)).toEqual(["promptAutoAnswered", "energyChanged", "discarded", "cardPlayed"]);
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
    expect(paid.state.stack).toEqual([{ kind: "card", instance: card, controller: "player", choices: [{ modes: [], targets: [] }], x: null, optionalPaid: [true] }]);
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
    start.stack.push({ kind: "card", instance: card, controller: "player", choices: [], x: null, optionalPaid: [true] });
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

describe("one feasibility budget per step", () => {
  it("bounds every dry run of a play, legality and narrowing together, by the budget", () => {
    for (const budget of [1, 4, 9, 16, 36, 64]) {
      const { state, ids } = withBudget(board({ hand: [SEARCH.ascendingPair.id] }), budget);
      const card = ids.player.hand[0];
      // eslint-disable-next-line dreamtides/engine-purity -- counts every run of a play step, dry or real
      pairRuns = 0;
      expect(plays(state)).toEqual([card]);
      const result = engine.apply(state, "player", { kind: "play", card, from: "hand" }, HIGHEST);
      // One real run; every other run is a dry run of legality or of a narrowed prompt.
      expect(pairRuns - 1).toBeLessThanOrEqual(budget);
      expect(searchOf(state, card).dryRuns).toBe(pairRuns - 1);
      expect(result.state.stack[0]).toMatchObject({ instance: card });
    }
  });

  it("narrows by proof within the budget, and reports exactly the answers it could not settle", () => {
    const pairPrompts = (budget: number) => {
      const { state, ids } = withBudget(board({ hand: [SEARCH.ascendingPair.id] }), budget);
      const result = engine.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, HIGHEST);
      return { answers: result.answers.map((answer) => answer.value), bounded: result.events.filter((event) => event.kind === "feasibilityBounded") };
    };
    // Every a has a path (b = a), so the default budget proves each answer; a = 7 leaves b = 7.
    expect(pairPrompts(BATTLE_BUDGET)).toEqual({ answers: [PAIR_MAX, PAIR_MAX], bounded: [] });
    // Legality's witness (0, 0) is free. Twenty runs settle a = 1 and a = 2
    // in turn; a = 3 to 7 are examined and left unproven, and b = 2 is
    // free along a = 2's witness, the rest unexamined.
    const twenty = pairPrompts(20);
    expect(twenty.answers).toEqual([2, 2]);
    expect(twenty.bounded.map(({ unproven, truncated }) => ({ unproven, truncated }))).toEqual([
      { unproven: 5, truncated: false },
      { unproven: 0, truncated: true },
    ]);
    // Five runs examine a = 1 to 4 once each and stop: only the witness is offered, and answered as forced.
    const five = pairPrompts(5);
    expect(five.answers).toEqual([0, 0]);
    expect(five.bounded.map(({ unproven, truncated }) => ({ unproven, truncated }))).toEqual([
      { unproven: 4, truncated: true },
      { unproven: 0, truncated: true },
    ]);
  });

  it("makes no dry runs when the fold re-runs a step, and decides alike after a cold reload", () => {
    for (const budget of [1, 9, 20, 64]) {
      const { state, ids } = withBudget(board({ hand: [SEARCH.ascendingPair.id] }), budget);
      const card = ids.player.hand[0];
      const fold = createFoldAdapter(engine, { checkEventPrefix: true });
      let slice = sliceOf(state);
      let pending = null;
      slice = appliedSlice(fold.reduce(slice, { kind: "battleAction", side: "player", action: { kind: "play", card, from: "hand" } }));
      const search = () => searchOf(state, card).dryRuns;
      while ((pending = fold.pending(slice)) !== null) {
        const spent = search();
        expect(fold.pending(slice)).toEqual(pending);
        expect(search()).toBe(spent);
        const cold = createFoldAdapter(createEngine(engine.catalog));
        expect(cold.pending(JSON.parse(JSON.stringify(slice)) as BattleSlice)).toEqual(pending);
        const value = [...legalAnswers(pending.prompt)].pop()!;
        slice = appliedSlice(fold.reduce(slice, { kind: "answer", side: "player", promptId: pending.prompt.id, value }));
      }
      expect(search()).toBeLessThanOrEqual(budget);
      expect(slice.committed.stack[0]).toMatchObject({ instance: card });
    }
  });

  it("never offers a play whose narrowed prompts could come up empty, whatever the budget", () => {
    for (let budget = 1; budget <= 12; budget++) {
      for (const hand of permutations([v.event1.id, v.vanilla1.id, v.vanilla2.id])) {
        const { state, ids } = withBudget(board({ hand: [SEARCH.discardEachThenRevealEvent.id, ...hand] }), budget);
        const card = ids.player.hand[0];
        // The play can always be paid, so legality leaves it out only when its search runs out.
        const legal = plays(state).includes(card);
        expect(legal).toBe(!legalMoves(state, engine.catalog, "player", createLegalityMemo()).bounded.some((step) => step.kind === "play" && step.card === card));
        if (legal) expect(offeredPaths(state, playStep(card)).finished).toBeGreaterThan(0);
      }
      const pair = withBudget(board({ hand: [SEARCH.ascendingPair.id] }), budget);
      expect(offeredPaths(pair.state, playStep(pair.ids.player.hand[0])).finished).toBeGreaterThan(0);
    }
  });

  it("names a play-time prompt's source to the opponent answering it only as it may see the card", () => {
    const { state, ids } = board({ hand: [SEARCH.opponentPair.id] });
    const fold = createFoldAdapter(engine);
    const opened = appliedSlice(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } }));
    const { prompt, display } = fold.pending(opened)!;
    expect(prompt).toMatchObject({ side: "enemy", purpose: { source: ids.player.hand[0] } });
    expect(promptView(prompt, "enemy", display).purpose).toMatchObject({ source: null, cardId: null, role: "chooseX" });
    expect(promptRedactionViolations(prompt, display, engine.catalog)).toEqual([]);
  });

  it("names a prompt's source in its bounded event only as the answering side may see it", () => {
    const { state, ids } = withBudget(board({ hand: [SEARCH.opponentPair.id] }), 1);
    const card = ids.player.hand[0];
    const records: EngineLogRecord[] = [];
    const fold = createFoldAdapter(engine, { log: (record) => records.push(record) });
    const done = appliedSlice(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: { kind: "play", card, from: "hand" } }));
    expect(done.committed.stack[0]).toMatchObject({ instance: card });
    const bounded = records.flatMap((record) => (record.event === "engine.feasibility" && record.detail.kind === "feasibilityBounded" ? [record.detail] : []));
    expect(bounded).toHaveLength(2);
    for (const event of bounded) {
      expect(event).toMatchObject({ side: "enemy", purpose: { source: null, cardId: null, role: "chooseX" } });
      expect(JSON.stringify(event)).not.toContain(card);
      expect(JSON.stringify(event)).not.toContain(SEARCH.opponentPair.id);
      expect(eventVisibleTo(event, "enemy", state)).toBe(true);
      expect(eventVisibleTo(event, "player", state)).toBe(false);
    }
    // The player answering its own play's prompts may see the card.
    const own = withBudget(board({ hand: [SEARCH.ascendingPair.id] }), 1);
    const result = engine.apply(own.state, "player", { kind: "play", card: own.ids.player.hand[0], from: "hand" }, HIGHEST);
    expect(result.events).toContainEqual(expect.objectContaining({
      kind: "feasibilityBounded",
      side: "player",
      purpose: expect.objectContaining({ source: own.ids.player.hand[0], cardId: SEARCH.ascendingPair.id }) as unknown,
    }));
  });

  it("reports the responses a decision left out unproven in the apply result when they pass automatically", () => {
    const setup = boardState(engine.catalog, {
      active: "player",
      phase: "day",
      player: { deck, hand: [v.event0.id], energy: 5 },
      enemy: { deck, hand: [SEARCH.revealingInterrupt.id, v.event1.id, v.vanilla1.id], energy: 5 },
    });
    const interrupt = setup.ids.enemy.hand[0];
    const action: Action = { kind: "play", card: setup.ids.player.hand[0], from: "hand" };
    // Discarding the event first dead-ends, so the Interrupt needs two runs.
    const tight = withBudget(setup, 1).state;
    const passed = run(tight, "player", action);
    const left: BoundedLegality = { version: tight.version + 1, side: "enemy", step: playStep(interrupt) };
    expect(passed.bounded).toEqual([left]);
    expect(passed.state.stack).toEqual([]);
    expect(legalityLogRecords(passed.bounded)).toEqual([{ event: "engine.feasibility", version: left.version, detail: { kind: "legalityBounded", side: "enemy", step: left.step } }]);
    const roomy = run(withBudget(setup, 2).state, "player", action);
    expect(roomy.bounded).toEqual([]);
    expect(engine.decision(roomy.state)).toEqual({ kind: "respond", side: "enemy" });
  });

  it("aborts a step whose rules code throws in a dry run, keeping the committed state, alike on retry", () => {
    const { state, ids } = board({ hand: [SEARCH.brokenPair.id] });
    const card = ids.player.hand[0];
    // Legality's first path, a = 0, pays; narrowing the first prompt searches a = 3.
    expect(plays(state)).toEqual([card]);
    const fold = createFoldAdapter(engine);
    for (let attempt = 0; attempt < 2; attempt++) {
      const outcome = fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: { kind: "play", card, from: "hand" } });
      if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected an engine error");
      expect(outcome.slice.committed).toBe(state);
      expect(outcome.slice.inFlight).toBeNull();
      expect(searchOf(state, card).nodes.size).toBe(0);
    }
    expect(() => engine.apply(state, "player", { kind: "play", card, from: "hand" }, HIGHEST)).toThrow();
  });
});

describe("assigning distinct cards to card costs", () => {
  const ids = (count: number, from = 0): InstanceId[] => Array.from({ length: count }, (_, index): InstanceId => `i${from + index}`);
  it("decides by matching for any number of demands", () => {
    expect(cardsAssignable(ids(40).map((id) => ({ count: 1, pool: [id] })))).toBe(true);
    // Forty demands for one card each from the same thirty-nine cards.
    expect(cardsAssignable(ids(40).map(() => ({ count: 1, pool: ids(39) })))).toBe(false);
    // Thirty-two demands, one of which competes for a card another needs alone.
    expect(cardsAssignable([...ids(31).map((id) => ({ count: 1, pool: [id] })), { count: 1, pool: ["i0"] }])).toBe(false);
    expect(cardsAssignable([...ids(31).map((id) => ({ count: 1, pool: [id] })), { count: 1, pool: ["i0", "i99"] }])).toBe(true);
  });

  it("needs as many distinct cards as each demand counts, reassigning cards where it must", () => {
    expect(cardsAssignable([{ count: 2, pool: ids(3) }, { count: 1, pool: ["i0"] }])).toBe(true);
    expect(cardsAssignable([{ count: 2, pool: ids(2) }, { count: 1, pool: ["i0"] }])).toBe(false);
    expect(cardsAssignable([{ count: 0, pool: [] }])).toBe(true);
    expect(cardsAssignable([])).toBe(true);
  });
});

/** Answers each prompt with its last legal answer: the highest number. */
const HIGHEST: AnswerSource = { answer: (prompt) => [...legalAnswers(prompt)].pop()! };

/** The default budget (`BATTLE.feasibilitySearchRuns`). */
const BATTLE_BUDGET = BATTLE.feasibilitySearchRuns;

/** The engine's memoized feasibility search of playing `card` from `state`. */
function searchOf(state: BattleState, card: InstanceId): StepSearch {
  return stepSearch(state, playStep(card), engine.catalog, engine.memo.searches);
}

/** `setup` with a feasibility budget of `budget` runs per step. */
function withBudget<T extends { state: BattleState }>(setup: T, budget: number): T {
  return { ...setup, state: { ...setup.state, config: { ...setup.state.config, feasibilitySearchRuns: budget } } };
}

/** Every ordering of `items`. */
function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, index) => permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest]));
}

/**
 * Follows every path of answers the step's prompts offer, suspending at each
 * prompt as the fold does, and returns the prompts met and the finished
 * runs. Every offered path must finish: none may dead-end or fail to pay.
 */
function offeredPaths(state: BattleState, step: Step): { prompts: Prompt[]; finished: number } {
  const prompts: Prompt[] = [];
  let finished = 0;
  const walk = (prefix: readonly RecordedAnswer[]): void => {
    const result = runStep(state, step, INTERACTIVE, engine.catalog, { prefix });
    if (result.kind === "done") {
      expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
      finished += 1;
      return;
    }
    prompts.push(result.prompt);
    const fingerprint = promptFingerprint(result.prompt);
    for (const value of legalAnswers(result.prompt)) walk([...result.answers, { fingerprint, value }]);
  };
  walk([]);
  return { prompts, finished };
}

function playStep(card: InstanceId): Step {
  return { kind: "play", card, from: "hand" };
}

/** A "your next card costs 1● more" effect on the player, as an opponent's tax leaves it. */
function taxNextCard(state: BattleState): EffectId {
  const id: EffectId = `e${state.nextEffect}`;
  state.nextEffect += 1;
  state.floating.push({ id, controller: "enemy", source: { kind: "avatar", side: "enemy" }, timestamp: 1, expiry: { at: "never" }, change: { kind: "cost", player: "player", filter: {}, amount: 1, next: true } });
  return id;
}

function sliceOf(state: BattleState): BattleSlice {
  return { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
}

function appliedSlice(outcome: ReturnType<ReturnType<typeof createFoldAdapter>["reduce"]>): BattleSlice {
  if (outcome.kind !== "applied") throw new Error(`bounced: ${outcome.reason}`);
  if (outcome.error !== null) throw new Error(outcome.error.message);
  return outcome.slice;
}

describe("legality by search", () => {
  it("narrows X to the values payable after cost modifications, though a play hook offers more (soak-792)", () => {
    // drawX's play hook offers X up to the energy available, ignoring the 1●
    // tax, so X = 2 leaves a 3● total against 2●. Legality found X = 0 and
    // the X answer then failed to pay after the commit point.
    const { state, ids } = board({ hand: [PROMPTING.drawX.id], energy: 2 });
    taxNextCard(state);
    const card = ids.player.hand[0];
    expect(plays(state)).toEqual([card]);
    const { prompts, finished } = offeredPaths(state, playStep(card));
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toMatchObject({ kind: "chooseNumber", min: 0, max: 1, purpose: { role: "chooseX" } });
    expect(finished).toBe(2);

    const raw = { kind: "chooseNumber", side: "player", purpose: prompts[0].purpose, cancellable: true, min: 0, max: 2 } as const;
    const answerX = (value: number): RecordedAnswer[] => [{ fingerprint: promptFingerprint(raw), value }];
    expect(searchCommitPoint(state, playStep(card), engine.catalog, answerX(2))).toEqual({ feasible: false, exhausted: false });
    expect(searchCommitPoint(state, playStep(card), engine.catalog, answerX(1))).toEqual({ feasible: true, exhausted: false });

    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const opened = appliedSlice(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: { kind: "play", card, from: "hand" } }));
    const prompt = fold.pending(opened)!.prompt;
    expect(fold.reduce(opened, { kind: "answer", side: "player", promptId: prompt.id, value: 2 })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    const paid = appliedSlice(fold.reduce(opened, { kind: "answer", side: "player", promptId: prompt.id, value: 1 }));
    expect(paid.committed.sides.player.currentEnergy).toBe(0);
    expect(paid.committed.stack[0]).toMatchObject({ instance: card, x: 1 });
  });

  it("answers X automatically when the cost modification leaves one payable value", () => {
    const { state, ids } = board({ hand: [PROMPTING.drawX.id], energy: 1 });
    taxNextCard(state);
    const result = playFirst(state, ids.player.hand[0]);
    expect(result.answers).toEqual([expect.objectContaining({ value: 0, auto: true })]);
    expect(result.state.sides.player.currentEnergy).toBe(0);
  });

  it("finds a target that leaves a Warrior to abandon, whichever character comes first, and offers only it", () => {
    for (const back of permutations([v.vanilla1.id, SEARCH.mage.id])) {
      const { state, ids } = board({ back, hand: [SEARCH.pumpAbandoningWarrior.id] });
      const card = ids.player.hand[0];
      const mage = ids.player.back[back.indexOf(SEARCH.mage.id)]!;
      const warrior = ids.player.back[back.indexOf(v.vanilla1.id)]!;
      expect(plays(state)).toEqual([card]);
      expect(offeredPaths(state, playStep(card)).finished).toBe(1);
      const result = playFirst(state, card);
      expect(result.state.stack[0]?.choices).toEqual([{ modes: [], targets: [[mage]] }]);
      expect(result.events).toContainEqual({ kind: "abandoned", instance: warrior, side: "player" });
    }
  });

  it("activates an ability whose target must leave a Warrior to abandon, in either order", () => {
    for (const back of permutations([SEARCH.pumpingMage.id, v.vanilla1.id])) {
      const { state, ids } = board({ back });
      const source = ids.player.back[back.indexOf(SEARCH.pumpingMage.id)]!;
      const step: Step = { kind: "activate", source, ability: 0 };
      expect(activations(state)).toEqual([{ kind: "activate", source, ability: 0 }]);
      const { prompts, finished } = offeredPaths(state, step);
      expect(finished).toBe(1);
      expect(prompts).toEqual([]);
    }
  });

  it("discards a card that is not the only event to reveal, in every hand order", () => {
    for (const hand of permutations([SEARCH.discardThenRevealEvent.id, v.event1.id, v.vanilla1.id])) {
      const { state, ids } = board({ hand });
      const card = ids.player.hand[hand.indexOf(SEARCH.discardThenRevealEvent.id)];
      const character = ids.player.hand[hand.indexOf(v.vanilla1.id)];
      expect(plays(state)).toContain(card);
      const result = playFirst(state, card);
      expect(result.state.sides.player.void).toEqual([character]);
      expect(offeredPaths(state, playStep(card)).finished).toBe(1);
    }
  });

  it("offers an alternative whose card costs need distinct cards when distinct cards exist", () => {
    for (const hand of permutations([SEARCH.discardRevealOrEnergy.id, v.event1.id, v.vanilla1.id])) {
      const { state, ids } = board({ hand });
      const card = ids.player.hand[hand.indexOf(SEARCH.discardRevealOrEnergy.id)];
      expect(plays(state)).toContain(card);
      expect(offeredPaths(state, playStep(card))).toEqual({ prompts: [], finished: 1 });
    }
    const { state, ids } = board({ hand: [SEARCH.discardRevealOrEnergy.id, v.event1.id] });
    expect(plays(state)).not.toContain(ids.player.hand[0]);
  });

  it("lists the allowed selections when no candidate list states them, and bounces the dead-end selection", () => {
    for (const hand of permutations([v.event1.id, v.event0.id, v.vanilla1.id])) {
      const { state, ids } = board({ hand: [SEARCH.discardTwoThenRevealEvent.id, ...hand] });
      const card = ids.player.hand[0];
      const [first, second, third] = ids.player.hand.slice(1);
      const events = [first, second, third].filter((id) => cardIdOf(state, id) !== v.vanilla1.id);
      const character = [first, second, third].find((id) => cardIdOf(state, id) === v.vanilla1.id)!;
      const { prompts, finished } = offeredPaths(state, playStep(card));
      expect(finished).toBe(2);
      expect(prompts[0]).toMatchObject({ kind: "chooseCards", min: 2, max: 2 });
      expect(new Set(prompts[0].kind === "chooseCards" ? prompts[0].allowed?.map((selection) => [...selection].sort().join()) : [])).toEqual(
        new Set(events.map((event) => [event, character].sort().join())),
      );
      const fold = createFoldAdapter(engine);
      const opened = appliedSlice(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: { kind: "play", card, from: "hand" } }));
      const pending = fold.pending(opened)!;
      expect(fold.reduce(opened, { kind: "answer", side: "player", promptId: pending.prompt.id, value: events })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
      const reloaded = JSON.parse(JSON.stringify(opened)) as BattleSlice;
      expect(createFoldAdapter(engine).pending(reloaded)).toEqual(pending);
      expect(promptView(pending.prompt, "player", pending.display)).toHaveProperty("allowed");
      expect(promptView(pending.prompt, "enemy", pending.display)).not.toHaveProperty("allowed");
    }
  });

  it("reports a play illegal when its search runs out, withholds unproven answers with an event, and logs both", () => {
    const tight = (hand: readonly CardId[]) => {
      const setup = board({ hand: [SEARCH.discardEachThenRevealEvent.id, ...hand] });
      return { ...setup, state: { ...setup.state, config: { ...setup.state.config, feasibilitySearchRuns: 2 } } };
    };
    // The first paths discard the event first; two runs settle only them.
    const late = tight([v.event1.id, v.vanilla1.id, v.vanilla2.id]);
    const lateCard = late.ids.player.hand[0];
    expect(plays(late.state)).not.toContain(lateCard);
    const moves = legalMoves(late.state, engine.catalog, "player", createLegalityMemo());
    expect(moves.bounded).toEqual([playStep(lateCard)]);
    expect(legalityLogRecords([{ version: late.state.version, side: "player", step: playStep(lateCard) }])).toEqual([
      { event: "engine.feasibility", version: late.state.version, detail: { kind: "legalityBounded", side: "player", step: playStep(lateCard) } },
    ]);

    // Legality's first path pays in one run, which proves its answer, the
    // first, for free; the second answer's search spends the last run, so
    // the event is left unexamined and withheld.
    const early = tight([v.vanilla1.id, v.vanilla2.id, v.event1.id]);
    const card = early.ids.player.hand[0];
    const [, one, two, theEvent] = early.ids.player.hand;
    expect(plays(early.state)).toContain(card);
    const records: EngineLogRecord[] = [];
    const fold = createFoldAdapter(engine, { log: (record) => records.push(record) });
    const opened = appliedSlice(fold.reduce(sliceOf(early.state), { kind: "battleAction", side: "player", action: { kind: "play", card, from: "hand" } }));
    const { prompt } = fold.pending(opened)!;
    expect(prompt).toMatchObject({ kind: "chooseCards", candidates: [one, two], purpose: { role: "discardCost" } });
    const bounded: EngineEvent = { kind: "feasibilityBounded", side: "player", purpose: prompt.purpose, unproven: 0, truncated: true };
    expect(records).toContainEqual({ event: "engine.feasibility", version: early.state.version, detail: bounded });
    expect(fold.reduce(opened, { kind: "answer", side: "player", promptId: prompt.id, value: [theEvent] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
  });

  it("aborts a recorded answer the narrowed prompt withholds as an engine error, keeping the committed state", () => {
    const { state, ids } = board({ hand: [SEARCH.discardThenRevealEvent.id, v.event1.id, v.vanilla1.id, v.vanilla2.id] });
    const card = ids.player.hand[0];
    const theEvent = ids.player.hand[1];
    const fold = createFoldAdapter(engine);
    const opened = appliedSlice(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: { kind: "play", card, from: "hand" } }));
    // A stale or forged record: the event discarded, leaving nothing to reveal.
    const forged: BattleSlice = { ...opened, inFlight: { ...opened.inFlight!, answers: [{ fingerprint: promptFingerprint(fold.pending(opened)!.prompt), value: [theEvent] }] } };
    expect(fold.pending(forged)).toBeNull();
    const outcome = fold.reduce(forged, { kind: "battleAction", side: "player", action: { kind: "pass" } });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected an engine error");
    expect(stateHash(outcome.slice.committed)).toBe(stateHash(state));
    expect(outcome.slice.inFlight).toBeNull();
  });
});
