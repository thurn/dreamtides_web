// Pure fold driver for the event-sourcing engine.
//
// `foldEvents` folds a batch of committed events onto a base state in seq
// order and contains reducer throws. It is game-agnostic: it never imports from src/rules/ or
// src/session/, touches no IO, and reads no clock (timestamps come from event
// data, RNG from `eventRng`). Everything on the fold path is synchronous, so
// the local log's append folds and commits in one call.

import { eventRng } from "./rng";
import type {
  BounceReason,
  EngineConfig,
  EventContext,
  EventOutcome,
  GameEvent,
  Genesis,
  ReducerResult,
  ReducerLogRecord,
} from "./types";

/** One event's result: its seq, the event, and how the reducer resolved it. */
export interface FoldOutcome {
  seq: number;
  event: GameEvent;
  outcome: EventOutcome;
  /** Diagnostics from an applied reducer result; never part of folded state. */
  logRecords?: readonly ReducerLogRecord[];
  /** Machine-readable cause for clear logging and player-facing feedback. */
  bounceReason?: BounceReason;
  /**
   * Present only when the engine turned a failure into a bounce: a reducer
   * throw contained in production (poison-event containment) or a malformed
   * event that never reached the reducer. Absent on ordinary applied/bounced
   * outcomes. Surfacing it here lets the log record `fold_error` loudly
   * without the fold ever throwing.
   */
  error?: FoldError;
}

/** A contained failure attached to a bounced outcome. */
export interface FoldError {
  seq: number;
  message: string;
  stack?: string;
}

export interface FoldBase<S> {
  /** The seq that `state` corresponds to: the checkpoint or snapshot it resumes from. */
  seq: number;
  state: S;
}

export interface FoldOptions {
  /**
   * When true, a reducer throw propagates so programmer errors stay visible.
   * When false, it is contained as a bounce plus an error report. Defaults to
   * the build's dev flag.
   */
  devMode?: boolean;
}

export interface FoldResult<S> {
  state: S;
  lastSeq: number;
  outcomes: FoldOutcome[];
}

/** Build-time dev flag; overridable per call via `options.devMode`. */
const ENV_DEV: boolean = typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV);

/**
 * Folds `events` (already in ascending seq order) onto `base.state`,
 * reporting a per-event outcome. Pure: given the same inputs it returns
 * identical state and outcomes.
 */
export function foldEvents<S>(
  config: EngineConfig<S>,
  genesis: Genesis,
  base: FoldBase<S>,
  events: Array<{ seq: number; event: GameEvent }>,
  options: FoldOptions = {},
): FoldResult<S> {
  const devMode = options.devMode ?? ENV_DEV;
  let state = base.state;
  let lastSeq = base.seq;
  const outcomes: FoldOutcome[] = [];

  for (const { seq, event } of events) {
    lastSeq = seq;
    const ctx: EventContext = {
      seq,
      contentConfig: genesis.contentConfig,
      rng: eventRng(genesis.seed, seq),
      timestamp: event.clientTimestamp,
    };

    let result: ReducerResult<S>;
    try {
      result = config.reducer(state, event, ctx);
    } catch (caught) {
      if (devMode) {
        // Dev: let programmer errors surface at their origin.
        throw caught;
      }
      // Production: contain the throw as a bounce plus a loud error report.
      const err = caught instanceof Error ? caught : new Error(String(caught));
      outcomes.push({
        seq,
        event,
        outcome: "bounced",
        bounceReason: "fold_error",
        error: { seq, message: err.message, stack: err.stack },
      });
      continue;
    }

    if (result.outcome === "applied") state = result.state;
    outcomes.push({
      seq,
      event,
      outcome: result.outcome,
      ...(result.outcome === "applied" && result.logRecords !== undefined
        ? { logRecords: result.logRecords }
        : {}),
      ...(result.outcome === "bounced" && result.bounceReason !== undefined
        ? { bounceReason: result.bounceReason }
        : {}),
    });
  }

  return { state, lastSeq, outcomes };
}
