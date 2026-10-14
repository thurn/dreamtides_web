/** Synthetic consumers of current-zone discarded physical membership. */
import type { EngineCardDefinition } from "../../../catalog";
import { activated, all, characterYouControl, discardCost, discardedIn, energy, event, self } from "../../../dsl/builders";
import { triggered, whenDiscardBatch } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import type { BattleSlice, IntentOutcome } from "../../../fold/slice";
import type { Action } from "../../../rules/actions";
import { discardCards } from "../../../rules/resources";
import type { Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { InlineSource } from "../../../steps/sources";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import * as p from "../index";
const make = (index: number, abilities: EngineCardDefinition["abilities"], character = false): EngineCardDefinition => ({
  id: syntheticId(0x691000 + index), cardType: character ? "character" : "event", costs: [energy(0)],
  spark: character ? 1 : null, subtype: "", speed: "standard", status: "authored", abilities,
});
export const D = {
  one: make(0, () => [event(p.discard(1))]),
  two: make(1, () => [event(p.discard(2))]),
  wake: make(2, () => [event(p.materialize(discardedIn("void", { cardType: "character" })))]),
  otherWake: make(3, () => [event(p.materialize(discardedIn("void", { cardType: "character" }, "opponent")))]),
  payer: make(4, () => [activated([discardCost()], p.materialize(discardedIn("void", { cardType: "character" })))], true),
  return: make(5, () => [event(p.returnToHand(all(characterYouControl())))]),
  take: make(6, () => [event(p.takeFromAmong(p.opponentHand()))]),
  hide: make(7, () => [event(p.shuffleInto([discardedIn("void")]))]),
  handWake: make(8, () => [event(p.materialize(discardedIn("hand", { cardType: "character" })))]),
  deckWake: make(9, () => [event(p.materialize(discardedIn("deck", { cardType: "character" })))]),
  filter: make(10, () => [event(p.materialize(discardedIn("void", { subtype: "Warrior", costAtMost: 1 })))]),
  handLimit: make(11, () => [triggered(whenDiscardBatch(), p.materialize(discardedIn("void", { cardType: "character" })))], true),
  pause: make(12, () => [event(p.sequence(p.discard(1), p.optional(p.gainPoints(0))))]),
  fail: make(13, () => [event(p.sequence(p.discard(1), p.gainAdditionalSpark(self(), 1)))]),
  mayPay: make(14, () => [event(p.payTo({ discard: 1 }, p.materialize(discardedIn("void", { cardType: "character" }))))]),
  zero: make(15, () => [event(p.discard(0))]),
  extra: make(16, () => [event(p.takeExtraTurn())]),
  mid: { ...make(18, () => []), synthetic: { resolve(ctx, item) {
    const cohort = [...ctx.state.sides[item.controller].hand];
    const failing = Object.create(ctx) as typeof ctx;
    failing.emit = event => {
      ctx.emit(event);
      if (event.kind === "discarded" && event.instance === cohort[0]) throw new Error("Synthetic failure during discard cohort");
    };
    discardCards(failing, item.controller, cohort);
  } } } satisfies EngineCardDefinition,
  invalid: { ...make(17, () => []), synthetic: { resolve(ctx, item) {
    const card = ctx.state.sides[item.controller].hand[0]; discardCards(ctx, item.controller, [card, card]);
  } } } satisfies EngineCardDefinition,
};
export const engine = createEngine(testCatalog(Object.values(D)));
export { v };
export const deck = Array.from({ length: 20 }, () => v.vanilla1.id);
export const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
export function applied(out: IntentOutcome): BattleSlice {
  if (out.kind !== "applied" || out.error !== null) throw new Error(`Unexpected outcome ${JSON.stringify(out)}`);
  return out.slice;
}
export const answers = (accept = true) => {
  const answer = (prompt: Parameters<InlineSource["answer"]>[0]) => {
    if (prompt.kind === "chooseCards" || prompt.kind === "chooseTargets") return prompt.candidates.slice(0, prompt.min);
    if (prompt.kind === "confirm" || prompt.kind === "payOrDecline") return accept;
    throw new Error(`Unexpected discarded-membership prompt ${prompt.kind}`);
  };
  return new InlineSource({ player: answer, enemy: answer });
};
export function run(state: BattleState, side: Side, action: Action, accept = true) {
  const source = answers(accept), first = engine.apply(state, side, action, source);
  const rest = passUntil(engine, first.state, next => next.stack.length === 0 && next.triggerQueue.length === 0, source);
  return { state: rest.state, events: [...first.events, ...rest.events] };
}
