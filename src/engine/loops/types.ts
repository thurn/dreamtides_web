/**
 * Loop bookkeeping kept in `BattleState` (rules § Infinite Loops): the
 * history the optional-loop shortcut is detected from, the loop on offer,
 * the repetition in progress, and the mark mandatory-cycle detection
 * compares against.
 */
import type { StateHash } from "../state/hash";
import type { Phase, Side } from "../state/ids";
import type { Step } from "../steps/kinds";
import type { RecordedAnswer } from "../steps/types";

/** A loop the engine detected, minted per battle (`l1`, `l2`, …). */
export type LoopId = `l${number}`;

/** A hash of a checkpoint state with its monotone resources abstracted away. */
export type LoopSignature = string & { readonly __brand: "LoopSignature" };

/**
 * One side's monotone resources at a checkpoint. A larger value is better
 * for that side. Void sizes and turn counters are abstracted away too, but
 * count neither as a gain nor as a loss (RD-hv-7x4l.9-1).
 */
export interface SideResources {
  readonly score: number;
  readonly currentEnergy: number;
  readonly maxEnergy: number;
  /** Cards in the side's deck: fewer brings fatigue nearer. */
  readonly deck: number;
  /** Counters on cards the side controls. */
  readonly counters: number;
  /** Permanent gained spark on cards the side controls. */
  readonly gainedSpark: number;
}

export type LoopResources = Readonly<Record<Side, SideResources>>;

/** A `main` decision with an empty stack and an empty trigger queue, reached during the history. */
export interface LoopCheckpoint {
  readonly signature: LoopSignature;
  readonly resources: LoopResources;
  /** The number of history actions taken before the checkpoint. */
  readonly action: number;
}

/** One committed step and the prompt answers it was given, each with its prompt's fingerprint. */
export interface LoopStep {
  readonly step: Step;
  readonly answers: readonly RecordedAnswer[];
}

/**
 * One top-level action of the history: its step first, then every
 * automatic step that ran before the next top-level decision.
 */
export interface LoopAction {
  readonly steps: readonly LoopStep[];
}

/** The scope a history belongs to: one acting side's main window in one turn. */
export interface LoopScope {
  readonly turn: number;
  readonly phase: Phase;
  readonly side: Side;
}

/**
 * A sequence of `side`'s top-level actions that returned the battle to an
 * equivalent position with a gain for `side` and none for the opponent.
 */
export interface LoopCandidate {
  readonly id: LoopId;
  readonly side: Side;
  readonly signature: LoopSignature;
  readonly actions: readonly LoopAction[];
}

/** An accepted `repeatLoop` in progress: one `loopIteration` step per iteration. */
export interface LoopRun {
  readonly loop: LoopId;
  /** Iterations still to run, or `"untilVictory"`. */
  readonly remaining: number | "untilVictory";
  /** Iterations completed so far. */
  readonly iterations: number;
}

/** Why a repetition ended. */
export type LoopEndReason =
  /** Every requested iteration ran. */
  | "completed"
  /** The run reached the iteration cap of the battle data module. */
  | "iterationCap"
  /** A recorded action was no longer legal. */
  | "illegalAction"
  /** A replayed prompt offered different options, or a prompt was added or dropped. */
  | "changedChoice"
  /** The battle ended. */
  | "battleEnded"
  /** The opponent gained a decision: a legal response other than passing. */
  | "opponentDecision"
  /** The steps or the position reached differed from the recorded sequence. */
  | "diverged";

/**
 * The state mandatory-cycle detection compares each later state with
 * (Brent's method): its full-state hash, the run's step count when it was
 * saved, and the steps until it is replaced.
 */
export interface CycleMark {
  readonly hash: StateHash;
  /** `BattleState.automaticSteps` when the hash was saved. */
  readonly at: number;
  /** Steps after `at` at which the mark moves on: doubles each time, up to the battle's window. */
  readonly window: number;
}

export interface LoopTracker {
  /** The scope of the history, or `null` while no history is kept. */
  scope: LoopScope | null;
  /** Checkpoints of the history, in order. */
  checkpoints: LoopCheckpoint[];
  /** Top-level actions of the history since its first checkpoint, in order. */
  actions: LoopAction[];
  /** The loop on offer at the current checkpoint, or the loop being repeated. */
  candidate: LoopCandidate | null;
  run: LoopRun | null;
  /** Next loop number to mint. */
  nextLoop: number;
  /**
   * Mandatory-cycle detection in the current run of automatic steps; `null`
   * before the run reaches the battle's check threshold.
   */
  cycle: CycleMark | null;
}

export function emptyLoopTracker(): LoopTracker {
  return { scope: null, checkpoints: [], actions: [], candidate: null, run: null, nextLoop: 1, cycle: null };
}
