import type { EngineCatalog } from "../catalog";
import { checkMandatoryCycle, trackLoops } from "../loops/tracker";
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
  /**
   * An automatic step counts toward the resolution cap unless a player made a
   * choice in it; a top-level action resets the count.
   */
  readonly automatic?: boolean;
  /**
   * A step a loop iteration replays: every prompt must be answered by
   * `prefix`, and loop detection leaves the step alone.
   */
  readonly replay?: boolean;
}

/** Whether a player made a real choice: an answer that was not forced. */
function madeChoice(answers: readonly RecordedAnswer[]): boolean {
  return answers.some((answer) => answer.auto !== true);
}

/**
 * Runs one step from a committed state. The step works on a private copy,
 * so a step that suspends or throws leaves `start` untouched. A completed
 * step gets the state-based victory check (P5), the mandatory-loop checks
 * (an exact repeat and the resolution cap), loop detection, and a new
 * version.
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
    replay: options.replay,
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
  // A run of automatic steps nobody can stop ends in a draw when it repeats a
  // state exactly or passes the cap (rules § Mandatory Loops). A step whose
  // prompt a player answered by choice, and a loop iteration, which replays
  // its player's decisions, start a new run; a forced answer does not.
  const decisionFree = options.automatic === true && step.kind !== "loopIteration" && !madeChoice(ctx.answers);
  work.automaticSteps = decisionFree ? start.automaticSteps + 1 : 0;
  if (options.replay !== true) {
    checkMandatoryCycle(ctx, decisionFree);
  }
  if (work.automaticSteps > work.config.resolutionCap) {
    endBattle(ctx, { kind: "draw", reason: "resolutionCap" });
  }
  if (options.replay !== true) {
    trackLoops(start, work, step, ctx.answers, ctx.choosers, options.automatic === true);
  }
  work.version += 1;
  return { kind: "done", state: work, events: ctx.events, answers: ctx.answers };
}
