/** Synthetic fixtures and public actions for the first-materialization contract. */
import { parseDreamsignId } from "../../../../types/identifiers";
import type { EngineCardDefinition } from "../../../catalog";
import { additionalCost, abandonCost, all, characterYouControl, enemyCharacter, energy, event, everyIn, randomIn, self, staticAbility, target } from "../../../dsl/builders";
import { triggered, whenMaterialize } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import type { Answer, Prompt } from "../../../prompts/types";
import { hasKeyword } from "../../../rules/keywords";
import { opponent, type CardId, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState, FloatingEffect } from "../../../state/types";
import { InlineSource } from "../../../steps/sources";
import { boardState, type SideSetup } from "../../../testing/board";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import { ZONE_FIGMENT, ZONE_FIGMENTS } from "../../../testing/zone-cards";
import * as p from "../index";

export const signId = parseDreamsignId("5e5e5e5e-0000-4000-8000-000000059000");
const spell = (index: number, effect: Parameters<typeof event>[0]): EngineCardDefinition => ({
  ...v.event0, id: syntheticId(0x59000 + index), costs: [energy(0)], status: "authored", abilities: () => [event(effect)],
});
export const cards = {
  hand: spell(1, p.materialize(everyIn("hand", { cardType: "character" }))),
  deck: spell(2, p.materialize(randomIn("deck", 1, { cardType: "character" }))),
  void: spell(3, p.materialize(everyIn("void", { cardType: "character" }))),
  figments: spell(4, p.materializeFigments(ZONE_FIGMENT.warrior.id, 3)),
  copy: spell(5, p.materializeFigmentCopy(target(characterYouControl()))),
  create: spell(6, p.sequence(p.createCard(v.vanilla0.id), p.materialize(everyIn("hand", { cardType: "character" })))),
  again: spell(7, p.rematerialize(all(characterYouControl()))),
  leave: spell(8, p.returnToHand(all(characterYouControl()))),
  hide: spell(9, p.shuffleInto([everyIn("hand", { cardType: "character" })])),
  draw: spell(10, p.draw(1)),
  gain: spell(11, p.gainControl(all(enemyCharacter()))),
  kill: spell(12, p.dissolve(all(characterYouControl()))),
  extra: spell(13, p.takeExtraTurn()),
  sleep: spell(14, p.exhaust(all(characterYouControl()))),
  loss: spell(15, p.loseAllAbilities(all(characterYouControl()))),
  enable: spell(16, p.materializeKeywordModifier()),
  fail: spell(17, p.sequence(p.materialize(everyIn("void", { cardType: "character" })), p.gainAdditionalSpark(self(), 1))),
  pause: spell(18, p.sequence(p.materialize(everyIn("void", { cardType: "character" })), p.optional(p.draw(1)))),
  pay: { ...spell(19, p.materialize(everyIn("void", { cardType: "character" }))),
    abilities: () => [additionalCost(abandonCost()), event(p.materialize(everyIn("void", { cardType: "character" })))] },
};
export const provider: EngineCardDefinition = { ...v.vanilla0, id: syntheticId(0x59030), status: "authored",
  abilities: () => [staticAbility(p.firstMaterializationKeyword())] };
export const watcher: EngineCardDefinition = { ...v.vanilla0, id: syntheticId(0x59031), status: "authored", abilities: () => [
  triggered(whenMaterialize(characterYouControl({ exhausted: false })), p.gainPoints(10)),
  triggered(whenMaterialize(characterYouControl({ exhausted: true })), p.gainPoints(1)),
] };
export const fast: EngineCardDefinition = { ...v.vanilla0, id: syntheticId(0x59032), speed: "fast" };
export const engine = createEngine(testCatalog([...Object.values(cards), provider, watcher, fast], {
  dreamsigns: [{ id: signId, status: "authored", abilities: () => [staticAbility(p.firstMaterializationKeyword())] }],
}, ZONE_FIGMENTS));
export { v };
const answers = (pick: (prompt: Prompt) => Answer = prompt => {
  if (prompt.kind === "chooseCards" || prompt.kind === "chooseTargets") return prompt.candidates.slice(0, prompt.min);
  if (prompt.kind === "confirm") return true;
  throw new Error(`Unexpected prompt ${prompt.kind}`);
}) => new InlineSource({ player: pick, enemy: pick });
export function world(side: Side, hand: readonly CardId[], mine: SideSetup = {}, theirs: SideSetup = {}) {
  const deck = Array.from({ length: 16 }, () => v.vanilla1.id);
  return boardState(engine.catalog, { active: side, phase: "day", scoreToWin: 10000,
    [side]: { deck, energy: 50, dreamsigns: [signId], hand, ...mine },
    [opponent(side)]: { deck, energy: 50, ...theirs },
  });
}
export function play(state: BattleState, side: Side, card: InstanceId, source = answers()) {
  const first = engine.apply(state, side, { kind: "play", card, from: "hand" }, source);
  const rest = passUntil(engine, first.state, next => next.stack.length === 0 && next.triggerQueue.length === 0, source);
  return { state: rest.state, events: [...first.events, ...rest.events] };
}
export const keyword = (state: BattleState, id: InstanceId) => hasKeyword(state, engine.catalog, id, "awakened");
type FirstGrant = FloatingEffect & { readonly change: Extract<FloatingEffect["change"], { readonly kind: "firstMaterializationKeyword" }> };
export const grants = (state: BattleState) => state.floating.filter((effect): effect is FirstGrant => effect.change.kind === "firstMaterializationKeyword");
