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
import type {
  BounceReason,
  EngineConfig,
  EventContext,
  EventActor,
  EventOutcome,
  EventType,
  GameEvent,
  Genesis,
  ReducerResult,
} from "./types";

/** One event's result: its seq, the event, and how the reducer resolved it. */
export interface FoldOutcome {
  seq: number;
  event: GameEvent;
  outcome: EventOutcome;
  /** Machine-readable cause for clear logging and player-facing feedback. */
  bounceReason?: BounceReason;
  /**
   * Present only when the engine turned a failure into a bounce: a reducer
   * throw contained in production (poison-event containment) or a malformed
   * event that never reached the reducer. Absent on ordinary applied/bounced
   * outcomes. Surfacing it here lets the client log `fold_error` loudly
   * without the fold ever throwing.
   */
  error?: FoldError;
  /**
   * Present on a BOUNCED outcome whenever this event's intervening window was
   * enumerable: the seqs of the applied events in `(basedOnSeq, seq)` — i.e.
   * `ctx.intervening.map(e => e.seq)`, diagnostic context only (the
   * partner/non-neutral filtering CAS rule 3 applies is NOT re-applied here,
   * so this can include decision-neutral or self-chain entries too). Answers
   * "which partner event caused this bounce" for `event_bounced` log lines
   * (audit finding P3-9). Absent when the window predates the compaction
   * horizon (`ctx.intervening === "unknown"`) or the event never reached
   * `computeIntervening` at all (e.g. a malformed `basedOnSeq`) — an empty
   * array is a precise "nothing intervened, the reducer bounced it for its
   * own domain reasons" claim, distinct from "unknown"/absent.
   */
  interveningSeqs?: number[];
}

/** A contained failure attached to a bounced outcome. */
export interface FoldError {
  seq: number;
  message: string;
  stack?: string;
}

/** Minimal identity of an applied event, used to answer intervening queries. */
export interface AppliedEntry {
  actor: EventActor;
  type: EventType;
}

export interface FoldBase<S> {
  /**
   * The snapshot horizon (compaction baseSeq) that `state` corresponds to. It
   * is the default coverage horizon: absent an explicit `coveredFromSeq`, an
   * event whose `basedOnSeq` is strictly below this has its intervening window
   * reported as "unknown". A fold that seeds a full applied index passes
   * `coveredFromSeq: 0` to enumerate windows below this horizon too. For an
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
   * The lowest seq from which `appliedBySeq` is a COMPLETE record of applied
   * events. An event whose `basedOnSeq` is strictly below this can not have its
   * intervening window enumerated, so it folds to "unknown". When a full applied
   * index (dense from genesis) is supplied — as compaction and every client fold
   * now do — this is 0, and no window is ever "unknown". Defaults to `base.seq`
   * (the snapshot horizon), the coverage a fold gets when it seeds no index and
   * only accumulates applied events above its base.
   */
  coveredFromSeq?: number;
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
  // The horizon below which intervening windows can not be enumerated. With a
  // full applied index seeded (coveredFromSeq 0) no window is ever "unknown";
  // absent an explicit value it falls back to the snapshot horizon `base.seq`.
  const coveredFromSeq = options.coveredFromSeq ?? base.seq;
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
        bounceReason: "malformed_event",
        error: { seq, message: `malformed basedOnSeq ${event.basedOnSeq} for seq ${seq}` },
      });
      continue;
    }

    const intervening = computeIntervening(applied, event.basedOnSeq, seq, coveredFromSeq);
    const ctx: EventContext = {
      seq,
      contentConfig: genesis.contentConfig,
      rng: eventRng(genesis.seed, seq),
      intervening,
      timestamp: event.clientTimestamp,
    };
    // The window was enumerable (not "unknown") — diagnostic seqs a bounced
    // outcome below can attach. See FoldOutcome.interveningSeqs.
    const interveningSeqs = intervening === "unknown" ? undefined : intervening.map((e) => e.seq);

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
        interveningSeqs,
      });
      continue;
    }

    if (result.outcome === "applied") {
      state = result.state;
      applied.set(seq, { actor: event.actor, type: event.type });
    }
    outcomes.push({
      seq,
      event,
      outcome: result.outcome,
      ...(result.outcome === "bounced"
        ? {
            interveningSeqs,
            ...(result.bounceReason === undefined
              ? {}
              : { bounceReason: result.bounceReason }),
          }
        : {}),
    });
  }

  return { state, lastSeq, outcomes };
}

/**
 * Computes the `intervening` value for an event: the applied events in the
 * open interval `(basedOnSeq, seq)`, in seq order, or the literal "unknown"
 * when the window predates the coverage horizon (the lowest seq from which the
 * applied index is complete). With a full applied index (`coveredFromSeq` 0)
 * every window enumerates; "unknown" then signals only a genuinely missing
 * index, which does not arise in normal operation.
 */
function computeIntervening(
  applied: Map<number, AppliedEntry>,
  basedOnSeq: number,
  seq: number,
  coveredFromSeq: number,
): EventContext["intervening"] {
  if (basedOnSeq < coveredFromSeq) {
    return "unknown";
  }
  const entries: Array<{ seq: number; actor: EventActor; type: EventType }> = [];
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

/**
 * Serializes an applied index (seq -> {actor, type}) to the compact JSON string
 * compaction persists next to `baseSnapshot`. The stored object keys are the
 * decimal seqs; each value is the minimal `{actor, type}` an intervening query
 * needs (~40 bytes/entry). Growth is bounded only by the room's applied-event
 * count, which is acceptable at prototype room lifetimes.
 */
export function encodeAppliedIndex(index: Map<number, AppliedEntry>): string {
  const record: Record<number, AppliedEntry> = {};
  for (const [seq, entry] of index) {
    record[seq] = { actor: entry.actor, type: entry.type };
  }
  return JSON.stringify(record);
}

/**
 * Parses a persisted applied-index JSON string back into a seq -> {actor, type}
 * map. Total and tolerant: a missing or corrupt string (a pre-compaction node
 * has none) decodes to an empty map, malformed entries are skipped, and
 * non-integer keys are skipped.
 */
export function decodeAppliedIndex(raw: string | null | undefined): Map<number, AppliedEntry> {
  const map = new Map<number, AppliedEntry>();
  if (raw === null || raw === undefined) {
    return map;
  }
  let record: unknown;
  try {
    record = JSON.parse(raw);
  } catch {
    return map;
  }
  if (record === null || typeof record !== "object" || Array.isArray(record)) {
    return map;
  }
  for (const [key, value] of Object.entries(record)) {
    const seq = Number(key);
    if (
      Number.isInteger(seq) &&
      value !== null &&
      typeof value === "object" &&
      typeof (value as Partial<AppliedEntry>).actor === "string" &&
      typeof (value as Partial<AppliedEntry>).type === "string"
    ) {
      map.set(seq, {
        actor: (value as AppliedEntry).actor,
        type: (value as AppliedEntry).type,
      });
    }
  }
  return map;
}
