/** Shared synthetic fixtures for the `withMaterialized` contracts. */
import { expect } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { characterYouControl, energy, event, everyIn, target } from "../../../dsl/builders";
import { triggered, whenDraw, whenOpponentPlays } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import type { EngineEvent } from "../../../events";
import type { BattleSlice, IntentOutcome } from "../../../fold/slice";
import type { InstanceId, Side } from "../../../state/ids";
import type { BattleState, FloatingChange, FloatingEffect } from "../../../state/types";
import { NO_PROMPTS } from "../../../steps/sources";
import type { AnswerSource } from "../../../steps/types";
import { unannouncedChanges } from "../../../testing/announced-changes";
import { boardState, type SideSetup } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { eventRedactionViolations } from "../../../testing/redaction";
import { syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import type { Decklists } from "../../../view/determinize";
import type { CapturedCardView, FloatingChangeView } from "../../../view/view";
import { banishCards } from "../banish-cards";
import { dissolve } from "../dissolve";
import { draw } from "../draw";
import { delayed, floating } from "../floating-trigger";
import { materialize } from "../materialize";
import { returnToHand } from "../return-to-hand";
import { sequence } from "../sequence";
import { shuffleInto } from "../shuffle-into";
import { capturedCards, withMaterialized } from "../with-materialized";
import { deck } from "./cards-support";

const spell = (index: number, effect: Parameters<typeof event>[0]): EngineCardDefinition => ({
  id: syntheticId(0xb39200 + index), cardType: "event", costs: [energy(0)], spark: null,
  subtype: "", speed: "standard", status: "authored", abilities: () => [event(effect)],
});
/** "The next time you draw a card, banish them." */
const banishThem = () => delayed(whenDraw(), banishCards([capturedCards()]));
const cheap = { cardType: "character", costAtMost: 2 } as const;
export const F = {
  /** "Materialize each ≤2● cost character in your void. The next time you draw, banish them." */
  raise: spell(1, withMaterialized(materialize(everyIn("void", cheap)), banishThem())),
  /** The same, then materialize every ≥3● character outside the binding. */
  raiseThenOthers: spell(2, sequence(
    withMaterialized(materialize(everyIn("void", cheap)), banishThem()),
    materialize(everyIn("void", { cardType: "character", costAtLeast: 3 })),
  )),
  /** A binding inside a binding: the delayed trigger keeps the inner cohort. */
  nested: spell(3, withMaterialized(
    materialize(everyIn("void", { cardType: "character", costAtMost: 1 })),
    withMaterialized(materialize(everyIn("void", { cardType: "character", costAtLeast: 3 })), banishThem()),
  )),
  unbound: spell(4, banishCards([capturedCards()])),
  draw: spell(5, draw(1)),
  bounce: spell(6, returnToHand(target(characterYouControl()))),
  kill: spell(7, dissolve(target(characterYouControl()))),
  /** "The next time you draw, return a character you control to hand": chosen as it resolves. */
  watch: spell(8, delayed(whenDraw(), returnToHand(target(characterYouControl())))),
  /** Returns a character to hand, then shuffles a hand card into the deck. */
  hide: spell(9, sequence(returnToHand(target(characterYouControl())), shuffleInto([], { chooseFromHand: 1 }))),
  /** "Materialize each ≤2● cost character in your void. Until end of turn, when you draw, banish them." */
  raiseFloating: spell(12, withMaterialized(materialize(everyIn("void", cheap)), floating(whenDraw(), banishCards([capturedCards()])))),
  /** Materializes every character in your deck. */
  unearth: spell(10, materialize(everyIn("deck", { cardType: "character" }))),
  /**
   * From the hand, once per turn: "When the opponent plays a card, materialize each ≤2● cost
   * character in your void. The next time the opponent plays a card, banish them."
   */
  lurker: {
    id: syntheticId(0xb39200 + 11), cardType: "character", costs: [energy(9)], spark: 1,
    subtype: "Warrior", speed: "standard", status: "authored",
    abilities: () => [triggered(
      whenOpponentPlays(),
      withMaterialized(materialize(everyIn("void", cheap)), delayed(whenOpponentPlays(), banishCards([capturedCards()]))),
      { zone: "hand", oncePerTurn: true },
    )],
  } satisfies EngineCardDefinition,
};
export const engine = createEngine(testCatalog(Object.values(F)));

export function setup(player: SideSetup, enemy: SideSetup = {}) {
  return boardState(engine.catalog, { active: "player", phase: "day", player: { deck, energy: 5, ...player }, enemy: { deck, ...enemy } });
}

/** Plays `card` from the player's hand in `state` and resolves everything it causes. */
export function play(state: BattleState, card: InstanceId, answers: AnswerSource = NO_PROMPTS) {
  const observed: BattleState[] = [];
  const played = engine.apply(state, "player", { kind: "play", card, from: "hand" }, answers, (next) => observed.push(next));
  const rest = passUntil(engine, played.state, (next) => next.stack.length === 0 && next.triggerQueue.length === 0, answers);
  const events = [...played.events, ...rest.events];
  expect(invariantViolations(rest.state, engine.catalog)).toEqual([]);
  expect(unannouncedChanges(events, state, rest.state)).toEqual([]);
  expect(eventRedactionViolations(events, state, rest.state)).toEqual([]);
  // Every state the play's steps committed, in order.
  return { state: rest.state, events, observed: [...observed, ...rest.steps.map((step) => step.state)] };
}

/** The player's hand card printed from `card`. */
export function handCard(state: BattleState, card: EngineCardDefinition): InstanceId {
  const id = state.sides.player.hand.find((entry) => {
    const printing = state.instances[entry]?.printing;
    return printing?.kind === "card" && printing.cardId === card.id;
  });
  if (id === undefined) throw new Error(`no ${card.id} in hand`);
  return id;
}

export function triggerOf(state: BattleState): FloatingEffect {
  const [effect] = state.floating.filter((entry) => entry.change.kind === "trigger");
  if (effect === undefined) throw new Error("no delayed trigger");
  return effect;
}

/** A floating trigger's captured cards, in the state or in a view. */
export const capturedOf = (effect: { readonly change: FloatingChange | FloatingChangeView }): readonly CapturedCardView[] | undefined =>
  effect.change.kind === "trigger" ? effect.change.captured : undefined;
export const banished = (events: readonly EngineEvent[]) => events.flatMap((entry) => (entry.kind === "banished" ? [entry.instance] : []));
export const zone = (state: BattleState, id: InstanceId) => state.instances[id]?.zone ?? null;

export const sliceOf = (state: BattleState): BattleSlice => ({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 });
export function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`expected an applied intent, got ${JSON.stringify(outcome)}`);
  return outcome.slice;
}

/** Each side's decklist: every card it owns in `state`. */
export function decklists(state: BattleState): Decklists {
  const of = (side: Side) => Object.values(state.instances).flatMap((instance) =>
    instance.owner === side && instance.printing.kind === "card" ? [{ cardId: instance.printing.cardId, ...instance.variant }] : []);
  return { player: of("player"), enemy: of("enemy") };
}
