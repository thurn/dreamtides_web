import type { EngineCatalog } from "../catalog";
import { checkVictory } from "../rules/victory";
import { cloneState } from "../state/hash";
import type { BattleState } from "../state/types";
import { Context } from "./context";
import { stepDefinition, type Step } from "./kinds";
import type { AnswerSource, StepResult } from "./types";

/**
 * Runs one step from a committed state to the next committed state. The step
 * works on a private copy, so a step that throws leaves `start` untouched.
 * The state-based victory check runs after every step (P5).
 */
export function runStep(
  start: BattleState,
  step: Step,
  source: AnswerSource,
  catalog: EngineCatalog,
): StepResult {
  const work = cloneState(start);
  const ctx = new Context(work, catalog, source);
  stepDefinition(step.kind).run(ctx, step);
  checkVictory(ctx);
  work.version += 1;
  return { state: work, events: ctx.events };
}
