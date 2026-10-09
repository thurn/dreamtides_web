/**
 * Legality by search (engine-design § Legality by search). A play or an
 * activation is legal when some path of answers to its play-time prompts
 * reaches the commit point with costs it can pay. The search runs the step's
 * own code in dry runs, so legality never drifts from execution:
 *
 * - each run replays a prefix of answers, answers every later prompt with
 *   its first legal answer (`legalAnswers` order), and remembers each of
 *   those prompts as a choice point;
 * - reaching `commitPoint()` (`Feasible`) proves the path;
 * - an `EmptyPrompt` or an `Infeasible` plan is a dead end: the search
 *   backtracks to the deepest choice point with an untried answer and runs
 *   again with that answer in the prefix.
 *
 * A search stops after `BattleConfig.feasibilitySearchRuns` runs and then
 * proves nothing. The guard narrows each play-time prompt of a real run to
 * the answers a search proves, examining at most that many answers, so
 * every answer offered has a feasible continuation and a legal play can
 * always be paid along whatever path its player answers.
 *
 * Every answer path is a deterministic function of the committed state and
 * the answers, so legality and narrowing are deterministic and the same for
 * an inline run, a fold re-run, and a loop replay.
 */
import type { EngineCatalog } from "../catalog";
import { legalAnswers } from "../prompts/answers";
import { promptFingerprint } from "../prompts/fingerprint";
import { narrowPrompt } from "../prompts/narrow";
import type { Answer, Prompt, PromptFingerprint } from "../prompts/types";
import { cloneState } from "../state/clone";
import type { BattleState } from "../state/types";
import { Context, type PromptGuard } from "./context";
import { EmptyPrompt, Feasible, Infeasible } from "./errors";
import { stepDefinition, type Step } from "./kinds";
import type { AnswerSource, RecordedAnswer } from "./types";

/** What a feasibility search found. */
export interface SearchOutcome {
  /** A path of answers after the prefix reaches the commit point with payable costs. */
  readonly feasible: boolean;
  /** The search ran out of runs before finding a path or exhausting the paths. */
  readonly exhausted: boolean;
}

/** A prompt the search answered itself, and the answers it has not tried there yet. */
interface ChoicePoint {
  /** The answer's position in the step's answers. */
  readonly index: number;
  readonly fingerprint: PromptFingerprint;
  readonly untried: Iterator<Answer>;
}

/**
 * Searches the answer paths of `step` from `start` that begin with `prefix`
 * (answers recorded against the prompts as rules code raises them) for one
 * that reaches the commit point, depth first, in `legalAnswers` order, for at
 * most `runs` runs of the step.
 */
export function searchCommitPoint(
  start: BattleState,
  step: Step,
  catalog: EngineCatalog,
  prefix: readonly RecordedAnswer[],
  runs: number = start.config.feasibilitySearchRuns,
): SearchOutcome {
  const definition = stepDefinition(step.kind);
  const canceller = definition.canceller(start, step);
  const points: ChoicePoint[] = [];
  let replay = prefix;
  for (let run = 0; run < runs; run++) {
    const source: AnswerSource = {
      answer(prompt) {
        const untried = legalAnswers(prompt);
        const first = untried.next();
        if (first.done === true) throw new EmptyPrompt(prompt);
        points.push({ index: ctx.answers.length, fingerprint: promptFingerprint(prompt), untried });
        return first.value;
      },
    };
    const ctx: Context = new Context(cloneState(start), catalog, source, { prefix: replay, dryRun: true, canceller });
    try {
      definition.run(ctx, step);
      throw new Error(`A ${step.kind} step finished a dry run without reaching its commit point`);
    } catch (error) {
      if (error instanceof Feasible) return { feasible: true, exhausted: false };
      if (!(error instanceof EmptyPrompt || error instanceof Infeasible)) throw error;
    }
    const next = backtrack(points, ctx.answers);
    if (next === null) return { feasible: false, exhausted: false };
    replay = next;
  }
  return { feasible: false, exhausted: true };
}

/** The prefix for the next run: the answers up to the deepest choice point with an untried answer, then that answer. */
function backtrack(points: ChoicePoint[], answers: readonly RecordedAnswer[]): RecordedAnswer[] | null {
  for (let point = points[points.length - 1]; point !== undefined; point = points[points.length - 1]) {
    const next = point.untried.next();
    if (next.done !== true) {
      return [...answers.slice(0, point.index), { fingerprint: point.fingerprint, value: next.value }];
    }
    points.pop();
  }
  return null;
}

/**
 * The guard of a real run of `step` from `start`: it narrows each play-time
 * prompt to the answers a search proves, examining the prompt's answers in
 * `legalAnswers` order and at most `feasibilitySearchRuns` of them. When a
 * search for an answer runs out, or answers go unexamined, the answer is
 * withheld and counted as unproven.
 */
export function feasibilityGuard(start: BattleState, step: Step, catalog: EngineCatalog): PromptGuard {
  const runs = start.config.feasibilitySearchRuns;
  return {
    narrow(prompt: Prompt, prefix: readonly RecordedAnswer[]) {
      const fingerprint = promptFingerprint(prompt);
      const feasible: Answer[] = [];
      let unproven = 0;
      let examined = 0;
      for (const answer of legalAnswers(prompt)) {
        if (examined === runs) {
          unproven += 1;
          break;
        }
        examined += 1;
        const outcome = searchCommitPoint(start, step, catalog, [...prefix, { fingerprint, value: answer }], runs);
        if (outcome.feasible) feasible.push(answer);
        else if (outcome.exhausted) unproven += 1;
      }
      return { prompt: narrowPrompt(prompt, feasible), unproven };
    },
  };
}
