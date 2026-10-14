/** Synthetic public current-turn occurrence contracts; every production consumer uses the same DSL. */
import type { EngineCardDefinition } from "../../../catalog";
import { activated, keyword, all, anyCharacter, characterYouControl, enemyCharacter, target, discardCost, energy, event, self, staticAbility, thisTurn, discardedThisTurn, dissolvedIn, abandonedIn, dissolvedThisTurn } from "../../../dsl/builders";
import { triggered, whenYouPlay, triggeringCard } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import type { BattleSlice, IntentOutcome } from "../../../fold/slice";
import type { Action } from "../../../rules/actions";
import type { BattleState } from "../../../state/types";
import type { Side } from "../../../state/ids";
import { InlineSource } from "../../../steps/sources";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { ZONE_FIGMENT, ZONE_FIGMENTS } from "../../../testing/zone-cards";
import { passUntil } from "../../../testing/trigger-harness";
import * as p from "../index";
const make = (i: number, abilities: EngineCardDefinition["abilities"], character = false): EngineCardDefinition => ({
  id: syntheticId(0x100100 + i), cardType: character ? "character" : "event", costs: [energy(0)],
  spark: character ? 1 : null, subtype: "", speed: "standard", status: "authored", abilities,
});
export const H = {
  kill: make(0, () => [event(p.dissolve(all(characterYouControl())))]),
  killAll: make(1, () => [event(p.dissolve(all(anyCharacter())))]),
  wake: make(2, () => [event(p.materialize(dissolvedIn("void", { cardType: "character" })))]),
  wakeAbandoned: make(3, () => [event(p.materialize(abandonedIn("void", { cardType: "character" })))]),
  discard: make(4, () => [event(p.discard(1))]),
  payer: make(5, () => [activated([discardCost()], p.gainPoints(0))], true),
  leave: make(6, () => [event(p.returnToHand(all(characterYouControl())))]),
  banish: make(7, () => [event(p.banish(all(characterYouControl())))]),
  abandon: make(8, () => [event(p.abandon())]),
  again: make(9, () => [event(p.rematerialize(all(characterYouControl())))]),
  copy: make(10, () => [event(p.materializeFigmentCopy(target(characterYouControl())))]),
  gain: make(11, () => [event(p.gainControl(all(enemyCharacter())))]),
  fortune: make(12, () => [event(p.draw(dissolvedThisTurn()))]),
  sleep: { ...make(13, () => [staticAbility(p.selfCostReduction(3), { zone: "any", while: thisTurn(discardedThisTurn()) })], true), costs: [energy(4)] },
  pause: make(14, () => [event(p.sequence(p.discard(1), p.dissolve(all(characterYouControl())), p.optional(p.draw(dissolvedThisTurn()))))]),
  fail: make(15, () => [event(p.sequence(p.discard(1), p.dissolve(all(characterYouControl())), p.gainAdditionalSpark(self(), 1)))]),
  conceal: make(16, () => [event(p.shuffleInto([dissolvedIn("void")]))]),
  figment: make(23, () => [event(p.materializeFigments(ZONE_FIGMENT.warrior.id))]),
  mirror: make(19, () => [triggered(whenYouPlay(), p.copyCard(triggeringCard()))], true),
  otherAbandoned: make(21, () => [event(p.materialize(abandonedIn("void", { cardType: "character" }, "opponent")))]),
  otherDissolved: make(22, () => [event(p.materialize(dissolvedIn("void", { cardType: "character" }, "opponent")))]),
  types: make(20, () => [event(p.giveAllTypes(all(characterYouControl())))]),
  veil: make(18, () => [keyword("veil")], true),
  extra: make(17, () => [event(p.takeExtraTurn())]),
};
export const engine = createEngine(testCatalog(Object.values(H), {}, ZONE_FIGMENTS));
export { v };
export const deck = Array.from({ length: 20 }, () => v.vanilla1.id);
export const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
export function applied(out: IntentOutcome): BattleSlice {
  if (out.kind !== "applied" || out.error !== null) throw new Error(`Unexpected outcome ${JSON.stringify(out)}`);
  return out.slice;
}
const answer = (prompt: Parameters<InlineSource["answer"]>[0]) => {
  if (prompt.kind === "chooseCards" || prompt.kind === "chooseTargets") return prompt.candidates.slice(0, prompt.min);
  if (prompt.kind === "confirm") return true;
  throw new Error(`Unexpected current-turn prompt ${prompt.kind}`);
};
export const answers = () => new InlineSource({ player: answer, enemy: answer });
export function run(state: BattleState, side: Side, action: Action) {
  const source = answers();
  const first = engine.apply(state, side, action, source);
  const rest = passUntil(engine, first.state, next => next.stack.length === 0 && next.triggerQueue.length === 0, source);
  return { state: rest.state, events: [...first.events, ...rest.events] };
}
