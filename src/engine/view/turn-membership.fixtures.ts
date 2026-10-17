/** Synthetic public producers and consumers of anonymous current-turn membership. */
import type { EngineCardDefinition } from "../catalog";
import { activated, all, abandonedIn, characterYouControl, discardedIn, dissolvedIn, energy, event, everyIn } from "../dsl/builders";
import { createEngine } from "../engine";
import type { Action } from "../rules/actions";
import { opponent, type Side } from "../state/ids";
import type { BattleState } from "../state/types";
import { InlineSource } from "../steps/sources";
import { boardState } from "../testing/board";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../testing/synthetic-cards";
import { passUntil } from "../testing/trigger-harness";
import * as p from "../effects/primitives";

export const kinds = ["discarded", "dissolved", "abandoned"] as const;
export type MemberKind = typeof kinds[number];
const selectors = { discarded: discardedIn, dissolved: dissolvedIn, abandoned: abandonedIn };
const make = (index: number, abilities: EngineCardDefinition["abilities"], character = false): EngineCardDefinition => ({
  ...v.event0, id: syntheticId(0x777100 + index), cardType: character ? "character" : "event", subtype: "Explorer",
  costs: [energy(0)], spark: character ? 1 : null, status: "authored", abilities,
});
export const producers = {
  discarded: make(0, () => [event(p.discard(1))]),
  dissolved: make(1, () => [event(p.dissolve(all(characterYouControl({ subtype: "Warrior" }))))]),
  abandoned: make(2, () => [event(p.abandon("you", { subtype: "Warrior" }))]),
};
const twice = {
  discarded: make(9, () => [event(p.discard(2))]),
  dissolved: producers.dissolved,
  abandoned: make(10, () => [event(p.sequence(p.abandon("you", { subtype: "Warrior" }), p.abandon("you", { subtype: "Warrior" }))) ]),
};
export const readers = Object.fromEntries(kinds.map((kind, index) => [kind, make(3 + index, () =>
  [...(["deck", "hand", "void"] as const).map(zone => activated([], p.materialize(selectors[kind](zone, { cardType: "character" })))), activated([], p.erode(3))], true)])) as Record<MemberKind, EngineCardDefinition>;
export const hide = make(6, () => [event(p.shuffleInto([everyIn("void", { cardType: "character" })]))]);
export const leave = make(7, () => [event(p.returnToHand(all(characterYouControl({ subtype: "Warrior" }))))]);
const erode = make(8, () => [event(p.erode(3))]);
export const engine = createEngine(testCatalog([...Object.values(producers), twice.discarded, twice.abandoned, ...Object.values(readers), hide, leave, erode]));
function answer(state: BattleState) {
  const choose = (prompt: Parameters<InlineSource["answer"]>[0]) => {
    if (prompt.kind === "chooseCards" || prompt.kind === "chooseTargets") {
      const victim = (id: typeof prompt.candidates[number]) => {
        const printing = state.instances[id]?.printing;
        return printing?.kind === "card" && printing.cardId === v.vanilla0.id;
      };
      return [...prompt.candidates].sort((a, b) => Number(victim(b)) - Number(victim(a))).slice(0, prompt.min);
    }
    if (prompt.kind === "confirm" || prompt.kind === "payOrDecline") return true;
    throw new Error(`Unexpected membership prompt ${prompt.kind}`);
  };
  return new InlineSource({ player: choose, enemy: choose });
}
export function run(state: BattleState, side: Side, action: Action) {
  const source = answer(state), first = engine.apply(state, side, action, source);
  const rest = passUntil(engine, first.state, next => next.stack.length === 0 && next.triggerQueue.length === 0, source);
  return { state: rest.state, events: [...first.events, ...rest.events] };
}
export const play = (state: BattleState, side: Side, card: BattleState["sides"][Side]["hand"][number]) => run(state, side, { kind: "play", card, from: "hand" });
export const members = (state: BattleState, side: Side, kind: MemberKind) => kind === "discarded"
  ? state.turnLog.discardedCards?.[side] ?? [] : (state.turnLog[kind]?.[side] ?? []).map(card => card.instance);
export const decks = (state: BattleState) => {
  const owned = (side: Side) => Object.values(state.instances).flatMap(card => card.owner === side && card.printing.kind === "card" && !card.status.created
    ? [{ cardId: card.printing.cardId, ...card.variant }] : []);
  return { player: owned("player"), enemy: owned("enemy") };
};
export function setup(side: Side, kind: MemberKind, copies = 1, created = false) {
  const victims = Array.from({ length: copies }, () => v.vanilla0.id);
  const producer = copies === 1 ? producers[kind] : twice[kind];
  const initial = boardState(engine.catalog, { active: side, phase: "day", scoreToWin: 100,
    [side]: { back: [readers[kind].id, ...(kind === "discarded" ? [] : victims)],
      hand: [producer.id, ...(kind === "discarded" ? victims : []), hide.id, leave.id, producers[kind].id, hide.id, erode.id],
      deck: [v.vanilla0.id, v.vanilla0.id], energy: 20 }, [opponent(side)]: { hand: [v.interruptEvent.id] } });
  const original = { ...initial.state, config: { ...initial.state.config, handLimit: 20, turnLimit: null } };
  const victim = kind === "discarded" ? initial.ids[side].hand[1] : initial.ids[side].back[1]!;
  if (created) original.instances[victim].status.created = true;
  const removed = play(original, side, initial.ids[side].hand[0]);
  const hideId = initial.ids[side].hand[kind === "discarded" ? copies + 1 : 1];
  const hidden = play(removed.state, side, hideId).state;
  return { initial, original, victim, removed, hidden, reader: initial.ids[side].back[0]!, hideId };
}
export const entered = (out: ReturnType<typeof run>) => out.events.flatMap(event => event.kind === "materialized" ? [event.instance] : []);
