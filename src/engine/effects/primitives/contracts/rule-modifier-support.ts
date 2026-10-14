/** Synthetic rule fixtures and small wrappers around the public engine/step/fold APIs. */
import { expect } from "vitest";
import type { EngineCardDefinition, EngineDreamsignDefinition } from "../../../catalog";
import { energy, event, staticAbility } from "../../../dsl/builders";
import { createEngine, type Engine } from "../../../engine";
import type { BattleSlice, IntentOutcome } from "../../../fold/slice";
import { stateHash } from "../../../state/hash";
import type { BattleState } from "../../../state/types";
import type { Side } from "../../../state/ids";
import { opponent } from "../../../state/ids";
import type { Step } from "../../../steps/kinds";
import { runStep } from "../../../steps/runner";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { boardState, type BoardSetup } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { parseJourneyBattleFoldState } from "../../../../rules/battle/fold";
import { parseBattleId, parseDreamsignId, parseOpponentId, parseSiteId } from "../../../../types/identifiers";
import type { Effect } from "../../registry";
import { draw } from "../draw";
import { ruleModifier } from "../rule-modifier";

export const SIGN = { apple: parseDreamsignId("00000000-0000-4000-8000-000000236001"),
  stone: parseDreamsignId("00000000-0000-4000-8000-000000236002"), hourglass: parseDreamsignId("00000000-0000-4000-8000-000000236003") };
export const signs: readonly EngineDreamsignDefinition[] = [
  { id: SIGN.apple, status: "authored", abilities: () => [staticAbility(ruleModifier({ rule: "eventAlternative", energy: 1 }))] },
  { id: SIGN.stone, status: "authored", abilities: () => [staticAbility(ruleModifier({ rule: "carryEnergy" }))] },
  { id: SIGN.hourglass, status: "authored", abilities: () => [staticAbility(ruleModifier({ rule: "dawnThreshold", count: 3, effect: draw(1) }))] },
];
export const deck = Array.from({ length: 12 }, () => v.vanilla1.id);
export function card(index: number, effect: Effect, extra: Partial<EngineCardDefinition> = {}): EngineCardDefinition {
  return { ...v.event0, id: syntheticId(0x236100 + index), status: "authored", costs: [energy(4)],
    speed: "fast", abilities: () => [event(effect)], ...extra };
}
export function world(side: Side, cards: readonly EngineCardDefinition[], setup: Partial<BoardSetup> = {}, emblems = signs) {
  const engine = createEngine(testCatalog(cards, { dreamsigns: emblems }));
  const board = boardState(engine.catalog, { active: side, phase: "day", scoreToWin: 1000,
    [side]: { hand: cards.filter(c => c.cardType === "event").map(c => c.id), deck, energy: 20, dreamsigns: [SIGN.apple] },
    [opponent(side)]: { deck, energy: 20 }, ...setup });
  return { engine, ...board, state: { ...board.state, config: { ...board.state.config, autoAnswerForcedPrompts: false } } };
}
export function step(engine: Engine, state: BattleState, action: Step, answers: ConstructorParameters<typeof ScriptedSource>[0] = []) {
  const before = stateHash(state);
  const source = answers.length === 0 ? NO_PROMPTS : new ScriptedSource(answers);
  const result = runStep(state, action, source, engine.catalog);
  if (result.kind !== "done") throw new Error(`Unexpected ${result.prompt.kind}`);
  if (source instanceof ScriptedSource) source.assertExhausted();
  expect(stateHash(state)).toBe(before);
  expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  return result;
}
export function drain(engine: Engine, initial: BattleState) {
  let state = initial;
  for (let count = 0; state.triggerQueue.length > 0; count++) {
    if (count > 40) throw new Error("Synthetic trigger fixture did not drain");
    state = step(engine, state, { kind: "resolveTrigger" }).state;
  }
  return state;
}
export const sliceOf = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
export function applied(outcome: IntentOutcome) {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(JSON.stringify(outcome));
  return outcome;
}
export function saved(slice: BattleSlice) {
  return { mode: { kind: "journey" }, init: { battleId: parseBattleId("battle-rule-modifier"), siteId: parseSiteId("site-rule-modifier"), nodeId: null,
    completionLevelAtStart: 0, essenceReward: 0, opponentAbilityActive: false,
    enemyDescriptor: { id: parseOpponentId("opponent-rule-modifier"), name: "", subtitle: "", portraitSeed: 0, abilityText: "", dreamsigns: [], signatureCards: [] }, avatarSummary: null, cardDefinitions: [],
  }, engine: { init: { seed: "seed", scoreToWin: 1000, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: JSON.parse(JSON.stringify(slice)) as unknown } };
}
export function restored(slice: BattleSlice): BattleSlice {
  const loaded = parseJourneyBattleFoldState(saved(slice));
  if (loaded === null) throw new Error("Synthetic saved slice rejected");
  return loaded.engine.slice;
}
