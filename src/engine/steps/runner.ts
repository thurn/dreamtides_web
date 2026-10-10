import type { EngineCatalog } from "../catalog";
import { checkMandatoryCycle, trackLoops } from "../loops/tracker";
import { checkVictory, endBattle } from "../rules/victory";
import { cloneState } from "../state/clone";
import type { BattleState } from "../state/types";
import { Context } from "./context";
import { Suspend } from "./errors";
import { feasibilityGuard, type SearchMemo } from "./feasibility";
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
  /**
   * The engine's memo of feasibility searches: the guard of a step with a
   * commit point reads its legality search and earlier decisions from it,
   * so a re-run makes no dry runs.
   */
  readonly searches?: SearchMemo;
}

/** Whether a player made a real choice: an answer that was not forced. */
function madeChoice(answers: readonly RecordedAnswer[]): boolean {
  return answers.some((answer) => answer.auto !== true);
}

/**
 * Runs one step from a committed state. The step works on a private copy,
 * so a step that suspends or throws leaves `start` untouched. A step with a
 * commit point offers only play-time answers with a feasible continuation,
 * within its one feasibility budget (steps/feasibility.ts). A completed
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
  // A top-level action starts a new run of automatic choices.
  if (options.automatic !== true) work.automaticChoices = 0;
  const definition = stepDefinition(step.kind);
  const ctx = new Context(work, catalog, source, {
    prefix: options.prefix,
    dryRun: options.dryRun,
    replay: options.replay,
    canceller: definition.canceller(start, step),
    ...(definition.hasCommitPoint === true && options.dryRun !== true ? { guard: feasibilityGuard(start, step, catalog, options.searches) } : {}),
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
  checkVictory(ctx, ctx.events);
  // A run of automatic steps nobody can stop ends in a draw when it repeats a
  // state exactly or passes the cap (rules § Mandatory Loops). A step whose
  // prompt a player answered by choice, and a loop iteration, which replays
  // its player's decisions, start a new run; a forced answer does not.
  const decisionFree = options.automatic === true && step.kind !== "loopIteration" && !madeChoice(ctx.answers);
  work.automaticSteps = decisionFree ? start.automaticSteps + 1 : 0;
  if (options.automatic === true && madeChoice(ctx.answers)) work.automaticChoices += 1;
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
