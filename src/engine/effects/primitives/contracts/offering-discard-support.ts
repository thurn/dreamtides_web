import type { ResolvingEffect } from "../../registry";
import type { EngineCardDefinition } from "../../../catalog";
import { activated, additionalCost, conditionCardCounts, fromVoid, discardCost, energy, energyX, event, keyword, optionalCost, pointsCost, reclaim, staticAbility } from "../../../dsl/builders";
import type { Ability } from "../../../dsl/types";
import { createEngine } from "../../../engine";
import type { Prompt } from "../../../prompts/types";
import { battleSeed, opponent, type Side, type InstanceId } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import type { Step } from "../../../steps/kinds";
import { runStep } from "../../../steps/runner";
import { NO_PROMPTS } from "../../../steps/sources";
import type { AnswerSource, StepResult } from "../../../steps/types";
import { boardState, type SideSetup } from "../../../testing/board";
import { OFFERING_DISCARD, OFFERING_DISCARD_CARDS } from "../../../testing/offering-discard-cards";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { parseAvatarId, parseDreamsignId } from "../../../../types/identifiers";
import * as p from "../index";

export { OFFERING_DISCARD as cards, v };
function card(index: number, abilities: readonly Ability[], eventCard = false): EngineCardDefinition {
  return { ...v.vanilla1, id: syntheticId(0x621100 + index), costs: [energy(0)], status: "authored",
    cardType: eventCard ? "event" : "character", spark: eventCard ? null : 1, abilities: () => abilities };
}
export const definitions = {
  hand: card(1, [staticAbility(p.offeringDiscardPaymentOption(), { zone: "hand" })]),
  conditional: card(2, [staticAbility(p.offeringDiscardPaymentOption(), { while: conditionCardCounts("void", 1) })]),
  costly: { ...card(3, [keyword("offering"), additionalCost(energy(2), pointsCost(1), discardCost(), optionalCost(energy(1))), event(p.gainPoints(1))], true), costs: [energyX(0)] },
  abandon: card(4, [keyword("offering"), additionalCost({ cost: "abandon", count: 1, selector: { controller: "you" } })]),
  void: card(5, [keyword("offering"), reclaim(energy(2)), staticAbility(p.playSelfFromZone("void"), { zone: "void" })]),
  banisher: card(6, [activated([{ cost: "banishFromHand", count: 1 }], p.gainPoints(1))]),
  // Deliberately malformed runtime ingress: resolution must fail after the play commits.
  invalid: card(7, [event(p.sequence(p.gainPoints(1), p.offeringDiscardPaymentOption() as unknown as ResolvingEffect))], true),
  tax: card(8, [staticAbility(p.costModifier("you", {}, 2))]),
  targeted: card(9, [keyword("offering"), additionalCost({ cost: "banishFromVoid", count: 1, filter: {} }), event(p.returnFromVoid(fromVoid()))], true),
};
export const avatar = parseAvatarId("5e5e5e5e-0000-4000-8000-000000621201");
export const sign = parseDreamsignId("5e5e5e5e-0000-4000-8000-000000621202");
export const E = createEngine(testCatalog([...OFFERING_DISCARD_CARDS, ...Object.values(definitions)], {
  avatars: [{ id: avatar, status: "authored", abilities: () => [staticAbility(p.offeringDiscardPaymentOption())] }],
  dreamsigns: [{ id: sign, status: "authored", abilities: () => [staticAbility(p.offeringDiscardPaymentOption())] }],
}));
const deck = Array.from({ length: 8 }, () => v.event0.id);
export function world(side: Side, mine: SideSetup = {}, theirs: SideSetup = {}) {
  const w = boardState(E.catalog, { active: side, phase: "day", [side]: { deck, energy: 10, hand: [OFFERING_DISCARD.offered.id, v.event0.id, v.event0.id], back: [OFFERING_DISCARD.holder.id], ...mine }, [opponent(side)]: { deck, ...theirs } });
  return { ...w, state: { ...w.state, config: { ...w.state.config, autoAnswerForcedPrompts: false } } };
}
export function done(result: StepResult): Extract<StepResult, { kind: "done" }> {
  if (result.kind !== "done") throw new Error("Expected completed synthetic Offering step");
  return result;
}
export function step(state: BattleState, action: Step, source: AnswerSource = NO_PROMPTS) {
  return done(runStep(state, action, source, E.catalog));
}
export class Payments implements AnswerSource {
  readonly prompts: Prompt[] = [];
  constructor(readonly route = 1, readonly mode = 1, readonly optional = false, readonly selected: readonly InstanceId[] = []) {}
  answer(prompt: Prompt) {
    this.prompts.push(prompt);
    switch (prompt.kind) {
      case "chooseMode": return prompt.purpose.role === "playRoute" || prompt.purpose.role === "voidRoute" ? this.route : this.mode;
      case "chooseNumber": return 2;
      case "confirm": return this.optional;
      case "chooseCards": case "chooseTargets": return this.selected.length === 0 ? prompt.candidates.slice(0, prompt.min) : this.selected.filter(id => prompt.candidates.includes(id)).slice(0, prompt.min);
      default: throw new Error(`Unplanned ${prompt.kind} prompt`);
    }
  }
}
export const play = (state: BattleState, id: InstanceId, source: AnswerSource = new Payments()) => step(state, { kind: "play", card: id, from: "hand" }, source);
export const init = { seed: battleSeed("board"), scoreToWin: 25, decks: { player: [], enemy: [] }, dreamwell: [] };
