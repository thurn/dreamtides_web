// Append protocol for the event-sourcing engine: a pure updater plus a thin
// Firebase IO wrapper.
//
// The design (docs/superpowers/specs/2026-07-01-coop-event-sourcing-rewrite-
// design.md §"The eventlog engine" → Append protocol) appends every intent
// with a single RTDB transaction on the whole `log/` node:
//
//   runTransaction(logRef, (log) => {
//     log.head += 1;
//     log.events[log.head] = encodeEvent(event);
//     if (log.head - log.baseSeq > COMPACT_THRESHOLD) compactInPlace(log);
//     return log;
//   });
//
// Compaction folds the OLDEST live events into `baseSnapshot`, advances
// `baseSeq`, and deletes them — inside the same transaction, atomically.
// Because the fold is pure, either client compacting produces byte-identical
// bytes, and folding the resulting snapshot + remaining live events equals
// folding every original event from genesis (the compaction-equivalence
// invariant).
//
// This module is game-agnostic: it never imports from src/rules/ or src/coop/.
// Firebase IS allowed here (the firebase ban applies only to src/rules/).

import { type Database, ref, runTransaction } from "firebase/database";
import { buildAppliedIndex, decodeAppliedIndex, encodeAppliedIndex, foldEvents } from "./fold";
import type { EncodedLogNode, EngineConfig, GameEvent, Genesis } from "./types";

/**
 * Live-event ceiling: when `head - baseSeq` exceeds this, an append triggers
 * compaction. At exactly this many live events nothing is compacted.
 */
export const COMPACT_THRESHOLD = 200;

/**
 * Number of live events left resident after a compaction: the oldest events
 * down to `head - COMPACT_TARGET` are folded into the snapshot, leaving
 * exactly `COMPACT_TARGET` events in `(baseSeq, head]`.
 */
export const COMPACT_TARGET = 100;

/** Encodes a decoded event to the JSON string RTDB stores under `events[seq]`. */
export function encodeEvent(event: GameEvent): string {
  return JSON.stringify(event);
}

/** Decodes an `events[seq]` JSON string back into a `GameEvent`. */
export function decodeEvent(raw: string): GameEvent {
  return JSON.parse(raw) as GameEvent;
}

/**
 * Pure append updater. Returns a NEW `EncodedLogNode` with `event` appended at
 * `head + 1`, compacting in place when the live-event count crosses the
 * threshold. The input is never mutated: RTDB transaction updaters may run
 * multiple times against different base snapshots, so the function must be a
 * referentially-transparent value transform.
 *
 * Compaction detail: when `head - baseSeq > COMPACT_THRESHOLD`, the new
 * horizon is `head - COMPACT_TARGET`. Events in `(oldBaseSeq, newBaseSeq]` are
 * decoded and folded onto the current snapshot base — `genesisState(genesis)`
 * at seq 0 when `baseSnapshot` is null, otherwise `decode(baseSnapshot)` — via
 * `foldEvents`. The folded state is re-encoded as the new `baseSnapshot`,
 * `baseSeq` advances to the new horizon, and the folded events are deleted, so
 * `events` retains exactly the dense integer keys `(newBaseSeq, head]`.
 *
 * Compaction also persists an `appliedIndex` (seq -> {actor, type} for every
 * applied event with seq <= newBaseSeq) so a later fold — this compaction's,
 * a joiner's full refold, or the incremental client — can still enumerate the
 * intervening window of an event whose `basedOnSeq` predates the horizon. That
 * makes an event's outcome a pure function of the log prefix, identical whether
 * or not compaction has run over it.
 */
export function applyAppend<S>(
  config: EngineConfig<S>,
  encoded: EncodedLogNode,
  event: GameEvent,
): EncodedLogNode {
  const head = encoded.head + 1;
  // Shallow copy so the input node stays untouched across transaction retries.
  const events: { [seq: number]: string } = { ...(encoded.events ?? {}) };
  events[head] = encodeEvent(event);

  let baseSeq = encoded.baseSeq;
  let baseSnapshot = encoded.baseSnapshot ?? null;
  // The persisted applied index is carried through untouched on a non-compacting
  // append and rewritten (extended with the batch's newly-applied events) when
  // compaction folds events below the new horizon.
  let appliedIndex = encoded.appliedIndex;

  if (head - baseSeq > COMPACT_THRESHOLD) {
    // The whole compaction block is contained: any throw (a seq gap in the
    // fold range, corrupt genesis JSON, an undecodable snapshot) SKIPS
    // compaction for this append. The event still commits, the live events
    // accumulate, and the next append retries compaction. The updater never
    // throws — RTDB would otherwise abort the whole append transaction.
    // `foldEvents` runs with `devMode: false` so a reducer throw over committed
    // history is contained (a bounce plus a `fold_error`), never rethrown.
    try {
      const genesis = JSON.parse(encoded.genesis) as Genesis;
      const newBaseSeq = head - COMPACT_TARGET;

      const toFold: Array<{ seq: number; event: GameEvent }> = [];
      for (let seq = baseSeq + 1; seq <= newBaseSeq; seq++) {
        const raw = events[seq];
        if (raw === undefined) {
          throw new Error(`compaction gap: missing event at seq ${seq} in (${baseSeq}, ${newBaseSeq}]`);
        }
        toFold.push({ seq, event: decodeEvent(raw) });
      }

      // Seed the fold with the applied index accumulated by prior compactions so
      // events below the OLD horizon stay enumerable (coveredFromSeq 0). Without
      // this seed an event whose `basedOnSeq` predates the horizon would fold to
      // "unknown" here, silently flipping a live-applied event to a bounce in the
      // snapshot (audit finding P0-1).
      const priorApplied = decodeAppliedIndex(appliedIndex);
      const baseState = baseSnapshot === null ? config.genesisState(genesis) : config.decode(baseSnapshot);
      const folded = foldEvents(config, genesis, { seq: baseSeq, state: baseState }, toFold, {
        appliedBySeq: priorApplied,
        coveredFromSeq: 0,
        devMode: false,
      });

      // Extend the index with the events this compaction applied, so it remains a
      // complete record of applied events with seq <= newBaseSeq.
      const merged = new Map(priorApplied);
      for (const [seq, entry] of buildAppliedIndex(toFold, folded.outcomes)) {
        merged.set(seq, entry);
      }
      appliedIndex = encodeAppliedIndex(merged);

      baseSnapshot = config.encode(folded.state);
      for (let seq = baseSeq + 1; seq <= newBaseSeq; seq++) {
        delete events[seq];
      }
      baseSeq = newBaseSeq;
    } catch {
      // Compaction skipped this pass; the append below still commits the event.
    }
  }

  const next: EncodedLogNode = { genesis: encoded.genesis, baseSeq, baseSnapshot, head, events };
  // Only attach `appliedIndex` when it exists (compaction has run at least
  // once): RTDB's transaction commit rejects any object carrying an `undefined`
  // property, so a pre-compaction node must omit the field entirely.
  if (appliedIndex !== undefined) {
    next.appliedIndex = appliedIndex;
  }
  return next;
}

/**
 * IO wrapper: runs the pure `applyAppend` inside an RTDB transaction on
 * `rooms/{roomId}/log` and resolves to the committed seq (the new `head`).
 *
 * RTDB retries losers automatically, so contention between two clients
 * resolves without a bespoke write-queue — the single-location transaction is
 * the serialization point.
 */
export async function appendEvent<S>(
  db: Database,
  roomId: string,
  config: EngineConfig<S>,
  event: GameEvent,
): Promise<number> {
  const logRef = ref(db, `rooms/${roomId}/log`);
  const result = await runTransaction(logRef, (current: EncodedLogNode | null) => {
    if (current === null) {
      // No log node to append to — abort the transaction rather than
      // fabricate one; room creation is responsible for writing genesis.
      return undefined;
    }
    return applyAppend(config, current, event);
  });

  if (!result.committed) {
    throw new Error(`appendEvent aborted: no log node at rooms/${roomId}/log`);
  }
  const committed = result.snapshot.val() as EncodedLogNode | null;
  if (committed === null) {
    throw new Error(`appendEvent committed an empty log at rooms/${roomId}/log`);
  }
  return committed.head;
}
