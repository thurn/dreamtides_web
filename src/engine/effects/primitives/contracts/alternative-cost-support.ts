/** Synthetic public fixtures for one card-defined replacement payment. */
import { expect } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { alternativeCost, energy, enemyCharacter, event, giveOpponentPointsCost, target } from "../../../dsl/builders";
import type { Ability } from "../../../dsl/types";
import { createEngine } from "../../../engine";
import type { IntentOutcome, BattleSlice } from "../../../fold/slice";
import type { Answer, Prompt } from "../../../prompts/types";
import { isLegalAnswer, firstLegalAnswer } from "../../../prompts/answers";
import type { PlayZone } from "../../../rules/timing";
import { opponent, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import type { AnswerSource } from "../../../steps/types";
import { boardState, type SideSetup } from "../../../testing/board";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { dissolve } from "../dissolve";

export const alternativeDeck = Array.from({ length: 12 }, () => v.vanilla1.id);
export function alternativeCard(index: number, abilities?: readonly Ability[], fields: Partial<EngineCardDefinition> = {}): EngineCardDefinition {
  return { ...v.event1, id: syntheticId(0x103000 + index), costs: [energy(3)], status: "authored", speed: "interrupt",
    abilities: () => abilities ?? [alternativeCost(energy(0), giveOpponentPointsCost(5)), event(dissolve(target(enemyCharacter())))], ...fields };
}
export function alternativeFixture(side: Side, card = alternativeCard(1), mine: SideSetup = {}, theirs: SideSetup = {}, definitions: readonly EngineCardDefinition[] = [], from: PlayZone = "hand") {
  const engine = createEngine(testCatalog([card, ...definitions]));
  const board = boardState(engine.catalog, { active: side, phase: "day",
    [side]: { hand: from === "hand" ? [card.id] : [], void: from === "void" ? [card.id] : [],
      deck: from === "deck" ? [card.id, ...alternativeDeck] : alternativeDeck, energy: 10, score: 0, ...mine },
    [opponent(side)]: { back: [v.vanilla1.id, v.vanilla2.id], hand: [v.interruptEvent.id], energy: 10, deck: alternativeDeck, ...theirs },
  });
  const id = from === "hand" ? board.ids[side].hand[0] : from === "void" ? board.ids[side].void[0] : board.ids[side].deck[0];
  const state: BattleState = { ...board.state, config: { ...board.state.config, autoAnswerForcedPrompts: false } };
  return { engine, state, ids: board.ids, id, side, from, action: { kind: "play" as const, card: id, from } };
}
export function alternativeAnswers(route: "normal" | "alternativeCost" = "alternativeCost", overrides: Partial<Record<Prompt["purpose"]["role"], Answer>> = {}) {
  const prompts: Prompt[] = [];
  const source: AnswerSource = { answer(prompt) {
    prompts.push(prompt);
    const explicit = overrides[prompt.purpose.role];
    if (explicit !== undefined) return explicit;
    if ((prompt.purpose.role === "playRoute" || prompt.purpose.role === "voidRoute") && prompt.kind === "chooseMode") {
      return prompt.options.find(option => option.route === route)?.mode ?? firstLegalAnswer(prompt);
    }
    if (prompt.kind === "chooseTargets" || prompt.kind === "chooseCards") return prompt.candidates.slice(0, prompt.min);
    if (prompt.kind === "chooseNumber") return prompt.min;
    if (prompt.kind === "confirm") return true;
    return firstLegalAnswer(prompt);
  } };
  return { prompts, source };
}
export const alternativeSlice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
export function alternativeApplied(outcome: IntentOutcome) {
  expect(outcome.kind).toBe("applied");
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`Expected successful intent: ${JSON.stringify(outcome)}`);
  return outcome;
}
export const offeredAlternative = (f: ReturnType<typeof alternativeFixture>) => f.engine.legalActions(f.state, f.side).some(action => action.kind === "play" && action.card === f.id);
export const legalAlternativeMode = (prompt: Prompt, mode: number) => isLegalAnswer(prompt, mode);
