/**
 * Additional costs of cards and the remaining cost kinds: alternatives,
 * optional costs, ⧗, banish from void, reveal; and legality by search, which
 * offers a play exactly when some path of answers reaches the commit point
 * with payable costs, and only answers that keep such a path open.
 */
import { describe, expect, it } from "vitest";
import { printedCardId, type EngineCardDefinition } from "../catalog";
import type { CardSubtype } from "../../types/card-identity";
import { abandonCost, abandonSelfCost, activated, additionalCost, characterYouControl, choiceCost, countersCost, discardCost, discardCostFilter, energy, energyX, event, exhaustSelf, optionalCost, plus, revealCost, target, x } from "../dsl/builders";
import * as p from "../effects/primitives";
import { createEngine, IllegalAction } from "../engine";
import { eventVisibleTo, type EngineEvent } from "../events";
import { createFoldAdapter, type BattleSlice } from "../fold/slice";
import { legalityLogRecords, type EngineLogRecord } from "../log";
import { isLegalAnswer, legalAnswers } from "../prompts/answers";
import { promptFingerprint } from "../prompts/fingerprint";
import type { Answer, ChooseCardsPrompt, ChooseNumberPrompt, ChooseTargetsPrompt, Prompt } from "../prompts/types";
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
import { cardsAssignable, payCosts, planCosts } from "./costs";
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
  abandonSelf: fixture(11, "character", () => [activated([abandonSelfCost()], p.draw(1, "you", { ephemeral: true }))]),
  targetAndAbandonSelf: fixture(12, "character", () => [activated([abandonSelfCost()], p.gainSpark(target(characterYouControl()), 1))]),
  abandonSelfTwice: fixture(13, "character", () => [activated([abandonSelfCost(), abandonSelfCost()], p.draw(1))]),
  eventAbandoningSelf: fixture(14, "event", () => [additionalCost(abandonSelfCost()), event(p.draw(1))]),
  filteredDiscover: fixture(15, "character", () => [activated([energy(1), discardCostFilter({ cardType: "character" }, { captureCost: true })], p.discover({ cardType: "character" }, { costExactly: x() }))]),
  exhaustedDiscover: fixture(16, "character", () => [activated([exhaustSelf(), discardCostFilter({ cardType: "character" }, { captureCost: true })], p.discover({ cardType: "character" }, { costExactly: plus(x(), 1) }))]),
  variableDiscard: { ...fixture(17, "event", (variant) => [additionalCost(discardCostFilter({}, { count: "x" })), event(p.sequence(p.draw(x()), p.draw(variant.amplified ? 2 : 1)))]), costs: [energy(1)] },
  filteredCosts: fixture(18, "event", () => [additionalCost(discardCostFilter({ cardType: "character" }), discardCostFilter({ subtype: "Warrior" })), event(p.gainPoints(1))]),
  discardAndTarget: fixture(19, "event", () => [additionalCost(discardCostFilter({ cardType: "character" })), event(p.gainSpark(target(characterYouControl()), 1))]),
  combinedX: { ...fixture(20, "event", () => [additionalCost(discardCostFilter({}, { count: "x" })), event(p.gainPoints(x()))]), costs: [energyX(0)] },
  competingX: { ...fixture(21, "event", () => [additionalCost(discardCostFilter({ cardType: "character" }, { captureCost: true })), event(p.gainPoints(x()))]), costs: [energyX(0)] },
  capturedThenVariable: fixture(22, "event", () => [additionalCost(discardCostFilter({ cardType: "character" }, { captureCost: true }), optionalCost(discardCostFilter({}, { count: "x" }))), event(p.gainPoints(x()))]),
  legacyDiscard: fixture(23, "event", () => [additionalCost({ cost: "discard", count: 1 }), event(p.gainPoints(1))]),
  canonicalDiscard: fixture(24, "event", () => [additionalCost(discardCostFilter({})), event(p.gainPoints(1))]),
  repeatedDiscard: fixture(25, "event", () => {
    const same = discardCostFilter({}, { count: "x" });
    return [additionalCost(same, same), event(p.gainPoints(plus(x(), 1)))];
  }),
  guardedManualCost: { ...fixture(26, "event", () => []), synthetic: { play(ctx, source) {
    const plan = planCosts(ctx, "player", source, [discardCostFilter({}, { count: "x" })], null, role => ({ source, cardId: syntheticId(0xf1a), ability: 0, role }), [source]);
    if (plan.x !== 2) throw new Infeasible("manual cost requires two discarded cards");
    return {};
  } } },
  invalidFinalProof: { ...fixture(27, "event", () => []), synthetic: { play(ctx, source) {
    planCosts(ctx, "player", source, [discardCostFilter({}, { count: "x" })], null, role => ({ source, cardId: syntheticId(0xf1b), ability: 0, role }), [source], undefined, { endsPlayTime: true });
    ctx.choose<ChooseNumberPrompt>({ kind: "chooseNumber", side: "player", purpose: { source, cardId: syntheticId(0xf1b), ability: 0, role: "chooseX" }, min: 0, max: 1 });
    return {};
  } } },
  resourceDiscard: fixture(28, "character", () => [activated([energy(1), countersCost(1), exhaustSelf(), discardCostFilter({}, { count: "x" })], p.gainPoints(plus(x(), 1)))]),
  duplicateExhaustDiscard: fixture(29, "character", () => [activated([exhaustSelf(), exhaustSelf(), discardCostFilter({}, { count: "x" })], p.gainPoints(plus(x(), 1)))]),
  nestedExhaustDiscard: fixture(30, "character", () => [activated([exhaustSelf(), optionalCost(exhaustSelf()), discardCostFilter({}, { count: "x" })], p.gainPoints(plus(x(), 1)))]),
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


describe("self-abandon costs", () => {
  it("abandons only its source from either rank, even when identical allies and enemies are present", () => {
    for (const rank of ["front", "back"] as const) {
      const { state, ids } = boardState(engine.catalog, {
        active: "player", phase: "day",
        player: { deck, [rank]: [SEARCH.abandonSelf.id, SEARCH.abandonSelf.id] },
        enemy: { deck, back: [SEARCH.abandonSelf.id], hand: [v.interruptEvent.id], energy: 5 },
      });
      const source = ids.player[rank][0]!;
      const ally = ids.player[rank][1]!;
      const activated = run(state, "player", { kind: "activate", source, ability: 0 });
      expect(activated.state.instances[source].zone).toBe("void");
      expect(activated.state.instances[ally].zone).toBe("play");
      expect(activated.state.instances[ids.enemy.back[0]!].zone).toBe("play");
      expect(activated.events.filter((item) => item.kind === "abandoned")).toEqual([{ kind: "abandoned", side: "player", instance: source }]);
      expect(activated.answers).toEqual([expect.objectContaining({ auto: true, value: [source] })]);
      const reloaded = JSON.parse(JSON.stringify(activated.state)) as BattleState;
      const done = resolve(reloaded);
      expect(done.state.sides.player.hand).toEqual([ids.player.deck[0]]);
      expect(done.state.instances[ids.player.deck[0]].status.ephemeral).toBe(true);
      expect(activations(done.state).some((action) => action.source === source)).toBe(false);
      expect(() => run(done.state, "player", { kind: "activate", source, ability: 0 })).toThrow(IllegalAction);
      const ended = run(run(run(done.state, "player", { kind: "pass" }).state, "enemy", { kind: "pass" }).state, "player", { kind: "pass" });
      expect(ended.state.sides.player.banished).toContain(ids.player.deck[0]);
    }
  });

  it("excludes the self-paying source from targets and cannot pay it twice or pay it from a hand", () => {
    const { state, ids } = board({ back: [SEARCH.targetAndAbandonSelf.id, v.vanilla1.id, SEARCH.abandonSelfTwice.id], hand: [SEARCH.eventAbandoningSelf.id] });
    const source = ids.player.back[0]!;
    const ally = ids.player.back[1]!;
    const fold = createFoldAdapter(engine);
    const opened = appliedSlice(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: { kind: "activate", source, ability: 0 } }));
    const pending = fold.pending(opened)!;
    expect((pending.prompt as ChooseTargetsPrompt).candidates).toEqual(ids.player.back.slice(1));
    const before = stateHash(opened.committed);
    expect(fold.reduce(opened, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [source] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(stateHash(opened.committed)).toBe(before);
    const done = appliedSlice(fold.reduce(opened, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ally] }));
    const item = done.committed.stack[0];
    if (item.kind !== "ability") throw new Error("expected an ability on the stack");
    expect(item.choices.targets).toEqual([[ally]]);
    expect(done.committed.instances[source].zone).toBe("void");
    expect(done.committed.instances[ally].zone).toBe("play");
    expect(invariantViolations(done.committed, engine.catalog)).toEqual([]);
    expect(activations(state).some((action) => action.source === ids.player.back[2])).toBe(false);
    expect(plays(state)).not.toContain(ids.player.hand[0]);
    const alone = board({ back: [SEARCH.targetAndAbandonSelf.id] });
    expect(activations(alone.state)).toEqual([]);
  });

  it("rejects foreign actors and sources outside play without substituting another controlled character", () => {
    const { state, ids } = board({ back: [v.vanilla1.id], hand: [SEARCH.abandonSelf.id], void: [SEARCH.abandonSelf.id] });
    const before = stateHash(state);
    for (const source of [...ids.player.hand, ...ids.player.void]) {
      expect(() => run(state, "player", { kind: "activate", source, ability: 0 })).toThrow(IllegalAction);
    }
    const inPlay = board({ back: [SEARCH.abandonSelf.id, v.vanilla1.id] });
    expect(() => run(inPlay.state, "enemy", { kind: "activate", source: inPlay.ids.player.back[0]!, ability: 0 })).toThrow(IllegalAction);
    expect(stateHash(state)).toBe(before);
  });
});

describe("filtered discard payment values", () => {
  it("filters current characteristics, captures copiable cost before payment, and discovers exactly that cost or one higher", () => {
    for (const higher of [false, true]) {
      const setup = board({ back: [higher ? SEARCH.exhaustedDiscover.id : SEARCH.filteredDiscover.id], hand: [{ cardId: v.event1.id, deckMods: { sparkBonus: 0, costReduction: 1, fast: false, reclaim: null, typeChange: { cardType: "character", subtype: "Warrior" } } }, v.vanilla2.id, v.vanilla2.id, v.event0.id], energy: 1, deck: [SEARCH.mage.id, v.vanilla1.id, v.vanilla2.id] });
      const { state, ids } = setup;
      const source = ids.player.back[0]!;
      const fold = createFoldAdapter(engine);
      const opened = appliedSlice(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: { kind: "activate", source, ability: 0 } }));
      const prompt = fold.pending(opened)!.prompt as ChooseCardsPrompt;
      expect(prompt.candidates).toEqual(ids.player.hand.slice(0, 3));
      expect(prompt.candidates[1]).not.toBe(prompt.candidates[2]);
      const paid = run(state, "player", { kind: "activate", source, ability: 0 }, [[ids.player.hand[0]]]);
      expect(paid.state.stack[0]?.x).toBe(0);
      expect(paid.state.sides.player.currentEnergy).toBe(higher ? 1 : 0);
      expect(paid.state.instances[source].status.exhausted).toBe(higher);
      expect(paid.events).toContainEqual({ kind: "discarded", side: "player", instance: ids.player.hand[0] });
      const saved = JSON.parse(JSON.stringify(paid.state)) as BattleState;
      saved.instances[ids.player.hand[0]] = { ...saved.instances[ids.player.hand[0]], variant: { amplified: false } };
      const result = resolve(saved);
      expect(result.state.sides.player.hand).toContain(higher ? ids.player.deck[1] : ids.player.deck[0]);
      expect(result.state.sides.player.hand).not.toContain(ids.player.deck[2]);
    }
  });

  it("allows zero through the remaining hand count without charging energy for X, in both variants", () => {
    for (const amplified of [false, true]) for (const count of [0, 1, 2]) {
      const { state, ids } = board({ hand: [{ cardId: SEARCH.variableDiscard.id, amplified }, v.vanilla1.id, v.vanilla1.id], energy: 1, deck: [v.vanilla2.id, v.vanilla2.id, v.vanilla2.id, v.vanilla2.id] });
      const paid = playFirst(state, ids.player.hand[0], [ids.player.hand.slice(1, count + 1)]);
      expect(paid.state.stack[0]?.x).toBe(count);
      expect(paid.state.sides.player.currentEnergy).toBe(0);
      expect(new Set(paid.state.sides.player.void)).toEqual(new Set(ids.player.hand.slice(1, count + 1)));
      const done = resolve(JSON.parse(JSON.stringify(paid.state)) as BattleState);
      expect(done.state.sides.player.hand).toHaveLength(2 - count + count + (amplified ? 2 : 1));
      const alone = board({ hand: [SEARCH.variableDiscard.id], energy: 1 });
      expect(playFirst(alone.state, alone.ids.player.hand[0]).state.stack[0]?.x).toBe(0);
    }
  });

  it("keeps filtered costs distinct and excludes targets, the played source, and cards outside the hand", () => {
    const short = board({ hand: [SEARCH.filteredCosts.id, v.vanilla1.id], back: [v.vanilla1.id], void: [v.vanilla1.id] });
    expect(plays(short.state)).not.toContain(short.ids.player.hand[0]);
    const enough = board({ hand: [SEARCH.filteredCosts.id, SEARCH.mage.id, v.vanilla1.id] });
    const paid = playFirst(enough.state, enough.ids.player.hand[0]);
    expect(new Set(paid.state.sides.player.void)).toEqual(new Set(enough.ids.player.hand.slice(1)));
    const foeOnly = board({ back: [SEARCH.filteredDiscover.id], hand: [v.event1.id], energy: 1 });
    expect(activations(foeOnly.state)).toEqual([]);
    const targeted = board({ hand: [SEARCH.discardAndTarget.id, v.vanilla1.id], back: [v.vanilla1.id] });
    const result = playFirst(targeted.state, targeted.ids.player.hand[0]);
    const item = result.state.stack[0];
    if (item.kind !== "card") throw new Error("expected a card stack item");
    expect(item.choices[0].targets).toEqual([[targeted.ids.player.back[0]]]);
    expect(result.state.sides.player.void).toEqual([targeted.ids.player.hand[1]]);
  });

  it("uses one consistent X binding when an energy-X cost is present", () => {
    const variable = board({ hand: [SEARCH.combinedX.id, v.vanilla1.id, v.vanilla1.id], energy: 2 });
    const paid = playFirst(variable.state, variable.ids.player.hand[0], [1, [variable.ids.player.hand[1]]]);
    expect(paid.state.stack[0]?.x).toBe(1);
    expect(paid.state.sides.player.currentEnergy).toBe(1);
    expect(resolve(paid.state).state.sides.player.score).toBe(1);
    const captured = board({ hand: [SEARCH.competingX.id, v.vanilla2.id], energy: 3 });
    const fold = createFoldAdapter(engine);
    const opened = appliedSlice(fold.reduce(sliceOf(captured.state), { kind: "battleAction", side: "player", action: { kind: "play", card: captured.ids.player.hand[0], from: "hand" } }));
    // Only X=2 can pay the selected card's captured cost; this sole legal answer auto-commits.
    expect(opened.committed.stack[0]?.x).toBe(2);
    expect(opened.committed.sides.player.currentEnergy).toBe(1);
  });

  it("uses a captured X for subsequent variable costs and optional-cost affordability", () => {
    for (const enough of [false, true]) {
      const { state, ids } = board({ hand: [SEARCH.capturedThenVariable.id, v.vanilla2.id, v.vanilla2.id, ...(enough ? [v.vanilla2.id] : [])] });
      const result = playFirst(state, ids.player.hand[0], [[ids.player.hand[1]], ...(enough ? [true] : [])]);
      expect(result.state.stack[0]).toMatchObject({ x: 2, optionalPaid: [enough] });
      expect(result.state.sides.player.void).toHaveLength(enough ? 3 : 1);
      expect(result.answers.filter((answer) => typeof answer.value === "boolean")).toHaveLength(enough ? 1 : 0);
    }
  });

  it("keeps filtered and variable prompts stable through reload and rejects stale, foreign, concurrent, repeated, and out-of-range input", () => {
    for (const variable of [false, true]) {
      const { state, ids } = board({ back: [SEARCH.filteredDiscover.id], hand: [SEARCH.variableDiscard.id, v.vanilla1.id, v.vanilla1.id, v.event1.id], energy: 1 });
      const fold = createFoldAdapter(engine, { checkEventPrefix: true });
      const action: Action = variable ? { kind: "play", card: ids.player.hand[0], from: "hand" } : { kind: "activate", source: ids.player.back[0]!, ability: 0 };
      const opened = appliedSlice(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action }));
      const pending = fold.pending(opened)!;
      const saved = JSON.parse(JSON.stringify(opened)) as BattleSlice;
      expect(createFoldAdapter(engine).pending(saved)).toEqual(pending);
      expect(stateHash(opened.committed)).toBe(stateHash(state));
      expect(fold.reduce(opened, { kind: "battleAction", side: "player", action })).toEqual({ kind: "bounced", reason: "stepInFlight" });
      for (const side of ["enemy", "player"] as const) {
        expect(fold.reduce(opened, { kind: "answer", side, promptId: pending.prompt.id, value: [ids.enemy.hand[0]] })).toEqual({ kind: "bounced", reason: side === "enemy" ? "notYourPrompt" : "illegalAnswer" });
      }
      expect(fold.reduce(opened, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.player.hand[1], ids.player.hand[1]] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
      if (!variable) expect(fold.reduce(opened, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.player.hand[3]] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
      expect(fold.reduce(opened, { kind: "answer", side: "player", promptId: pending.prompt.id, value: ids.player.hand })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
      expect(fold.reduce(opened, { kind: "cancel", side: "enemy", promptId: pending.prompt.id })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
      const cancelled = appliedSlice(fold.reduce(saved, { kind: "cancel", side: "player", promptId: pending.prompt.id }));
      expect(cancelled.committed).toEqual(state);
      expect(cancelled.inFlight).toBeNull();
      expect(fold.reduce(cancelled, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.player.hand[1]] })).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
      const reopened = appliedSlice(fold.reduce(cancelled, { kind: "battleAction", side: "player", action }));
      expect(fold.pending(reopened)!.prompt.id).not.toBe(pending.prompt.id);
      expect(fold.reduce(reopened, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.player.hand[1]] })).toEqual({ kind: "bounced", reason: "stalePrompt" });
      const answered = appliedSlice(fold.reduce(saved, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.player.hand[1]] }));
      expect(answered.committed.instances[ids.player.hand[1]].zone).toBe("void");
      expect(fold.reduce(answered, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.player.hand[1]] })).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    }
  });

  it("rolls back payment state when rules code fails after paying", () => {
    const failing: EngineCardDefinition = {
      ...SEARCH.variableDiscard, id: syntheticId(0xf30),
      synthetic: { play(ctx, source) {
        const plan = planCosts(ctx, "player", source, [energy(1), discardCostFilter({ cardType: "character" }, { captureCost: true })], null, (role) => ({ source, cardId: syntheticId(0xf30), ability: 0, role }), [source]);
        ctx.commitPoint();
        payCosts(ctx, "player", source, plan);
        throw new Error("synthetic failure after payment");
      } },
    };
    const catalog = testCatalog([failing]);
    const { state, ids } = boardState(catalog, { active: "player", phase: "day", player: { hand: [failing.id, v.vanilla2.id], energy: 1 } });
    const before = stateHash(state);
    const observed: EngineEvent[] = [];
    expect(() => runStep(state, { kind: "play", card: ids.player.hand[0], from: "hand" }, new ScriptedSource([]), catalog, { observeEvent: (event) => observed.push(event) })).toThrow("synthetic failure after payment");
    expect(observed).toContainEqual({ kind: "discarded", side: "player", instance: ids.player.hand[1] });
    expect(observed).toContainEqual(expect.objectContaining({ kind: "energyChanged", side: "player", current: 0, max: 1 }));
    expect(stateHash(state)).toBe(before);
  });
});


describe("final discard choice coverage", () => {
  it.each([[9, 1], [9, 256], [10, 1], [10, 256]])("keeps every subset answerable with %i hand cards and a synthetic budget of %i", (size, budget) => {
    for (const reversed of [false, true]) {
      const setup = board({ hand: [SEARCH.variableDiscard.id, ...Array.from({ length: size }, () => v.vanilla1.id)], energy: 1 });
      const state = { ...setup.state, config: { ...setup.state.config, feasibilitySearchRuns: budget } };
      if (reversed) state.sides.player.hand.reverse();
      const card = setup.ids.player.hand[0];
      const fold = createFoldAdapter(engine);
      const opened = appliedSlice(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: { kind: "play", card, from: "hand" } }));
      const pending = fold.pending(opened)!;
      const prompt = pending.prompt as ChooseCardsPrompt;
      const raw = { ...prompt, max: size, allowed: undefined };
      for (const selection of legalAnswers(raw)) {
        expect(isLegalAnswer(prompt, selection)).toBe(true);
      }
      for (let count = 0; count <= size; count++) {
        const cards = [...setup.ids.player.hand.slice(1)].reverse().slice(0, count);
        const paid = appliedSlice(fold.reduce(opened, { kind: "answer", side: "player", promptId: pending.prompt.id, value: cards }));
        expect(paid.committed.stack[0]?.x).toBe(count);
        expect(paid.committed.sides.player.currentEnergy).toBe(0);
        expect(new Set(paid.committed.sides.player.void)).toEqual(new Set(cards));
        expect(new Set(paid.committed.sides.player.hand)).toEqual(new Set(setup.ids.player.hand.slice(1).filter(id => !cards.includes(id))));
      }
    }
  });
});


it("uses one canonical discard builder and accepts legacy missing-filter costs", () => {
  expect(discardCost(2)).toEqual(discardCostFilter({}, { count: 2 }));
  for (const definition of [SEARCH.legacyDiscard, SEARCH.canonicalDiscard]) {
    const { state, ids } = board({ hand: [definition.id, v.vanilla1.id] });
    expect(playFirst(state, ids.player.hand[0]).state.sides.player.void).toEqual([ids.player.hand[1]]);
  }
});

it("guards a nonterminal repeated cost object and manual plans with later constraints", () => {
  const repeated = board({ hand: [SEARCH.repeatedDiscard.id, v.vanilla1.id, v.vanilla1.id] });
  const fold = createFoldAdapter(engine);
  const opened = appliedSlice(fold.reduce(sliceOf(repeated.state), { kind: "battleAction", side: "player", action: { kind: "play", card: repeated.ids.player.hand[0], from: "hand" } }));
  const prompt = fold.pending(opened)!.prompt;
  expect(isLegalAnswer(prompt, repeated.ids.player.hand.slice(1))).toBe(false);
  const paid = playFirst(repeated.state, repeated.ids.player.hand[0], [[repeated.ids.player.hand[1]]]);
  expect(paid.state.stack[0]?.x).toBe(1);
  expect(new Set(paid.state.sides.player.void)).toEqual(new Set(repeated.ids.player.hand.slice(1)));
  const manual = board({ hand: [SEARCH.guardedManualCost.id, v.vanilla1.id, v.vanilla1.id] });
  expect(playFirst(manual.state, manual.ids.player.hand[0]).answers[0].value).toEqual(manual.ids.player.hand.slice(1));
});

it("rejects an unexpected precommit prompt after a universal proof without committing state", () => {
  const { state, ids } = board({ hand: [SEARCH.invalidFinalProof.id, v.vanilla1.id, v.vanilla1.id] });
  const fold = createFoldAdapter(engine);
  const opened = appliedSlice(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } }));
  const prompt = fold.pending(opened)!.prompt;
  const outcome = fold.reduce(opened, { kind: "answer", side: "player", promptId: prompt.id, value: [] });
  if (outcome.kind !== "applied") throw new Error("expected a failed attempted play");
  expect(outcome.error).not.toBeNull();
  expect(outcome.slice.committed).toBe(state);
  expect(outcome.slice.inFlight).toBeNull();
});

it("preserves full final-discard choices and payment after a cold fold reload", () => {
  const { state, ids } = board({ hand: [SEARCH.variableDiscard.id, v.vanilla1.id, v.vanilla1.id], energy: 1 });
  const fold = createFoldAdapter(engine);
  const opened = appliedSlice(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } }));
  const pending = fold.pending(opened)!;
  const cold = createFoldAdapter(createEngine(engine.catalog));
  const saved = JSON.parse(JSON.stringify(opened)) as BattleSlice;
  expect(cold.pending(saved)).toEqual(pending);
  for (const value of legalAnswers(pending.prompt)) {
    const input = { kind: "answer", side: "player", promptId: pending.prompt.id, value } as const;
    expect(cold.reduce(saved, input)).toEqual(fold.reduce(opened, input));
  }
});

it("offers terminal discard only with payable resources and reserves exhaustion across nested costs", () => {
  for (const blocked of ["energy", "counters", "exhaustion", null]) {
    const { state, ids } = board({ back: [SEARCH.resourceDiscard.id], hand: [v.vanilla1.id, v.vanilla1.id], energy: blocked === "energy" ? 0 : 1 });
    const source = ids.player.back[0]!;
    state.instances[source].status.counters = blocked === "counters" ? 0 : 1;
    state.instances[source].status.exhausted = blocked === "exhaustion";
    const action = { kind: "activate", source, ability: 0 } as const;
    expect(activations(state)).toEqual(blocked === null ? [action] : []);
    if (blocked === null) {
      const paid = run(state, "player", action, [ids.player.hand]);
      expect(paid.state.stack[0]?.x).toBe(2);
      expect(paid.state.instances[source].status).toMatchObject({ counters: 0, exhausted: true });
      expect(paid.state.sides.player.currentEnergy).toBe(0);
      expect(new Set(paid.state.sides.player.void)).toEqual(new Set(ids.player.hand));
    } else {
      const fold = createFoldAdapter(engine);
      const before = stateHash(state);
      const slice = sliceOf(state);
      expect(fold.reduce(slice, { kind: "battleAction", side: "player", action })).toMatchObject({ kind: "bounced" });
      expect(stateHash(slice.committed)).toBe(before);
      expect(slice.inFlight).toBeNull();
    }
  }
  const twice = board({ back: [SEARCH.duplicateExhaustDiscard.id], hand: [v.vanilla1.id] });
  expect(activations(twice.state)).toEqual([]);
  const nested = board({ back: [SEARCH.nestedExhaustDiscard.id], hand: [v.vanilla1.id, v.vanilla1.id] });
  const action = { kind: "activate", source: nested.ids.player.back[0]!, ability: 0 } as const;
  const paid = run(nested.state, "player", action, [nested.ids.player.hand]);
  expect(paid.state.stack[0]).toMatchObject({ x: 2, optionalPaid: [false] });
  expect(paid.state.instances[action.source].status.exhausted).toBe(true);
});
