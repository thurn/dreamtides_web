/** Helpers for trigger and duration tests: a catalog with the trigger fixtures and a pass-driven turn runner. */
import type { EmblemDefinitions, EngineCardDefinition } from "../catalog";
import type { Engine } from "../engine";
import type { EngineEvent } from "../events";
import type { Phase, Side } from "../state/ids";
import type { BattleState } from "../state/types";
import type { Step } from "../steps/kinds";
import { NO_PROMPTS } from "../steps/sources";
import type { AnswerSource } from "../steps/types";
import { DSL_CARDS } from "./dsl-cards";
import { STACK_CARDS, SYNTHETIC_EMBLEMS } from "./stack-cards";
import { testCatalog } from "./synthetic-cards";
import { TRIGGER_CARDS, TRIGGER_EMBLEMS } from "./trigger-cards";

/** The trigger, stack, and DSL fixtures and emblems, plus `extra`. */
export function triggerCatalog(extra: readonly EngineCardDefinition[] = [], emblems: EmblemDefinitions = {}) {
  return testCatalog([...TRIGGER_CARDS, ...STACK_CARDS, ...DSL_CARDS, ...extra], {
    avatars: [...(emblems.avatars ?? []), ...(TRIGGER_EMBLEMS.avatars ?? []), ...(SYNTHETIC_EMBLEMS.avatars ?? [])],
    dreamsigns: [...(emblems.dreamsigns ?? []), ...(TRIGGER_EMBLEMS.dreamsigns ?? []), ...(SYNTHETIC_EMBLEMS.dreamsigns ?? [])],
  });
}

/** A committed state after a step, with the step and its events. */
export interface Observed {
  readonly state: BattleState;
  readonly step: Step;
  readonly events: readonly EngineEvent[];
}

/**
 * Passes for whichever side holds the decision until `done` holds, recording
 * every committed step. Throws after `limit` passes.
 */
export function passUntil(
  engine: Engine,
  start: BattleState,
  done: (state: BattleState) => boolean,
  source: AnswerSource = NO_PROMPTS,
  limit = 40,
): { state: BattleState; events: EngineEvent[]; steps: Observed[] } {
  let state = start;
  const events: EngineEvent[] = [];
  const steps: Observed[] = [];
  for (let count = 0; !done(state); count++) {
    const decision = engine.decision(state);
    if (decision === null || count >= limit) throw new Error(`Stuck at ${state.turn.active} ${state.turn.phase}`);
    const result = engine.apply(state, decision.side, { kind: "pass" }, source, (next, step, stepEvents) => {
      steps.push({ state: next, step, events: stepEvents });
    });
    events.push(...result.events);
    state = result.state;
  }
  return { state, events, steps };
}

/** Whether `side` holds a decision in `phase`. */
export function at(engine: Engine, side: Side, phase: Phase): (state: BattleState) => boolean {
  return (state) => state.turn.active === side && state.turn.phase === phase && engine.decision(state) !== null;
}
