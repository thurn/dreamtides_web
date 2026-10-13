/** Synthetic discard occasions, driven only through the public engine/fold. */
import { createCatalog, type EngineCardDefinition } from "../../../catalog";
import { activated, discardCost, discardHandCost, discardedCount, energy, event, everyIn, self } from "../../../dsl/builders";
import type { PlayerRef } from "../../../dsl/types";
import { triggered, whenDiscard, whenDiscardBatch } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import type { EngineEvent } from "../../../events";
import type { BattleSlice, IntentOutcome } from "../../../fold/slice";
import type { Action } from "../../../rules/actions";
import { discardCards } from "../../../rules/resources";
import { opponent, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import type { Step } from "../../../steps/kinds";
import { InlineSource } from "../../../steps/sources";
import { boardState } from "../../../testing/board";
import { SYNTHETIC_CARDS, SYNTHETIC as v, syntheticId } from "../../../testing/synthetic-cards";
import * as p from "../index";

function card(index: number, abilities: EngineCardDefinition["abilities"], character = false): EngineCardDefinition {
  return { id: syntheticId(0x453100 + index), cardType: character ? "character" : "event", costs: [energy(0)], spark: character ? 1 : null, subtype: "", speed: "standard", status: "authored", abilities };
}
export const D = {
  watcher: card(0, () => [triggered(whenDiscardBatch(), p.draw(discardedCount()), { oncePerTurn: true })], true),
  perCard: card(1, () => [triggered(whenDiscard(), p.gainPoints(1))], true),
  opponentWatch: card(2, () => [triggered(whenDiscardBatch("opponent"), p.draw(discardedCount()))], true),
  zero: card(3, () => [event(p.discard(0))]),
  one: card(4, () => [event(p.discard(1))]),
  three: card(5, () => [event(p.discard(3))]),
  separate21: card(6, () => [event(p.sequence(p.discard(2), p.discard(1)))]),
  separate12: card(7, () => [event(p.sequence(p.discard(1), p.discard(2)))]),
  opponentThree: card(8, () => [event(p.discard(3, "opponent"))]),
  payer21: card(9, () => [activated([energy(2), discardCost(2), discardCost(1)], p.gainPoints(0))], true),
  payer3: card(10, () => [activated([discardCost(3)], p.gainPoints(0))], true),
  payHand: card(11, () => [activated([discardHandCost()], p.gainPoints(0))], true),
  payTo: card(12, () => [event(p.payTo({ energy: 2, discard: 2 }, p.gainPoints(0)))]),
  redraw: card(13, () => [event(p.redrawHand())]),
  random: card(14, () => [event(p.discardRandom(2))]),
  changes: card(15, () => [event(p.sequence(p.discard(2), p.draw(1), p.putInDeck([everyIn("void")], "bottom")))]),
  zeroThenTwo: card(16, () => [event(p.sequence(p.discard(0), p.discard(2)))]),
  pause: card(17, () => [event(p.sequence(p.discard(2), p.optional(p.gainPoints(0))))]),
  pausedWatch: card(18, () => [triggered(whenDiscardBatch(), p.optional(p.draw(discardedCount())), { oncePerTurn: true })], true),
  fails: card(19, () => [event(p.sequence(p.discard(2), p.gainAdditionalSpark(self(), 1)))]),
  floating: card(20, () => [event(p.sequence(p.floating(whenDiscardBatch(), p.draw(discardedCount())), p.discard(2)))]),
  delayed: card(21, () => [event(p.sequence(p.delayed(whenDiscardBatch(), p.draw(discardedCount())), p.discard(2), p.discard(1)))]),
  sourceLeaves: card(22, () => [event(p.sequence(p.discard(2), p.returnToHand({ kind: "all", selector: { controller: "you" } })))]),
  invalid: card(23, () => [], false),
  aliasGroup: card(25, () => [], false),
  hidePause: card(24, () => [event(p.sequence(p.discard(2), p.returnToHand({ kind: "all", selector: { controller: "you" } }), p.shuffleInto([everyIn("hand")]), p.optional(p.gainPoints(0))))]),
};
const bad: EngineCardDefinition = { ...D.invalid, synthetic: { resolve(ctx, item) {
  const first = ctx.state.sides[item.controller].hand[0];
  const wrong = ctx.state.sides[opponent(item.controller)].hand[0];
  if (first === undefined || wrong === undefined) throw new Error("synthetic invalid cohort missing");
  discardCards(ctx, item.controller, [first, wrong]);
} } };
const alias: EngineCardDefinition = { ...D.aliasGroup, synthetic: { resolve(ctx, item) {
  discardCards(ctx, item.controller, ctx.state.sides[item.controller].hand);
} } };
export const engine = createEngine(createCatalog([...SYNTHETIC_CARDS, ...Object.values(D).filter((c) => c !== D.invalid && c !== D.aliasGroup), bad, alias], []));
export { v };
export const deck = Array.from({ length: 18 }, (_, i) => [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id][i % 3]);
export const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
export function applied(out: IntentOutcome): BattleSlice {
  if (out.kind !== "applied" || out.error !== null) throw new Error(`Unexpected fold outcome ${JSON.stringify(out)}`);
  return out.slice;
}
export function setup(side: Side = "player", source = D.three, ref: PlayerRef = "you", watcher = D.watcher, cards = 4) {
  const discarding = ref === "you" ? side : opponent(side);
  const payer = source.cardType === "character";
  const board = boardState(engine.catalog, { active: side, phase: "day", scoreToWin: 100,
    [side]: { back: [watcher.id, ...(discarding === side ? [D.perCard.id] : []), ...(payer ? [source.id] : [])],
      hand: [...(payer ? [] : [source.id]), ...(discarding === side ? Array.from({ length: cards }, () => v.vanilla1.id) : [])], energy: 4, deck },
    [opponent(side)]: { back: discarding === side ? [] : [D.watcher.id, D.perCard.id], hand: discarding === side ? [v.vanilla2.id] : Array.from({ length: cards }, () => v.vanilla1.id), deck } });
  const sourceId = payer ? board.ids[side].back[board.ids[side].back.length - 1]! : board.ids[side].hand[0];
  const action: Action = payer ? { kind: "activate", source: sourceId, ability: 0 } : { kind: "play", card: sourceId, from: "hand" };
  const state: BattleState = { ...board.state, config: { ...board.state.config, handLimit: 10, turnLimit: null } };
  return { ...board, state, side, discarding, source: sourceId, action, cohort: board.ids[discarding].hand.filter((id) => id !== sourceId) };
}
export function run(state: BattleState, side: Side, action: Action, accept = true) {
  const answer = (prompt: Parameters<InlineSource["answer"]>[0]) => {
    if (prompt.kind === "chooseCards" || prompt.kind === "chooseTargets") return prompt.candidates.slice(0, prompt.min);
    if (prompt.kind === "confirm" || prompt.kind === "payOrDecline") return accept;
    throw new Error(`Unexpected synthetic prompt ${prompt.kind}`);
  };
  const source = new InlineSource({ player: answer, enemy: answer });
  const events: EngineEvent[] = [];
  const steps: { readonly kind: Step["kind"]; readonly events: readonly EngineEvent[] }[] = [];
  const observe = (_state: BattleState, step: Step, emitted: readonly EngineEvent[]) => { steps.push({ kind: step.kind, events: emitted }); };
  let out = engine.apply(state, side, action, source, observe);
  events.push(...out.events);
  while (out.state.stack.length > 0) {
    const decision = engine.decision(out.state);
    if (decision === null) throw new Error("Synthetic stack has no decision");
    out = engine.apply(out.state, decision.side, { kind: "pass" }, source, observe);
    events.push(...out.events);
  }
  return { state: out.state, events, steps };
}
