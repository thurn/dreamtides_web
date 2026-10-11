/**
 * Shared synthetic fixtures for the loop tests: the loop cards, the engine
 * over them, and its board and action helpers.
 */
import type { EngineCardDefinition } from "../catalog";
import { energy, self } from "../dsl/builders";
import { onMaterialized, triggered, whenOpponentPlays } from "../dsl/triggers";
import * as p from "../effects/primitives";
import { createEngine } from "../engine";
import type { EngineEvent } from "../events";
import type { Action } from "../rules/actions";
import type { InstanceId, Side } from "../state/ids";
import type { BattleState } from "../state/types";
import { NO_PROMPTS } from "../steps/sources";
import type { AnswerSource } from "../steps/types";
import { boardState, type BoardSetup } from "../testing/board";
import { CYCLE_CARDS, LOOP_CARDS } from "../testing/loop-cards";
import { SYNTHETIC, syntheticId, testCatalog } from "../testing/synthetic-cards";
import { TRIGGER } from "../testing/trigger-cards";
import type { LoopEndReason } from "./types";

/** "When the opponent plays a card, you may lose 1●." — gives the opponent of a loop of plays a real choice. */
export const reluctant: EngineCardDefinition = {
  id: syntheticId(0xd20),
  cardType: "character",
  costs: [energy(1)],
  spark: 1,
  subtype: "Warrior",
  speed: "standard",
  status: "authored",
  abilities: () => [triggered(whenOpponentPlays(), p.optional(p.gainEnergy(-1)))],
};

/**
 * "▸Materialized: If you have 1● or more, lose 1●; otherwise gain 1●. Then
 * trigger this character's ▸Materialized abilities." — a mandatory cycle
 * that repeats a state every second step.
 */
export const toggleEcho: EngineCardDefinition = {
  ...reluctant,
  id: syntheticId(0xd21),
  abilities: () => {
    const echo = p.triggerAbility(self(), "materialized");
    return [triggered(onMaterialized(), p.ifThen({ cond: "energyAtLeast", amount: 1 }, p.sequence(p.gainEnergy(-1), echo), p.sequence(p.gainEnergy(1), echo)))];
  },
};

export const engine = createEngine(testCatalog([...LOOP_CARDS, ...CYCLE_CARDS, reluctant, toggleEcho, TRIGGER.secondCardPoints]));
export const v = SYNTHETIC;
export const deck = Array.from({ length: 6 }, () => v.vanilla1.id);

export function board(setup: Partial<BoardSetup>) {
  return boardState(engine.catalog, { active: "player", phase: "day", ...setup });
}

export function sourceOf(ids: { back: (InstanceId | null)[] }): InstanceId {
  const source = ids.back[0];
  if (source == null) throw new Error("no source");
  return source;
}

export function activate(state: BattleState, source: InstanceId, answers: AnswerSource = NO_PROMPTS) {
  return engine.apply(state, "player", { kind: "activate", source, ability: 0 }, answers);
}

/** The `repeatLoop` action on offer to `side`. */
export function offer(state: BattleState, side: Side = "player"): Extract<Action, { kind: "repeatLoop" }> | undefined {
  return engine.legalActions(state, side).find((action) => action.kind === "repeatLoop");
}

export function repeat(state: BattleState, count: number | "untilVictory") {
  const loop = offer(state);
  if (loop === undefined) throw new Error("no loop on offer");
  return engine.apply(state, "player", { ...loop, count }, NO_PROMPTS);
}

export function ended(events: readonly EngineEvent[]): { iterations: number; reason: LoopEndReason } | undefined {
  const event = events.find((entry) => entry.kind === "loopEnded");
  return event?.kind === "loopEnded" ? { iterations: event.iterations, reason: event.reason } : undefined;
}
