// Pure fold driver for the event-sourcing engine.
//
// `foldEvents` folds a batch of committed events onto a base state in seq
// order, computing each event's `intervening` window and containing reducer
// throws. It is game-agnostic: it never imports from src/rules/ or src/coop/,
// touches no IO, and reads no clock (timestamps come from event data, RNG
// from `eventRng`). Everything on the fold path is synchronous so compaction
// can run it inside RTDB's synchronous transaction callback.
//
// See docs/superpowers/specs/2026-07-01-coop-event-sourcing-rewrite-design.md
// §"The eventlog engine" (Read path and fold), §"The rules reducer" (Root
// fold and CAS policy), and §"Error handling and safety rails".

import { eventRng } from "./rng";
import type { EngineConfig, EventContext, EventOutcome, GameEvent, Genesis } from "./types";

/** One event's result: its seq, the event, and how the reducer resolved it. */
export interface FoldOutcome {
  seq: number;
  event: GameEvent;
  outcome: EventOutcome;
  /**
   * Present only when the engine turned a failure into a bounce: a reducer
   * throw contained in production (poison-event containment) or a malformed
   * event that never reached the reducer. Absent on ordinary applied/bounced
   * outcomes. Surfacing it here lets the client log `fold_error` loudly
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

/** Minimal identity of an applied event, used to answer intervening queries. */
export interface AppliedEntry {
  actor: string;
  type: string;
}

export interface FoldBase<S> {
  /**
   * The snapshot horizon (compaction baseSeq) that `state` corresponds to.
   * An event whose `basedOnSeq` is strictly below this can no longer have its
   * intervening window enumerated, so it is reported as "unknown". For an
   * uncompacted incremental fold this stays 0 even as `state` advances.
   */
  seq: number;
  state: S;
}

export interface FoldOptions {
  /**
   * Applied events from earlier folds (seq -> {actor, type}), so an event in
   * this batch can see intervening events committed before it. Only applied
   * events belong here; bounced events changed nothing and must be excluded.
   */
  appliedBySeq?: Map<number, AppliedEntry>;
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
 * computing each event's `intervening` window and reporting a per-event
 * outcome. Pure: given the same inputs it returns identical state and
 * outcomes.
 */
export function foldEvents<S>(
  config: EngineConfig<S>,
  genesis: Genesis,
  base: FoldBase<S>,
  events: Array<{ seq: number; event: GameEvent }>,
  options: FoldOptions = {},
): FoldResult<S> {
  const devMode = options.devMode ?? ENV_DEV;
  // Running index of applied events (seq -> {actor,type}), seeded from prior
  // folds and extended as events in this batch apply. Bounced events are
  // never recorded, so they can never appear in a later intervening window.
  const applied = new Map<number, AppliedEntry>(options.appliedBySeq ?? []);

  let state = base.state;
  let lastSeq = base.seq;
  const outcomes: FoldOutcome[] = [];

  for (const { seq, event } of events) {
    lastSeq = seq;

    // Malformed guard: a nonsensical basedOnSeq (negative, or not strictly
    // below its own seq) can never yield a coherent intervening window. Report
    // a bounced no-op without invoking the reducer (spec §Safety rails).
    if (!Number.isInteger(event.basedOnSeq) || event.basedOnSeq < 0 || event.basedOnSeq >= seq) {
      outcomes.push({
        seq,
        event,
        outcome: "bounced",
        error: { seq, message: `malformed basedOnSeq ${event.basedOnSeq} for seq ${seq}` },
      });
      continue;
    }

    const intervening = computeIntervening(applied, event.basedOnSeq, seq, base.seq);
    const ctx: EventContext = {
      seq,
      rng: eventRng(genesis.seed, seq),
      intervening,
      timestamp: event.clientTimestamp,
    };

    let result: { state: S; outcome: EventOutcome };
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
        error: { seq, message: err.message, stack: err.stack },
      });
      continue;
    }

    if (result.outcome === "applied") {
      state = result.state;
      applied.set(seq, { actor: event.actor, type: event.type });
    }
    outcomes.push({ seq, event, outcome: result.outcome });
  }

  return { state, lastSeq, outcomes };
}

/**
 * Computes the `intervening` value for an event: the applied events in the
 * open interval `(basedOnSeq, seq)`, in seq order, or the literal "unknown"
 * when the window predates the snapshot horizon.
 */
function computeIntervening(
  applied: Map<number, AppliedEntry>,
  basedOnSeq: number,
  seq: number,
  baseSeq: number,
): EventContext["intervening"] {
  if (basedOnSeq < baseSeq) {
    return "unknown";
  }
  const entries: Array<{ seq: number; actor: string; type: string }> = [];
  for (const [entrySeq, info] of applied) {
    if (entrySeq > basedOnSeq && entrySeq < seq) {
      entries.push({ seq: entrySeq, actor: info.actor, type: info.type });
    }
  }
  entries.sort((a, b) => a.seq - b.seq);
  return entries;
}

/**
 * Builds a seq -> {actor, type} index of the APPLIED events among `outcomes`,
 * for carrying the applied set forward across incremental folds. Bounced
 * events are excluded. `events` provides the authoritative event bodies keyed
 * by seq; `outcomes` supplies which seqs applied.
 */
export function buildAppliedIndex(
  events: Array<{ seq: number; event: GameEvent }>,
  outcomes: FoldOutcome[],
): Map<number, AppliedEntry> {
  const eventBySeq = new Map(events.map(({ seq, event }) => [seq, event]));
  const index = new Map<number, AppliedEntry>();
  for (const outcome of outcomes) {
    if (outcome.outcome !== "applied") {
      continue;
    }
    const event = eventBySeq.get(outcome.seq) ?? outcome.event;
    index.set(outcome.seq, { actor: event.actor, type: event.type });
  }
  return index;
}
