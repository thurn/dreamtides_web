/** Synthetic public consumers of the preceding-global-turn physical scoring condition. */
import type { EngineCardDefinition } from "../../../catalog";
import { activated, all, anyCharacter, characterYouControl, enemyCharacter, energy, event, everyIn, playCondition, scoredWithCharacterLastTurn, self, staticAbility, target, thisCardIn } from "../../../dsl/builders";
import { triggered, whenScores } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import type { BattleSlice, IntentOutcome } from "../../../fold/slice";
import type { Answer, Prompt } from "../../../prompts/types";
import type { Action } from "../../../rules/actions";
import { opponent, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState, DeckEntry } from "../../../state/types";
import { NO_PROMPTS } from "../../../steps/sources";
import { boardState, type SideSetup } from "../../../testing/board";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { at, passUntil } from "../../../testing/trigger-harness";
import { conditionHolds } from "../../interpreter";
import * as p from "../index";

const make = (n: number, abilities: EngineCardDefinition["abilities"], character = false): EngineCardDefinition => ({
  ...(character ? v.vanilla3 : v.interruptEvent), id: syntheticId(0x623100 + n), costs: [energy(0)], status: "authored", abilities,
});
export const scoringCards = {
  reader: make(1, () => [event(p.ifThen(scoredWithCharacterLastTurn(), p.gainEnergy(3), p.gainEnergy(1)))]),
  opponentReader: make(2, () => [event(p.ifThen(scoredWithCharacterLastTurn("opponent"), p.gainEnergy(3), p.gainEnergy(1)))]),
  watcher: make(3, () => [staticAbility(p.costModifierNth("you", { cardType: "character" }, 1, { reduce: 2 }), { while: scoredWithCharacterLastTurn() })], true),
  gated: { ...make(4, () => [playCondition(scoredWithCharacterLastTurn())], true), costs: [energy(2)] },
  scorer: make(5, () => [activated([], p.returnToHand(self())), activated([], p.materializeFigmentCopy(self())), activated([], p.awaken(all(characterYouControl())))], true),
  extra: make(6, () => [event(p.takeExtraTurn())]),
  otherExtra: make(7, () => [event(p.eachPlayer(p.takeExtraTurn()))]),
  flat: make(8, () => [event(p.gainPoints(7))]),
  steal: make(9, () => [event(p.gainControl(target(enemyCharacter())))]),
  returnAny: make(10, () => [event(p.returnToHand(target(anyCharacter())))]),
  reveal: make(12, () => [event(p.sequence(p.draw(3), p.reveal(), p.materialize(everyIn("hand", { cardType: "character" }), { awakened: true })))]),
  zero: { ...make(13, () => [], true), spark: 0 },
  paused: make(14, () => [event(p.sequence(p.ifThen(scoredWithCharacterLastTurn(), p.gainEnergy(3), p.gainEnergy(1)), p.optional(p.gainPoints(2))))]),
  shuffled: make(16, () => [triggered(whenScores(), p.sequence(p.returnToHand(self()), p.shuffleInto([thisCardIn("hand")])))] , true),
  modal: make(19, () => [event(p.chooseOne(p.ifThen(scoredWithCharacterLastTurn(), p.gainEnergy(3), p.gainEnergy(1)), p.gainEnergy(0)))]),
};
export const scoringEngine = createEngine(testCatalog(Object.values(scoringCards)));
export const scoringDeck = Array.from({ length: 18 }, () => v.vanilla1.id);
export function scoringBoard(side: Side, own: SideSetup = {}, other: SideSetup = {}) {
  return boardState(scoringEngine.catalog, { active: side, phase: "day", scoreToWin: 1000,
    [side]: { front: [scoringCards.scorer.id], back: [scoringCards.watcher.id], hand: [scoringCards.reader.id], energy: 20, deck: scoringDeck, ...own },
    [opponent(side)]: { back: [scoringCards.watcher.id], hand: [scoringCards.reader.id], energy: 20, deck: scoringDeck, ...other } });
}
export function scoringAnswer(prompt: Prompt): Answer {
  if (prompt.kind === "chooseCards" || prompt.kind === "chooseTargets") return prompt.candidates.slice(0, prompt.min);
  if (prompt.kind === "confirm") return true;
  throw new Error(`Unexpected scoring prompt ${prompt.kind}`);
}
export function scoringApply(state: BattleState, side: Side, action: Action, selected?: InstanceId) {
  const out = scoringEngine.apply(state, side, action, { answer(prompt) {
    if (selected !== undefined && (prompt.kind === "chooseCards" || prompt.kind === "chooseTargets") && prompt.candidates.includes(selected)) return [selected];
    return scoringAnswer(prompt);
  } });
  const done = passUntil(scoringEngine, out.state, next => next.stack.length === 0 && next.triggerQueue.length === 0, { answer: scoringAnswer });
  return { state: done.state, events: [...out.events, ...done.events], steps: done.steps };
}
export function scoringPlay(state: BattleState, side: Side, card: InstanceId, selected?: InstanceId) {
  return scoringApply(state, side, { kind: "play", card, from: "hand" }, selected);
}
export function scoringNext(state: BattleState, side = opponent(state.turn.active)) {
  const number = state.turn.turnNumber;
  return passUntil(scoringEngine, state, next => next.turn.turnNumber > number && at(scoringEngine, side, "day")(next), { answer: scoringAnswer }, 120);
}
export function scoringHolds(state: BattleState, side: Side, player: "you" | "opponent" = "you") {
  return conditionHolds(state, scoringEngine.catalog, scoredWithCharacterLastTurn(player), { controller: side, source: { kind: "avatar", side }, optionalPaid: [] });
}
export function scoringLists(state: BattleState): Record<Side, DeckEntry[]> {
  const entries = (side: Side) => Object.values(state.instances).flatMap(card => card.owner === side && !card.status.created && card.printing.kind === "card" ? [{ cardId: card.printing.cardId, ...card.variant }] : []);
  return { player: entries("player"), enemy: entries("enemy") };
}
export const scoringSlice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, attempt: 0, publishedEvents: 0 });
export function scoringApplied(out: IntentOutcome): BattleSlice {
  if (out.kind !== "applied" || out.error !== null) throw new Error(`Unexpected scoring outcome ${JSON.stringify(out)}`);
  return out.slice;
}
export const scoringCopy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export { NO_PROMPTS, v };
