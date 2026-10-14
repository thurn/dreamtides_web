import type { EmblemDefinitions, EngineCardDefinition } from "../../../catalog";
import { createEngine, type Engine } from "../../../engine";
import { energy } from "../../../dsl/builders";
import type { InstanceId, Side } from "../../../state/ids";
import { opponent } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS } from "../../../steps/sources";
import type { AnswerSource } from "../../../steps/types";
import { boardState, type SideSetup } from "../../../testing/board";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";

export function reclaimCard(index: number, fields: Partial<EngineCardDefinition> = {}): EngineCardDefinition {
  return { ...v.event0, id: syntheticId(0x234000 + index), status: "authored", costs: [energy(3)], abilities: () => [], ...fields };
}

export function reclaimFixture(side: Side, definitions: readonly EngineCardDefinition[], mine: SideSetup, theirs: SideSetup = {}, emblems: EmblemDefinitions = {}) {
  const engine = createEngine(testCatalog(definitions, emblems));
  const deck = Array.from({ length: 20 }, () => v.vanilla1.id);
  return { engine, ...boardState(engine.catalog, { active: side, phase: "day",
    [side]: { deck, energy: 30, score: 10, ...mine }, [opponent(side)]: { deck, energy: 30, ...theirs } }) };
}

export function reclaimSettle(engine: Engine, state: BattleState, source: AnswerSource = NO_PROMPTS): BattleState {
  return passUntil(engine, state, next => next.stack.length === 0 && next.triggerQueue.length === 0, source).state;
}

export function reclaimPlay(engine: Engine, state: BattleState, side: Side, card: InstanceId, from: "hand" | "void" = "void", source: AnswerSource = NO_PROMPTS) {
  const played = engine.apply(state, side, { kind: "play", card, from }, source);
  return { ...played, state: reclaimSettle(engine, played.state, source) };
}
