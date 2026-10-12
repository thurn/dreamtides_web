/** Synthetic boards and engine actions for linked-banish contracts. */
import type { EngineCardDefinition } from "../../../catalog";
import { energy, event } from "../../../dsl/builders";
import { onDissolved, onMaterialized, triggered } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import { addFloating, endFloating } from "../../../rules/floating";
import { instanceOrigin } from "../../../rules/activation";
import { banish, dissolve, enterPlay, materialize, moveToHand, createInPlay } from "../../../rules/zones";
import type { InstanceId, Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import type { StepContext, AnswerSource } from "../../../steps/types";
import { NO_PROMPTS } from "../../../steps/sources";
import { boardState, type SideSetup } from "../../../testing/board";
import { syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import { triggerNamed } from "../../../triggers/matcher";
import { lookAtTopBanish, putLinkedBanishedInHand } from "../linked-banish";
import { gainPoints } from "../gain-points";
import { resolveEffect } from "../../interpreter";
import { deck, v } from "./cards-support";

const pair: EngineCardDefinition = { id: syntheticId(0xb48601), cardType: "character", costs: [energy(0)], spark: 1,
  subtype: "Warrior", speed: "standard", status: "authored", abilities: () => [
    triggered(onMaterialized(), lookAtTopBanish(4)), triggered(onDissolved(), putLinkedBanishedInHand()),
  ] };
const plain: EngineCardDefinition = { ...pair, id: syntheticId(0xb48602), abilities: () => [] };
const op = (index: number, resolve: (ctx: StepContext) => void): EngineCardDefinition => ({
  ...pair, id: syntheticId(0xb48600 + index), cardType: "event", spark: null, abilities: () => [event(gainPoints(0))],
  synthetic: { resolve },
});
const source = (ctx: StepContext) => {
  const id = ctx.state.sides.player.backRank.find((id) => id !== null);
  if (id === undefined || id === null) throw new Error("source missing");
  return id;
};
/** Grants `id` the pair's abilities until it leaves play, as an acquired group. */
function gainPair(ctx: StepContext, id: InstanceId): void {
  addFloating(ctx, { source: id, controller: "player", expiry: { at: "sourceLeavesPlay", source: id },
    change: { kind: "abilities", instance: id, cardId: pair.id, variant: { amplified: false } } });
}
/** A created figment copy of `card` in the player's first open back slot. */
function create(ctx: StepContext, card: EngineCardDefinition): InstanceId {
  return createInPlay(ctx, { kind: "figmentCopy", cardId: card.id, spark: null }, "player", { amplified: false },
    { rank: "back", index: ctx.state.sides.player.backRank.findIndex((id) => id === null) });
}
export const F = {
  pair, plain,
  kill: op(3, (ctx) => dissolve(ctx, source(ctx), null)),
  repeat: op(4, (ctx) => triggerNamed(ctx, source(ctx), "materialized")),
  blink: op(5, (ctx) => { const id = source(ctx); banish(ctx, id); materialize(ctx, id, "player"); }),
  invalidate: op(6, (ctx) => { const id = ctx.state.sides.player.banished[0]; moveToHand(ctx, id, "player"); banish(ctx, id); }),
  gain: op(7, (ctx) => gainPair(ctx, source(ctx))),
  expireFirst: op(8, (ctx) => { const id = source(ctx); const first = ctx.state.floating.find((entry) => entry.change.kind === "abilities" && entry.change.instance === id)!; endFloating(ctx, (entry) => entry.id === first.id); }),
  createAndKill: op(9, (ctx) => dissolve(ctx, create(ctx, pair), null)),
  enterAndKill: op(10, (ctx) => { const id = ctx.state.sides.player.void[0]; enterPlay(ctx, id, "player", { rank: "back", index: 0 }); dissolve(ctx, id, null); }),
  reenterBeforeReturn: op(11, (ctx) => { const id = source(ctx); dissolve(ctx, id, null); materialize(ctx, id, "player"); }),
  createGained: op(13, (ctx) => gainPair(ctx, create(ctx, plain))),
  createGainedLookAndKill: op(14, (ctx) => { const id = create(ctx, plain); gainPair(ctx, id); triggerNamed(ctx, id, "materialized"); dissolve(ctx, id, null); }),
  reenterGainedLook: op(15, (ctx) => { const id = source(ctx); dissolve(ctx, id, null); materialize(ctx, id, "player"); gainPair(ctx, id); triggerNamed(ctx, id, "materialized"); }),
  failAfterLook: op(12, (ctx) => { const id = source(ctx); resolveEffect(ctx, lookAtTopBanish(4), { source: id, origin: instanceOrigin(ctx.state.instances[id]), ability: 0, controller: "player", x: null, optionalPaid: [], choices: { modes: [], targets: [] } }); throw new Error("synthetic linked failure"); }),
};
export const engine = createEngine(testCatalog(Object.values(F)));
export const five = [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id, v.vanilla5.id, v.event0.id];
export function setup(player: SideSetup = {}, enemy: SideSetup = {}) {
  return boardState(engine.catalog, { active: "player", phase: "day", player: { deck: five, energy: 8, ...player }, enemy: { deck, ...enemy } });
}
export function play(state: BattleState, card: InstanceId, answers: AnswerSource = NO_PROMPTS, side: Side = "player") {
  const first = engine.apply(state, side, { kind: "play", card, from: "hand" }, answers);
  const last = passUntil(engine, first.state, (state) => state.stack.length === 0 && state.triggerQueue.length === 0, answers);
  return { state: last.state, events: [...first.events, ...last.events], answers: first.answers };
}
export const picking: AnswerSource = { answer(prompt) {
  if (prompt.kind !== "chooseCards") throw new Error(`unexpected ${prompt.kind}`);
  return [prompt.candidates[prompt.candidates.length - 1]];
} };
