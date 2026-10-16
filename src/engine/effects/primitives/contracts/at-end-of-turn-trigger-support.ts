/** Shared synthetic fixtures for the `atEndOfTurn` contracts. */
import { expect } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { characterYouControl, energy, energyX, enemyCharacter, event, everyIn, target, x } from "../../../dsl/builders";
import type { CardCost, CardFilter, ZoneEverySpec } from "../../../dsl/types";
import { atEndOfTurn, triggered } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import type { EngineEvent } from "../../../events";
import type { Answer, Prompt } from "../../../prompts/types";
import type { InstanceId } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { nextAutomaticStep, runToDecision } from "../../../steps/driver";
import type { AnswerSource } from "../../../steps/types";
import { unannouncedChanges } from "../../../testing/announced-changes";
import { boardState, type SideSetup } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { eventRedactionViolations } from "../../../testing/redaction";
import { syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { passUntil, type Observed } from "../../../testing/trigger-harness";
import type { ResolvingEffect } from "../../registry";
import { banishCards } from "../banish-cards";
import { costModifier } from "../cost-modifier";
import { dissolve } from "../dissolve";
import { draw } from "../draw";
import { delayed } from "../floating-trigger";
import { gainControl } from "../gain-control";
import { gainPoints } from "../gain-points";
import { gainSpark } from "../gain-spark";
import { materialize } from "../materialize";
import { materializeFigmentCopy } from "../materialize-figment-copy";
import { returnToHand } from "../return-to-hand";
import { sequence } from "../sequence";
import { takeExtraTurn } from "../take-extra-turn";
import { capturedCards, withMaterialized } from "../with-materialized";
import { deck, v } from "./cards-support";

const id = (index: number) => syntheticId(0xe0e000 + index);
const spell = (index: number, effect: ResolvingEffect, costs: readonly CardCost[] = [energy(0)], speed: "standard" | "interrupt" = "standard"): EngineCardDefinition => ({
  id: id(index), cardType: "event", costs, spark: null, subtype: "", speed, status: "authored", abilities: () => [event(effect)],
});
const watcher = (index: number, effect: Parameters<typeof triggered>[0]): EngineCardDefinition => ({
  id: id(index), cardType: "character", costs: [energy(9)], spark: 1, subtype: "Warrior", speed: "standard", status: "authored",
  abilities: () => [triggered(effect, gainPoints(1))],
});

const characters: CardFilter = { cardType: "character" };
/** "Materialize each character in your void whose cost is at most `bound`. Banish them at end of turn." */
const borrowing = (bound?: ZoneEverySpec["costAtMost"], then: ResolvingEffect = banishCards([capturedCards()])) =>
  withMaterialized(materialize(everyIn("void", characters, bound === undefined ? {} : { costAtMost: bound })), delayed(atEndOfTurn(), then));

export const F = {
  /** Borrowed Minutes as authored: "1 X: Materialize each ≤X● cost character in your void. Banish them at end of turn." */
  borrow: spell(1, borrowing(x()), [energy(1), energyX(0)]),
  draw: spell(2, draw(1)),
  /** "A character you control gains +2✦ until end of turn." */
  pump: spell(3, gainSpark(target(characterYouControl()), 2, "untilEndOfTurn")),
  /** ❖ "Dissolve an enemy." */
  kill: spell(4, dissolve(target(enemyCharacter())), [energy(0)], "interrupt"),
  /** ❖ "Gain control of an enemy." */
  steal: spell(5, gainControl(target(enemyCharacter())), [energy(0)], "interrupt"),
  bounce: spell(6, returnToHand(target(characterYouControl()))),
  /** "Materialize a figment copy of a character you control." */
  copy: spell(7, materializeFigmentCopy(target(characterYouControl()))),
  /** The cohort's end-of-turn banish, then a choice made as it resolves. */
  banishThenChoose: spell(8, borrowing(undefined, sequence(banishCards([capturedCards()]), returnToHand(target(characterYouControl()))))),
  /** "At end of turn, materialize each character in your void. Banish them at end of turn." */
  lateBorrow: spell(9, delayed(atEndOfTurn(), borrowing())),
  extraTurn: spell(10, takeExtraTurn()),
  /** "Characters you play cost 2● less this turn." */
  cheapen: spell(12, costModifier("you", characters, -2, { duration: "untilEndOfTurn" })),
  /** A character costing "1 X": its copiable cost is 1●. */
  oneX: {
    id: id(13), cardType: "character", costs: [energy(1), energyX()], spark: 1, subtype: "Warrior", speed: "standard", status: "vanilla", abilities: () => [],
  } satisfies EngineCardDefinition,
  /** "At the end of your turn, gain 1⍟." */
  yourEnd: watcher(14, atEndOfTurn("you")),
  /** "At end of turn, gain 1⍟." */
  anyEnd: watcher(15, atEndOfTurn()),
};
export const engine = createEngine(testCatalog(Object.values(F)));
export { v };

export function setup(player: SideSetup, enemy: SideSetup = {}) {
  return boardState(engine.catalog, { active: "player", phase: "day", player: { deck, energy: 9, ...player }, enemy: { deck, ...enemy } });
}

/**
 * Answers each X with the next of `xs`, and each card or target choice with
 * the next of `picks`, else its first `min` candidates.
 */
export class Answers implements AnswerSource {
  readonly prompts: Prompt[] = [];
  constructor(private readonly xs: number[] = [], private readonly picks: (readonly InstanceId[])[] = []) {}
  answer(prompt: Prompt): Answer {
    this.prompts.push(prompt);
    if (prompt.kind === "chooseNumber") {
      const value = this.xs.shift();
      if (value === undefined) throw new Error("no X scripted");
      return value;
    }
    if (prompt.kind === "chooseCards" || prompt.kind === "chooseTargets") return this.picks.shift() ?? prompt.candidates.slice(0, prompt.min);
    throw new Error(`unexpected ${prompt.kind} prompt`);
  }
}

function checked(start: BattleState, end: BattleState, events: readonly EngineEvent[]): void {
  expect(invariantViolations(end, engine.catalog)).toEqual([]);
  expect(unannouncedChanges(events, start, end)).toEqual([]);
  expect(eventRedactionViolations(events, start, end)).toEqual([]);
}

/** Plays `card` from `side`'s hand and resolves everything it causes. */
export function play(state: BattleState, card: InstanceId, answers: AnswerSource = new Answers(), side: "player" | "enemy" = "player") {
  const played = engine.apply(state, side, { kind: "play", card, from: "hand" }, answers);
  const rest = passUntil(engine, played.state, (next) => next.stack.length === 0 && next.triggerQueue.length === 0, answers);
  const events = [...played.events, ...rest.events];
  checked(state, rest.state, events);
  return { state: rest.state, events };
}

/**
 * Runs `state`'s waiting automatic steps, if any, then passes until the next
 * turn's Day decision, recording every committed step.
 */
export function endTurn(state: BattleState, answers: AnswerSource = new Answers()): { state: BattleState; events: EngineEvent[]; steps: Observed[] } {
  const turn = state.turn.turnNumber;
  const steps: Observed[] = [];
  const automatic = engine.decision(state) === null ? nextAutomaticStep(state, engine.catalog, engine.memo) : null;
  const settled = automatic === null
    ? { state, events: [] }
    : runToDecision(state, automatic, answers, engine.catalog, engine.memo, (next, step, events) => steps.push({ state: next, step, events }), true);
  const result = passUntil(engine, settled.state, (next) => next.turn.turnNumber > turn && next.turn.phase === "day" && engine.decision(next) !== null, answers);
  const events = [...settled.events, ...result.events];
  checked(state, result.state, events);
  const observed = [...steps, ...result.steps];
  // Each step announces its own changes, the waiting cleanup's included.
  observed.forEach((step, index) => expect(unannouncedChanges(step.events, observed[index - 1]?.state ?? state, step.state)).toEqual([]));
  return { state: result.state, events, steps: observed };
}

/** The first committed step state whose Ending cleanup waits for its "at end of turn" triggers. */
export function waiting(steps: readonly Observed[]): BattleState {
  const found = steps.find((step) => step.state.turn.endingCleanup === true);
  if (found === undefined) throw new Error("no Ending cleanup waited");
  return found.state;
}

/** The player's hand card printed from `card`. */
export function handCard(state: BattleState, card: EngineCardDefinition, side: "player" | "enemy" = "player"): InstanceId {
  const found = state.sides[side].hand.find((entry) => {
    const printing = state.instances[entry]?.printing;
    return printing?.kind === "card" && printing.cardId === card.id;
  });
  if (found === undefined) throw new Error(`no ${card.id} in ${side}'s hand`);
  return found;
}

export const zone = (state: BattleState, instance: InstanceId) => state.instances[instance]?.zone ?? null;
export const banished = (events: readonly EngineEvent[]) => events.flatMap((entry) => (entry.kind === "banished" ? [entry.instance] : []));
/** The index of the first event matching `test`, failing when there is none. */
export function indexOf(events: readonly EngineEvent[], test: (entry: EngineEvent) => boolean): number {
  const index = events.findIndex(test);
  expect(index).toBeGreaterThanOrEqual(0);
  return index;
}
