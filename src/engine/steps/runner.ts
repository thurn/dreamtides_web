import type { EngineCatalog } from "../catalog";
import { checkVictory, endBattle } from "../rules/victory";
import { cloneState } from "../state/hash";
import type { BattleState } from "../state/types";
import { Context } from "./context";
import { Suspend } from "./errors";
import { stepDefinition, type Step } from "./kinds";
import type { AnswerSource, RecordedAnswer, StepResult } from "./types";

export interface RunOptions {
  readonly prefix?: readonly RecordedAnswer[];
  readonly dryRun?: boolean;
  /** An automatic step counts toward the resolution cap; a top-level action resets the count. */
  readonly automatic?: boolean;
}

/**
 * Runs one step from a committed state. The step works on a private copy,
 * so a step that suspends or throws leaves `start` untouched. A completed
 * step gets the state-based victory check (P5), the resolution-cap count,
 * and a new version.
 */
export function runStep(
  start: BattleState,
  step: Step,
  source: AnswerSource,
  catalog: EngineCatalog,
  options: RunOptions = {},
): StepResult {
  const work = cloneState(start);
  const definition = stepDefinition(step.kind);
  const ctx = new Context(work, catalog, source, {
    prefix: options.prefix,
    dryRun: options.dryRun,
    canceller: definition.canceller(start, step),
  });
  try {
    definition.run(ctx, step);
  } catch (error) {
    if (error instanceof Suspend) {
      return {
        kind: "suspended",
        prompt: error.prompt,
        display: work,
        events: ctx.events,
        answers: ctx.answers,
      };
    }
    throw error;
  }
  checkVictory(ctx);
  // A run of automatic steps nobody can stop ends in a draw past the cap
  // (rules § Mandatory Loops).
  work.automaticSteps = options.automatic === true ? start.automaticSteps + 1 : 0;
  if (work.automaticSteps > work.config.resolutionCap) {
    endBattle(ctx, { kind: "draw", reason: "resolutionCap" });
  }
  work.version += 1;
  return { kind: "done", state: work, events: ctx.events, answers: ctx.answers };
}
