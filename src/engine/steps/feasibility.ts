/**
 * Legality by search (engine-design § Legality by search). A play or an
 * activation is legal when some path of answers to its play-time prompts
 * reaches the commit point with costs it can pay. The search runs the step's
 * own code in dry runs, so legality never drifts from execution:
 *
 * - each run replays a prefix of answers, answers every later prompt with
 *   its first legal answer (`legalAnswers` order), and remembers each of
 *   those prompts as a choice point;
 * - reaching `commitPoint()` (`Feasible`) proves the path, its witness;
 * - an `EmptyPrompt` or an `Infeasible` plan is a dead end: the search
 *   backtracks to the deepest choice point with an untried answer and runs
 *   again with that answer in the prefix.
 *
 * **One budget per step.** A step's legality search and the guard that
 * narrows each of its play-time prompts share one budget of dry runs,
 * `BattleConfig.feasibilitySearchRuns`, spent along the path of answers
 * given: legality spends from it first, and each prompt spends what is left
 * after the prompts before it. The witness path that made the play legal is
 * free at every prompt, so a narrowed prompt is never empty for a play
 * legality offered.
 *
 * **Replay is free and identical.** What the guard decides at a prompt, and
 * the budget it leaves, is a function of the committed state, the step, and
 * the answers before it, memoized per committed state (`SearchMemo`). A fold
 * re-run reads it back, and a cold run (a reload, another engine) computes
 * the same result.
 */
import type { EngineCatalog } from "../catalog";
import { canonicalAnswer, legalAnswers } from "../prompts/answers";
import { promptFingerprint } from "../prompts/fingerprint";
import { narrowPrompt } from "../prompts/narrow";
import type { Answer, Prompt, PromptFingerprint } from "../prompts/types";
import type { Side } from "../state/ids";
import { cloneState } from "../state/clone";
import type { BattleState } from "../state/types";
import { Context, type Narrowed, type PromptGuard } from "./context";
import { EmptyPrompt, Feasible, Infeasible, ReplayDivergence } from "./errors";
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
 * A resumable depth-first search of the answer paths of a step from a
 * committed state that begin with a prefix of answers (recorded against the
 * prompts as rules code raises them), one dry run at a time.
 */
class PathSearch {
  private readonly points: ChoicePoint[] = [];
  private readonly canceller: Side | null;
  private replay: readonly RecordedAnswer[];
  /** `feasible` once a run reaches the commit point, `refuted` once every path has dead-ended. */
  outcome: "open" | "feasible" | "refuted" = "open";
  /**
   * The answers of the run that reached the commit point. At each of its
   * choice points, every answer before its own in `legalAnswers` order was
   * refuted first: a depth-first search moves on from an answer only once
   * every path through it has dead-ended.
   */
  witness: readonly RecordedAnswer[] = [];

  constructor(
    private readonly start: BattleState,
    private readonly step: Step,
    private readonly catalog: EngineCatalog,
    prefix: readonly RecordedAnswer[],
  ) {
    this.canceller = stepDefinition(step.kind).canceller(start, step);
    this.replay = prefix;
  }

  /** Runs the step once, along the first path not yet tried. */
  run(): void {
    const definition = stepDefinition(this.step.kind);
    const points = this.points;
    const source: AnswerSource = {
      answer(prompt) {
        const untried = legalAnswers(prompt);
        const first = untried.next();
        if (first.done === true) throw new EmptyPrompt(prompt);
        points.push({ index: ctx.answers.length, fingerprint: promptFingerprint(prompt), untried });
        return first.value;
      },
    };
    const ctx: Context = new Context(cloneState(this.start), this.catalog, source, {
      prefix: this.replay,
      dryRun: true,
      canceller: this.canceller,
    });
    try {
      definition.run(ctx, this.step);
      throw new Error(`A ${this.step.kind} step finished a dry run without reaching its commit point`);
    } catch (error) {
      if (error instanceof Feasible) {
        this.outcome = "feasible";
        this.witness = ctx.answers;
        return;
      }
      if (!(error instanceof EmptyPrompt || error instanceof Infeasible)) throw error;
    }
    const next = backtrack(points, ctx.answers);
    if (next === null) this.outcome = "refuted";
    else this.replay = next;
  }
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
 * Searches the answer paths of `step` from `start` that begin with `prefix`
 * for one that reaches the commit point, depth first, in `legalAnswers`
 * order, for at most `runs` runs of the step.
 */
export function searchCommitPoint(
  start: BattleState,
  step: Step,
  catalog: EngineCatalog,
  prefix: readonly RecordedAnswer[],
  runs: number = start.config.feasibilitySearchRuns,
): SearchOutcome {
  const search = new PathSearch(start, step, catalog, prefix);
  for (let run = 0; run < runs && search.outcome === "open"; run++) search.run();
  return { feasible: search.outcome === "feasible", exhausted: search.outcome === "open" };
}

/** Where the guard stands after the answers so far: the budget left, and a proven path through them, if any. */
interface Standing {
  readonly remaining: number;
  readonly witness: readonly RecordedAnswer[] | null;
}

/** What the guard decided at one play-time prompt, for the answers before it. */
interface GuardNode {
  readonly raw: Prompt;
  readonly fingerprint: PromptFingerprint;
  readonly narrowed: Narrowed;
  /** The budget left after this prompt's searches. */
  readonly remaining: number;
  /** A proven path through each offered answer, by `canonicalAnswer`. */
  readonly witnesses: ReadonlyMap<string, readonly RecordedAnswer[]>;
}

/**
 * The feasibility search of one step from one committed state: its legality
 * outcome and the guard's decision at each play-time prompt reached so far,
 * keyed by the answers before it.
 */
export interface StepSearch {
  /** Legality: whether some path reaches the commit point, and whether the budget ran out first. */
  readonly legality: SearchOutcome;
  /** The budget the legality search left, and its witness path. */
  readonly root: Standing;
  readonly nodes: Map<string, GuardNode>;
  /** Dry runs made for this search: legality and every guard decision, each once. */
  dryRuns: number;
}

/**
 * Per-engine memo of feasibility searches, keyed by the committed state
 * object and then the step. Committed states are never mutated, and every
 * entry is a function of the state, the step, and the answers, so an entry
 * never goes stale and a cold computation agrees with it. Never persisted.
 */
export type SearchMemo = WeakMap<BattleState, Map<string, StepSearch>>;

/** The memo key of a step: legality searches every candidate play and activation of every decision. */
function searchedStep(step: Step): string {
  switch (step.kind) {
    case "play":
      return step.slot === undefined ? `play ${step.card} ${step.from}` : `play ${step.card} ${step.from} ${step.slot.rank} ${String(step.slot.index)}`;
    case "activate":
      return typeof step.source === "string"
        ? `activate ${step.source} ${String(step.ability)}`
        : `activate ${JSON.stringify(step.source)} ${String(step.ability)}`;
    default:
      return JSON.stringify(step);
  }
}

/** The feasibility search of `step` from `start`, from `memo` when it holds one; its legality outcome is settled. */
export function stepSearch(start: BattleState, step: Step, catalog: EngineCatalog, memo?: SearchMemo): StepSearch {
  const key = searchedStep(step);
  const cached = memo?.get(start)?.get(key);
  if (cached !== undefined) return cached;
  const budget = start.config.feasibilitySearchRuns;
  const search = new PathSearch(start, step, catalog, []);
  let runs = 0;
  while (runs < budget && search.outcome === "open") {
    search.run();
    runs += 1;
  }
  const result: StepSearch = {
    legality: { feasible: search.outcome === "feasible", exhausted: search.outcome === "open" },
    root: { remaining: budget - runs, witness: search.outcome === "feasible" ? search.witness : null },
    nodes: new Map(),
    dryRuns: runs,
  };
  if (memo !== undefined) {
    let byStep = memo.get(start);
    if (byStep === undefined) {
      byStep = new Map();
      memo.set(start, byStep);
    }
    byStep.set(key, result);
  }
  return result;
}

/** The memo key of a prefix of answers: each prompt's fingerprint and its answer. */
function answeredPath(prefix: readonly RecordedAnswer[]): string {
  return JSON.stringify(prefix.map((answer) => [answer.fingerprint, answer.value]));
}

/** An answer of the prompt under examination, and its search until it is settled. */
interface Candidate {
  readonly order: number;
  readonly answer: Answer;
  readonly search: PathSearch;
}

/**
 * Decides one play-time prompt `raw`, raised after the answers `prefix`,
 * from `standing`. The answers before the witness's answer were refuted by
 * the search that found the witness, and its answer is proven, both for
 * free. Each later answer gets a search of its own; they share the budget
 * left, one run each in `legalAnswers` order, then one run each in turn
 * until each is settled or the budget is spent. An answer still unsettled
 * is unproven, and answers the budget left unexamined are truncated; both
 * are withheld.
 */
function decide(
  start: BattleState,
  step: Step,
  catalog: EngineCatalog,
  search: StepSearch,
  raw: Prompt,
  prefix: readonly RecordedAnswer[],
  standing: Standing,
): GuardNode {
  const fingerprint = promptFingerprint(raw);
  const known = standing.witness?.[prefix.length];
  const witnessed = known?.fingerprint === fingerprint ? canonicalAnswer(raw, known.value) : null;
  let remaining = standing.remaining;
  const proven: { order: number; answer: Answer; witness: readonly RecordedAnswer[] }[] = [];
  let open: Candidate[] = [];
  let truncated = false;
  let order = 0;
  let passedWitness = witnessed === null;
  const settle = (candidate: Candidate): boolean => {
    candidate.search.run();
    remaining -= 1;
    search.dryRuns += 1;
    if (candidate.search.outcome === "feasible") proven.push({ ...candidate, witness: candidate.search.witness });
    return candidate.search.outcome !== "open";
  };
  for (const answer of legalAnswers(raw)) {
    order += 1;
    if (!passedWitness) {
      if (canonicalAnswer(raw, answer) === witnessed && standing.witness !== null) {
        proven.push({ order, answer, witness: standing.witness });
        passedWitness = true;
      }
      continue;
    }
    if (remaining === 0) {
      truncated = true;
      break;
    }
    const candidate: Candidate = { order, answer, search: new PathSearch(start, step, catalog, [...prefix, { fingerprint, value: answer }]) };
    if (!settle(candidate)) open.push(candidate);
  }
  if (!passedWitness) throw new Error("A witness's answer is not a legal answer of the prompt it answered");
  while (open.length > 0 && remaining > 0) {
    open = open.filter((candidate) => remaining === 0 || !settle(candidate));
  }
  proven.sort((a, b) => a.order - b.order);
  return {
    raw,
    fingerprint,
    narrowed: { prompt: narrowPrompt(raw, proven.map((entry) => entry.answer)), unproven: open.length, truncated },
    remaining,
    witnesses: new Map(proven.map((entry) => [canonicalAnswer(raw, entry.answer), entry.witness])),
  };
}

/**
 * The guard of a real run of `step` from `start`: it narrows each play-time
 * prompt to the answers a search proves, within the step's one budget, and
 * memoizes each decision in the step's search (`memo`, when given) so a
 * re-run of the step makes no dry runs.
 */
export function feasibilityGuard(start: BattleState, step: Step, catalog: EngineCatalog, memo?: SearchMemo): PromptGuard {
  const search = stepSearch(start, step, catalog, memo);
  return {
    narrow(prompt: Prompt, prefix: readonly RecordedAnswer[]): Narrowed {
      const key = answeredPath(prefix);
      const cached = search.nodes.get(key);
      if (cached !== undefined) {
        // The safety net of replay: rules code raising a different prompt after the same answers is nondeterministic.
        const fingerprint = promptFingerprint(prompt);
        if (fingerprint !== cached.fingerprint) throw new ReplayDivergence(prefix.length, cached.fingerprint, fingerprint);
        return cached.narrowed.prompt === cached.raw ? { ...cached.narrowed, prompt } : cached.narrowed;
      }
      const node = decide(start, step, catalog, search, prompt, prefix, standingAfter(search, prefix));
      search.nodes.set(key, node);
      return node.narrowed;
    },
  };
}

/**
 * Where the guard stands after `prefix`: the root after legality, else the
 * decision at the prompt the last answer answered, with that answer's
 * witness. The guard decides prompts in order, so that decision is known.
 */
function standingAfter(search: StepSearch, prefix: readonly RecordedAnswer[]): Standing {
  const last = prefix[prefix.length - 1];
  if (last === undefined) return search.root;
  const parent = search.nodes.get(answeredPath(prefix.slice(0, -1)));
  if (parent === undefined) throw new Error("A play-time prompt was narrowed before the prompts preceding it");
  return { remaining: parent.remaining, witness: parent.witnesses.get(canonicalAnswer(parent.raw, last.value)) ?? null };
}
