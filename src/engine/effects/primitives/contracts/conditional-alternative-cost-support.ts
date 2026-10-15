/** Public synthetic fixtures for conditional replacement payment and its own entry readiness. */
import { expect } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { characterYouControl, conditionalAlternativeCost, controls, energy, staticAbility } from "../../../dsl/builders";
import type { Ability, Cost, StaticCondition } from "../../../dsl/types";
import { createEngine } from "../../../engine";
import type { BattleSlice, IntentOutcome } from "../../../fold/slice";
import { firstLegalAnswer } from "../../../prompts/answers";
import type { Answer, Prompt } from "../../../prompts/types";
import type { PlayZone } from "../../../rules/timing";
import { opponent, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import type { AnswerSource } from "../../../steps/types";
import { boardState, type SideSetup } from "../../../testing/board";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { playSelfFromZone } from "../play-from-zone";

export const survivor: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x698100), subtype: "Survivor" };
export const conditionalDeck = Array.from({ length: 12 }, () => v.vanilla1.id);
export const survivorCondition = controls(characterYouControl({ subtype: "Survivor" }));
export function conditionalCard(index = 1, options: {
  readonly condition?: StaticCondition; readonly entry?: boolean; readonly permission?: boolean;
  readonly costs?: readonly Cost[]; readonly extras?: readonly Ability[]; readonly printed?: EngineCardDefinition["costs"];
  readonly fields?: Partial<EngineCardDefinition>;
} = {}): EngineCardDefinition {
  const condition = options.condition ?? survivorCondition;
  return { ...v.vanilla2, id: syntheticId(0x698100 + index), costs: options.printed ?? [energy(4)], status: "authored",
    abilities: () => [conditionalAlternativeCost(condition, options.costs ?? [energy(1)], options.entry === false ? {} : { materializesAwakened: true }),
      ...(options.permission === false ? [] : [staticAbility(playSelfFromZone("void"), { zone: "void", while: condition })]),
      ...(options.extras ?? [])], ...options.fields };
}
export function conditionalFixture(side: Side, card = conditionalCard(), mine: SideSetup = {}, theirs: SideSetup = {}, definitions: readonly EngineCardDefinition[] = [], from: PlayZone = "hand") {
  const engine = createEngine(testCatalog([survivor, card, ...definitions]));
  const board = boardState(engine.catalog, { active: side, phase: "day",
    [side]: { hand: from === "hand" ? [card.id] : [], void: from === "void" ? [card.id] : [],
      back: [survivor.id], deck: from === "deck" ? [card.id, ...conditionalDeck] : conditionalDeck, energy: 10, ...mine },
    [opponent(side)]: { hand: [v.interruptEvent.id], deck: conditionalDeck, energy: 10, ...theirs },
  });
  const id = board.ids[side][from][0];
  const state: BattleState = { ...board.state, config: { ...board.state.config, autoAnswerForcedPrompts: false } };
  return { engine, state, ids: board.ids, id, side, from, action: { kind: "play" as const, card: id, from } };
}
export function conditionalAnswers(route: "normal" | "alternativeCost" = "alternativeCost", overrides: Partial<Record<Prompt["purpose"]["role"], Answer>> = {}) {
  const prompts: Prompt[] = [];
  const source: AnswerSource = { answer(prompt) {
    prompts.push(prompt);
    const explicit = overrides[prompt.purpose.role]; if (explicit !== undefined) return explicit;
    if ((prompt.purpose.role === "playRoute" || prompt.purpose.role === "voidRoute") && prompt.kind === "chooseMode") return prompt.options.find(option => option.route === route)?.mode ?? firstLegalAnswer(prompt);
    if (prompt.kind === "chooseCards" || prompt.kind === "chooseTargets") return prompt.candidates.slice(0, prompt.min);
    if (prompt.kind === "chooseNumber") return prompt.min;
    if (prompt.kind === "confirm") return true;
    return firstLegalAnswer(prompt);
  } };
  return { source, prompts };
}
export const conditionalSlice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
export function conditionalApplied(outcome: IntentOutcome): BattleSlice {
  expect(outcome.kind).toBe("applied");
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`Unexpected intent outcome ${JSON.stringify(outcome)}`);
  return outcome.slice;
}
