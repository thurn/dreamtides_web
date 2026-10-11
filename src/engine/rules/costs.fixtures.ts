/**
 * Shared synthetic fixtures for the cost tests: the cost fixture cards, whose
 * first-legal answer path dead-ends while another path pays, the engine over
 * them, and its board, action, and fold helpers.
 */
import { expect } from "vitest";
import { printedCardId, type EngineCardDefinition } from "../catalog";
import type { CardSubtype } from "../../types/card-identity";
import {
  abandonCost,
  abandonSelfCost,
  activated,
  additionalCost,
  characterYouControl,
  choiceCost,
  countersCost,
  discardCost,
  discardCostFilter,
  energy,
  energyX,
  event,
  exhaustSelf,
  optionalCost,
  plus,
  revealCost,
  target,
  x,
} from "../dsl/builders";
import * as p from "../effects/primitives";
import { createEngine } from "../engine";
import { createFoldAdapter, type BattleSlice } from "../fold/slice";
import type { Answer, ChooseNumberPrompt } from "../prompts/types";
import { opponent, type InstanceId, type Side } from "../state/ids";
import type { BattleState } from "../state/types";
import { Infeasible } from "../steps/errors";
import { ScriptedSource } from "../steps/sources";
import type { StepContext } from "../steps/types";
import { boardState, type SideSetup } from "../testing/board";
import { invariantViolations } from "../testing/invariants";
import { STACK_CARDS, SYNTHETIC_EMBLEMS } from "../testing/stack-cards";
import { PROMPTING } from "../testing/synthetic-effects";
import { SYNTHETIC, syntheticId, testCatalog } from "../testing/synthetic-cards";
import type { Action } from "./actions";
import { planCosts } from "./costs";

export function fixture(index: number, cardType: "character" | "event", abilities: EngineCardDefinition["abilities"], subtype: CardSubtype = "Warrior"): EngineCardDefinition {
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
export const PAIR_MAX = 7;
// eslint-disable-next-line dreamtides/engine-purity -- counts every run of a play step, dry or real
export let pairRuns = 0;

/** Restarts the count of play-step runs. */
export function resetPairRuns(): void {
  // eslint-disable-next-line dreamtides/engine-purity -- counts every run of a play step, dry or real
  pairRuns = 0;
}

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
export const SEARCH = {
  playTimeX: { ...fixture(31, "event", () => [event(p.gainSpark(target(characterYouControl({ costAtLeast: x(), costAtMost: x() })), 1))]), costs: [energyX(0)] },
  modalPlayTimeX: { ...fixture(32, "event", () => [event(p.chooseOne(p.gainSpark(target(characterYouControl({ costAtLeast: x(), costAtMost: x() })), 1), p.gainPoints(1)))]), costs: [energyX(0)] },
  payingPlayTimeX: { ...fixture(33, "event", () => [additionalCost(abandonCost({ costAtLeast: x(), costAtMost: x() })), event(p.gainSpark(target(characterYouControl({ costAtLeast: x(), costAtMost: x() })), 1))]), costs: [energyX(0)] },
  storedActivationX: fixture(34, "character", () => [activated([energyX(0), abandonCost({ costAtLeast: x(), costAtMost: x() })], p.gainSpark(target(characterYouControl({ costAtLeast: x(), costAtMost: x() })), 1))]),
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

export const engine = createEngine(testCatalog([...STACK_CARDS, ...Object.values(SEARCH), PROMPTING.drawX], SYNTHETIC_EMBLEMS));
export const v = SYNTHETIC;
export const deck = [v.vanilla1.id, v.vanilla1.id, v.vanilla1.id];

/** The enemy holds an Interrupt, so it gets a window to respond and the played item waits on the stack. */
export function board(player: SideSetup) {
  return boardState(engine.catalog, {
    active: "player",
    phase: "day",
    player: { deck, ...player },
    enemy: { deck, hand: [v.interruptEvent.id], energy: 5 },
  });
}

export function run(state: BattleState, side: Side, action: Action, answers: readonly Answer[] = []) {
  const source = new ScriptedSource(answers);
  const result = engine.apply(state, side, action, source);
  source.assertExhausted();
  expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  return result;
}

export function playFirst(state: BattleState, card: InstanceId, answers: readonly Answer[] = []) {
  return run(state, "player", { kind: "play", card, from: "hand" }, answers);
}

/** The enemy passes, resolving the top of the stack. */
export function resolve(state: BattleState) {
  return run(state, "enemy", { kind: "pass" });
}

export function plays(state: BattleState): InstanceId[] {
  return engine.legalActions(state, "player").flatMap((action) => (action.kind === "play" ? [action.card] : []));
}

export function activations(state: BattleState) {
  return engine.legalActions(state, "player").filter((action) => action.kind === "activate");
}

export function sliceOf(state: BattleState): BattleSlice {
  return { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
}

export function appliedSlice(outcome: ReturnType<ReturnType<typeof createFoldAdapter>["reduce"]>): BattleSlice {
  if (outcome.kind !== "applied") throw new Error(`bounced: ${outcome.reason}`);
  if (outcome.error !== null) throw new Error(outcome.error.message);
  return outcome.slice;
}
