import { characteristicsOf } from "../../../continuous/characteristics";
import type { EngineCardDefinition, EngineDreamsignDefinition } from "../../../catalog";
import type { Ability } from "../../../dsl/types";
import { activated, energy, event, everyIn, self, staticAbility } from "../../../dsl/builders";
import { createEngine, type Engine } from "../../../engine";
import type { EngineEvent } from "../../../events";
import type { BattleSlice, IntentOutcome } from "../../../fold/slice";
import { opponent, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS } from "../../../steps/sources";
import type { AnswerSource } from "../../../steps/types";
import { boardState, type SideSetup } from "../../../testing/board";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import { parseDreamsignId } from "../../../../types/identifiers";
import * as p from "../index";

export const card = (index: number, abilities: readonly Ability[] = [], fields: Partial<EngineCardDefinition> = {}): EngineCardDefinition => ({
  ...v.vanilla5, id: syntheticId(0x718100 + index), costs: [energy(3)], status: "authored", abilities: () => abilities, ...fields,
});
export const subject = card(1, [activated([], p.returnToHand(self()))]);
export const put = card(2, [event(p.materialize(everyIn("hand", { cardType: "character" })))], { cardType: "event", spark: null, costs: [energy(0)] });
export const revive = card(3, [event(p.materialize(everyIn("void", { cardType: "character" })))], { cardType: "event", spark: null, costs: [energy(0)] });
export const extra = card(4, [event(p.takeExtraTurn())], { cardType: "event", spark: null, costs: [energy(0)] });
export const bounce = card(5, [event(p.returnToHand({ kind: "all", selector: { controller: "you" } }))], { cardType: "event", spark: null, costs: [energy(0)] });
export const signId = parseDreamsignId("5e5e5e5e-0000-4000-8000-000000718001");
export const setting: readonly Ability[] = [staticAbility(p.firstPlayedSparkSetter(0)), staticAbility(p.costModifierNth("you", { cardType: "character" }, 1, { reduce: 2 }))];
export const deck = Array.from({ length: 20 }, () => v.vanilla1.id);
export function world(side: Side, mine: SideSetup = {}, theirs: SideSetup = {}, abilities: readonly Ability[] = setting, definitions: readonly EngineCardDefinition[] = []) {
  const sign: EngineDreamsignDefinition = { id: signId, status: "authored", abilities: () => abilities };
  const engine = createEngine(testCatalog([subject, put, revive, extra, bounce, ...definitions], { dreamsigns: [sign] }));
  return { engine, ...boardState(engine.catalog, { active: side, phase: "day", scoreToWin: 100,
    [side]: { hand: [subject.id, subject.id], energy: 30, deck, dreamsigns: [signId], ...mine },
    [opponent(side)]: { energy: 30, deck, hand: [v.interruptEvent.id], ...theirs } }) };
}
export function settle(engine: Engine, state: BattleState) {
  return passUntil(engine, state, s => s.stack.length === 0 && s.triggerQueue.length === 0);
}
export function cast(engine: Engine, state: BattleState, side: Side, instance: InstanceId, source: AnswerSource = NO_PROMPTS) {
  const played = engine.apply(state, side, { kind: "play", card: instance, from: "hand" }, source);
  const rest = settle(engine, played.state);
  return { ...played, state: rest.state, events: [...played.events, ...rest.events] };
}
export function activate(engine: Engine, state: BattleState, side: Side, source: InstanceId, ability = 0) {
  const activated = engine.apply(state, side, { kind: "activate", source, ability }, NO_PROMPTS);
  return settle(engine, activated.state).state;
}
export const spark = (engine: Engine, state: BattleState, id: InstanceId) => ({ ...engine.view(state, state.instances[id]?.owner ?? "player").instances[id]?.characteristics, baseSpark: characteristicsOf(state, engine.catalog, id).baseSpark });
export const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
export function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(JSON.stringify(outcome));
  return outcome.slice;
}
export function publications(events: readonly EngineEvent[]) {
  return events.filter(e => e.kind === "sparkGained");
}

/** Public reveal/return/shuffle occasion with equal-printing physical decoys. */
export function hiddenWorld(side: Side, decoys = 0) {
  const shuffle = card(30, [event(p.shuffleInto([everyIn("hand", { cardType: "character" })]))], { cardType: "event", spark: null, costs: [energy(0)] });
  const draw = card(31, [event(p.draw(decoys + 1))], { cardType: "event", spark: null, costs: [energy(0)] });
  const reveal = card(32, [event(p.reveal("you"))], { cardType: "event", spark: null, costs: [energy(0)] });
  const f = world(side, { hand: [reveal.id, subject.id, ...Array.from({ length: decoys }, () => subject.id), shuffle.id, draw.id], deck: [] }, {}, setting, [shuffle, draw, reveal]);
  let state = cast(f.engine, f.state, side, f.ids[side].hand[0]).state;
  state = cast(f.engine, state, side, f.ids[side].hand[1]).state;
  state = activate(f.engine, state, side, f.ids[side].hand[1]);
  state = cast(f.engine, state, side, f.ids[side].hand[decoys + 2]).state;
  const cards = (owner: Side) => Object.values(state.instances).filter(i => i.owner === owner && i.printing.kind === "card").map(i => ({ cardId: i.printing.kind === "card" ? i.printing.cardId : subject.id, ...i.variant }));
  return { ...f, state, lists: { player: cards("player"), enemy: cards("enemy") }, draw, first: f.ids[side].hand[1] };
}
