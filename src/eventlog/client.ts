// The stateful LogClient: the engine's read/write brain on top of the pure
// fold. It maintains the confirmed fold `(lastFoldedSeq, confirmedState)`, an
// ordered pending-intent queue, and produces the displayed state as
// `fold(confirmedState, pendingIntents)`. Optimistic echo, its reconciliation
// (echo rollback IS recomputation, never bespoke rollback code), the divergence
// tripwire, and stateHashAfter gating all live here.
//
// Game-agnostic: parameterized over `EngineConfig<S>`, no imports from
// src/rules/ or src/coop/. IO (subscribe/append) is injected so unit tests can
// drive it with fakes and a toy reducer.
//
// See docs/superpowers/specs/2026-07-01-coop-event-sourcing-rewrite-design.md
// §"Read path and fold", §"Optimistic echo", §"Client layer", and §"Error
// handling and safety rails".

import { type AppliedEntry, type FoldError, foldEvents } from "./fold";
import { assertJsonSafe } from "./hash";
import type {
  BounceReason,
  EngineConfig,
  EventOutcome,
  EventActor,
  EventType,
  GameEvent,
  Genesis,
  LogNode,
  StateHash,
} from "./types";
import { parseEventNonce } from "./types";
import {
  parseClientId,
  type ClientId,
  type IntentKey,
} from "../types/identifiers";

/**
 * Build-time dev flag mirroring `fold.ts`'s `ENV_DEV`. In dev the client runs a
 * JSON-safety walk over the folded state after each applied event so a smuggled
 * `undefined`/function/`NaN` is caught at its source (the reducer output) rather
 * than surfacing later as a false divergence or a structurally different
 * snapshot. Never gates game flow — a production build skips the walk entirely.
 */
const CLIENT_DEV_MODE: boolean =
  typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV);

/** The IO surface the client folds against. Fakeable in tests; Firebase-backed in prod. */
export interface LogClientIo {
  /** Subscribe to decoded log nodes; returns an unsubscribe function. */
  subscribe: (onNode: (node: LogNode) => void) => () => void;
  /** Append an event, resolving to its committed seq. */
  append: (event: GameEvent) => Promise<number>;
}

/** Callbacks the client fires as it folds. */
export interface LogClientCallbacks<S> {
  /** The displayed fold (confirmed + optimistic) after every change. */
  onDisplayState: (state: S) => void;
  /** The fold of committed events only, before pending local intents are echoed. */
  onConfirmedState?: (state: S) => void;
  /** The contiguous confirmed log head after each subscribed node is folded. */
  onConfirmedHead?: (head: number) => void;
  /**
   * Every confirmed event's resolved outcome, reported once per seq. `detail`
   * carries the exact confirmed fold transition plus a bounce's
   * machine-readable reason and diagnostic `interveningSeqs` (see
   * `FoldOutcome`) when available.
   */
  onEventOutcome: (
    event: GameEvent,
    seq: number,
    outcome: EventOutcome,
    detail: {
      stateBefore: S;
      stateAfter: S;
      interveningSeqs?: number[];
      bounceReason?: BounceReason;
    },
  ) => void;
  /** A confirmed event's `stateHashAfter` disagreed with this client's fold. */
  onDivergence: (info: {
    seq: number;
    expected: StateHash;
    actual: StateHash;
  }) => void;
  /**
   * A contained reducer throw or malformed entry (poison-event containment),
   * together with the exact event and confirmed fold transition that produced
   * it. The extra context makes the failure independently replayable.
   */
  onFoldError?: (
    error: FoldError,
    event: GameEvent,
    detail: { stateBefore: S; stateAfter: S },
  ) => void;
  /** io.append rejected; the intent was removed from the pending queue. */
  onAppendFailed?: (event: GameEvent, error: unknown) => void;
  /** A full refold discarded these unconfirmed intents. */
  onPendingDropped?: (events: GameEvent[]) => void;
  /** An already-folded live prefix was replaced, removed, or corrected. */
  onAuthoritativeCorrection?: (info: {
    firstChangedSeq: number;
    previousHead: number;
    authoritativeHead: number;
  }) => void;
  /** Equal intent keys were used for different semantic event contracts. */
  onIntentKeyCollision?: (info: {
    intentKey: IntentKey;
    winningSeq: number;
    winner: GameEvent;
    contender: GameEvent;
  }) => void;
}

/** A draft the caller submits; the client stamps the envelope fields. */
export interface EventDraft {
  type: EventType;
  payload: Record<string, unknown>;
  /** Defaults to the client's own id when omitted. */
  actor?: EventActor;
  /** Stable cross-client identity for one logical automatic intent. */
  intentKey?: IntentKey;
}

export interface LogClient {
  /** Stamp, append, and optimistically echo an intent. Resolves to the committed seq. */
  submit: (draft: EventDraft) => Promise<number>;
  /** The client's actor id (also the nonce prefix). */
  clientId: ClientId;
  /** Tear down the subscription. */
  close: () => void;
}

export interface LogClientOptions {
  /** Stable per-tab id; also the actor default and nonce prefix. */
  clientId?: ClientId;
}

function randomClientId(): ClientId {
  return parseClientId(`c-${Math.random().toString(36).slice(2, 10)}`);
}

/**
 * A per-LogClient nonce scope. React StrictMode deliberately remounts the
 * provider while preserving its stable client id, so a client-local counter by
 * itself can repeat a nonce from the discarded instance.
 */
function randomNonceScope(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 14);
}

/**
 * Creates a LogClient. Subscribes immediately; the first delivered node
 * initializes the confirmed fold. `submit` may only be called after the first
 * node has arrived (the confirmed baseline must exist to stamp `basedOnSeq`).
 */
export function createLogClient<S>(
  config: EngineConfig<S>,
  io: LogClientIo,
  callbacks: LogClientCallbacks<S>,
  options: LogClientOptions = {},
): LogClient {
  const clientId = options.clientId ?? randomClientId();
  const nonceScope = randomNonceScope();

  let genesis: Genesis | undefined;
  let initialized = false;
  // The confirmed fold: `confirmedState` is the fold of every applied event in
  // (baseSeq, lastFoldedSeq]; `lastFoldedSeq` is the newest confirmed seq folded.
  let confirmedState: S | undefined;
  let lastFoldedSeq = 0;
  // Current compaction horizon (the seq `confirmedState`'s window bottoms out
  // at for intervening enumeration).
  let baseSeq = 0;
  // seq -> {actor,type} of applied confirmed events, carried across incremental
  // folds so an event's intervening window sees earlier applied events.
  const appliedBySeq = new Map<number, AppliedEntry>();
  // High-water seq for which onEventOutcome/divergence has already been emitted,
  // so a full re-fold never re-reports already-seen events.
  let lastEmittedSeq = 0;
  const divergenceReported = new Set<number>();
  const liveFingerprints = new Map<number, string>();

  // Ordered queue of this client's submitted-but-unconfirmed intents.
  const pending: GameEvent[] = [];
  const submissionsByIntentKey = new Map<IntentKey, Promise<number>>();
  const confirmedSeqByIntentKey = new Map<IntentKey, number>();
  const confirmedEventByIntentKey = new Map<IntentKey, GameEvent>();
  let appendTail: Promise<void> | null = null;
  let nonceCounter = 0;

  function appendInSubmissionOrder(event: GameEvent): Promise<number> {
    const prior = appendTail;
    const result = prior === null
      ? io.append(event)
      : prior.then(() => io.append(event));
    const settled = result.then(
      () => undefined,
      () => undefined,
    );
    appendTail = settled;
    void settled.then(() => {
      if (appendTail === settled) {
        appendTail = null;
      }
    });
    return result;
  }

  function requireGenesis(): Genesis {
    if (genesis === undefined) {
      throw new Error("LogClient: no genesis yet (no log node delivered)");
    }
    return genesis;
  }

  /**
   * Base state a full fold starts from: the snapshot decoded through
   * `config.decode`, or genesis state when there is no snapshot yet.
   * `node.baseSnapshot` is the RAW encoded string (subscribe.ts no longer
   * pre-parses it) — this is the SAME decode path compaction uses
   * (`append.ts`'s `config.decode(baseSnapshot)`), so a game whose `decode`
   * does more than a bare `JSON.parse` still gets a byte-identical base state
   * whether it was just compacted or read back fresh.
   */
  function baseState(node: LogNode): S {
    return node.baseSnapshot === null
      ? config.genesisState(requireGenesis())
      : config.decode(node.baseSnapshot);
  }

  /**
   * Folds the confirmed range `(fromExclusive, node.head]` one event at a time
   * onto `confirmedState`, mutating the confirmed fold in place. Folding
   * single-event batches (each seeded with the running applied index and a
   * fixed `base.seq = baseSeq`) is identical to one batch fold, but exposes the
   * per-seq state needed for the divergence hash. New seqs (> lastEmittedSeq)
   * are reported via onEventOutcome, checked for divergence, and matched
   * against the pending queue by nonce.
   */
  function foldConfirmedRange(node: LogNode, fromExclusive: number): void {
    const g = requireGenesis();
    for (let seq = fromExclusive + 1; seq <= node.head; seq++) {
      const event = node.events.get(seq);
      if (event === undefined) {
        // Gap in a supposedly-dense window: STOP rather than fold a hole and
        // then fold events that come after it. `lastFoldedSeq` stays below the
        // hole, so a later complete node resumes folding exactly there. Folding
        // past a hole would apply later events at the wrong basedOnSeq relative
        // to the missing one and could never be corrected.
        break;
      }
      const stateBefore = confirmedState as S;
      const result = foldEvents(
        config,
        g,
        { seq: baseSeq, state: stateBefore },
        [{ seq, event }],
        // The applied index is seeded from the node's persisted index on a full
        // refold and extended as live events apply, so it is complete from
        // genesis: coveredFromSeq 0 keeps below-horizon windows enumerable.
        { appliedBySeq, coveredFromSeq: 0 },
      );
      confirmedState = result.state;
      lastFoldedSeq = seq;
      liveFingerprints.set(seq, fingerprintEvent(event));
      const outcome = result.outcomes[0];
      if (outcome.outcome === "applied") {
        appliedBySeq.set(seq, { actor: event.actor, type: event.type });
        if (event.intentKey !== undefined) {
          confirmedSeqByIntentKey.set(event.intentKey, seq);
          confirmedEventByIntentKey.set(event.intentKey, event);
        }
        if (CLIENT_DEV_MODE) {
          // Catch a reducer that smuggled undefined/function/NaN into the fold at
          // its source — before it can hash-diverge or corrupt a snapshot.
          assertJsonSafe(confirmedState, `confirmedState@seq${seq}`);
        }
      }

      if (seq > lastEmittedSeq) {
        callbacks.onEventOutcome(
          event,
          seq,
          outcome.outcome,
          {
            stateBefore,
            stateAfter: confirmedState,
            ...(outcome.outcome === "bounced"
              ? {
                  interveningSeqs: outcome.interveningSeqs,
                  bounceReason: outcome.bounceReason,
                }
              : {}),
          },
        );

        // Report a contained fold error under the SAME per-seq guard as the
        // outcome, so a full refold that re-reports an event (a rewind reset)
        // fires it exactly once alongside the outcome, never as spam.
        if (outcome.error !== undefined) {
          callbacks.onFoldError?.(outcome.error, event, {
            stateBefore,
            stateAfter: confirmedState,
          });
        }

        // Divergence tripwire. The stamped `stateHashAfter` is the appender's
        // fold hash for a prediction of THIS event committing at
        // `basedOnSeq + 1` (RNG is keyed by committed seq). It is only
        // legitimately comparable when that prediction provably held: zero
        // intervening seqs, i.e. `basedOnSeq === seq - 1`. Otherwise the
        // committed seq (hence the RNG key, hence any random draw) differs from
        // what the appender hashed, and a mismatch would be a false alarm even
        // with no nondeterminism bug — this fires under ordinary concurrency
        // whenever a preceding event bounces and the appender's event skews
        // forward but still applies. Both fields are in the committed log, so
        // this gate is deterministic and identical across all observers.
        // `outcome === "applied"` stays as a cheap secondary guard.
        if (
          event.basedOnSeq === seq - 1 &&
          outcome.outcome === "applied" &&
          typeof event.stateHashAfter === "string" &&
          !divergenceReported.has(seq)
        ) {
          const actual = config.hash(confirmedState);
          if (actual !== event.stateHashAfter) {
            divergenceReported.add(seq);
            callbacks.onDivergence({ seq, expected: event.stateHashAfter, actual });
          }
        }

        // Reconcile the pending queue: a confirmed event carrying one of our
        // nonces IS our own committed intent — remove it so it is not folded a
        // second time on top of the confirmed state.
        if (
          typeof event.nonce === "string" ||
          (
            outcome.outcome === "applied" &&
            typeof event.intentKey === "string"
          )
        ) {
          let reconciledByNonce = false;
          for (let index = pending.length - 1; index >= 0; index -= 1) {
            const candidate = pending[index];
            const matchesNonce = candidate.nonce === event.nonce;
            if (
              matchesNonce ||
              (
                outcome.outcome === "applied" &&
                event.intentKey !== undefined &&
                candidate.intentKey === event.intentKey
              )
            ) {
              if (
                outcome.outcome === "applied" &&
                event.intentKey !== undefined &&
                candidate.intentKey === event.intentKey &&
                !sameIntentContract(candidate, event)
              ) {
                callbacks.onIntentKeyCollision?.({
                  intentKey: event.intentKey,
                  winningSeq: seq,
                  winner: event,
                  contender: candidate,
                });
              }
              if (matchesNonce) {
                reconciledByNonce = true;
              }
              pending.splice(index, 1);
            }
          }
          if (
            event.intentKey !== undefined &&
            (
              outcome.outcome === "applied" ||
              reconciledByNonce
            )
          ) {
            submissionsByIntentKey.delete(event.intentKey);
          }
        }
      }
    }
    if (lastFoldedSeq > lastEmittedSeq) {
      lastEmittedSeq = lastFoldedSeq;
    }
    // The high-water tracks `lastFoldedSeq`, not `node.head`: when a gap stopped
    // the fold short, the seqs past the hole were never emitted, so the water
    // must stay below them for the resuming node to emit them exactly once.
    // Applied entries at or below the compaction horizon are retained: an event
    // with `basedOnSeq` below the horizon legitimately consults them to
    // enumerate its intervening window (coveredFromSeq 0), so pruning them would
    // reintroduce the "unknown"-below-horizon bounce that flips outcomes.
  }

  /**
   * The displayed fold: pending intents folded on top of the confirmed state at
   * predicted seqs `lastFoldedSeq + 1 …`. When a pending intent bounces during
   * this recompute (a partner applied event now intervenes), the echo simply
   * vanishes from the result — rollback is recomputation.
   */
  function recomputeDisplayed(): void {
    if (confirmedState === undefined) {
      return;
    }
    if (pending.length === 0) {
      callbacks.onDisplayState(confirmedState);
      return;
    }
    const events = pending.map((event, i) => ({ seq: lastFoldedSeq + 1 + i, event }));
    const result = foldEvents(
      config,
      requireGenesis(),
      { seq: baseSeq, state: confirmedState },
      events,
      { appliedBySeq, coveredFromSeq: 0 },
    );
    callbacks.onDisplayState(result.state);
  }

  function onNode(node: LogNode): void {
    genesis = node.genesis;

    const rewound = initialized && node.head < lastFoldedSeq; // log rewritten
    const firstCorrectedSeq = initialized
      ? firstChangedPrefixSeq(node, liveFingerprints, lastFoldedSeq)
      : null;
    const corrected = firstCorrectedSeq !== null;
    const previousHead = lastFoldedSeq;
    const needFullFold =
      !initialized ||
      node.baseSeq > lastFoldedSeq || // compaction advanced past our fold
      rewound ||
      corrected;

    baseSeq = node.baseSeq;

    if (needFullFold) {
      // A full refold means the confirmation window is untrustworthy: any
      // unconfirmed intent may have committed into the compacted range (and so
      // is already in the snapshot) or may never have committed at all.
      // Re-echoing either would corrupt the displayed fold, so the whole queue
      // is dropped and reported for UX.
      if (pending.length > 0 && !corrected) {
        const dropped = pending.splice(0);
        callbacks.onPendingDropped?.(dropped);
      }
      // On a rewind the log below our fold was REWRITTEN, so the previously
      // emitted outcomes no longer describe the authoritative log. Reset the
      // emission high-water to this node's horizon (and clear the divergence
      // dedup) so the rewritten range's outcomes/fold-errors re-report exactly
      // once. A compaction-advance full refold, by contrast, only folds live
      // events above the old high-water, so its high-water is left intact.
      if (rewound || corrected) {
        lastEmittedSeq = node.baseSeq;
        divergenceReported.clear();
        confirmedSeqByIntentKey.clear();
        confirmedEventByIntentKey.clear();
      }
      if (corrected) {
        callbacks.onAuthoritativeCorrection?.({
          firstChangedSeq: firstCorrectedSeq,
          previousHead,
          authoritativeHead: node.head,
        });
      }
      confirmedState = baseState(node);
      lastFoldedSeq = node.baseSeq;
      liveFingerprints.clear();
      // Seed the applied index from the node's persisted index (applied events
      // with seq <= baseSeq) so a fold starting at the snapshot can enumerate
      // intervening windows below the horizon, exactly as an always-connected
      // client that folded those events live would.
      appliedBySeq.clear();
      for (const [seq, entry] of node.appliedIndex) {
        appliedBySeq.set(seq, entry);
      }
      foldConfirmedRange(node, node.baseSeq);
      if (corrected && pending.length > 0) {
        reconcilePendingAgainstNode(
          node,
          pending,
          confirmedSeqByIntentKey,
          callbacks,
        );
      }
    } else {
      foldConfirmedRange(node, lastFoldedSeq);
    }

    initialized = true;
    callbacks.onConfirmedState?.(confirmedState as S);
    recomputeDisplayed();
    callbacks.onConfirmedHead?.(lastFoldedSeq);
  }

  const unsubscribe = io.subscribe(onNode);

  function submit(draft: EventDraft): Promise<number> {
    if (draft.intentKey !== undefined) {
      const confirmedSeq = confirmedSeqByIntentKey.get(draft.intentKey);
      if (confirmedSeq !== undefined) {
        const winner = confirmedEventByIntentKey.get(draft.intentKey);
        if (
          winner !== undefined &&
          (
            winner.type !== draft.type ||
            JSON.stringify(winner.payload) !== JSON.stringify(draft.payload)
          )
        ) {
          callbacks.onIntentKeyCollision?.({
            intentKey: draft.intentKey,
            winningSeq: confirmedSeq,
            winner,
            contender: {
              type: draft.type,
              payload: draft.payload,
              actor: draft.actor ?? clientId,
              clientTimestamp: new Date().toISOString(),
              basedOnSeq: lastFoldedSeq,
              intentKey: draft.intentKey,
            },
          });
        }
        return Promise.resolve(confirmedSeq);
      }
      const existing = submissionsByIntentKey.get(draft.intentKey);
      if (existing !== undefined) {
        return existing;
      }
    }

    const submission = submitNew(draft);
    if (draft.intentKey !== undefined) {
      submissionsByIntentKey.set(draft.intentKey, submission);
    }
    return submission;
  }

  async function submitNew(draft: EventDraft): Promise<number> {
    if (!initialized || confirmedState === undefined) {
      throw new Error("LogClient.submit called before the first log node arrived");
    }
    const g = requireGenesis();
    nonceCounter += 1;
    const nonce = parseEventNonce(`${clientId}:${nonceScope}:${nonceCounter}`);

    const event: GameEvent = {
      type: draft.type,
      payload: draft.payload,
      actor: draft.actor ?? clientId,
      clientTimestamp: new Date().toISOString(),
      // basedOnSeq is the newest CONFIRMED seq folded into the displayed state;
      // this client's own pending intents are covered by the self-chain rule.
      basedOnSeq: lastFoldedSeq,
      nonce,
      ...(draft.intentKey === undefined ? {} : { intentKey: draft.intentKey }),
    };

    // stateHashAfter is written ONLY for a clean prediction: the queue is empty
    // (predicted seq === lastConfirmedSeq + 1). A skewed prediction omits it
    // rather than write a hash that would not match the committed fold.
    if (pending.length === 0) {
      const folded = foldEvents(
        config,
        g,
        { seq: baseSeq, state: confirmedState },
        [{ seq: lastFoldedSeq + 1, event }],
        { appliedBySeq, coveredFromSeq: 0 },
      );
      event.stateHashAfter = config.hash(folded.state);
    }

    pending.push(event);
    // Optimistic echo: render immediately, before the append round-trips.
    recomputeDisplayed();

    try {
      const seq = await appendInSubmissionOrder(event);
      // A keyed append can resolve to an event this client had already folded
      // (for example, a remount submitted after the partner's winner arrived).
      // No subscription update follows an RTDB transaction that made no
      // change, so retire the optimistic echo here.
      if (event.intentKey !== undefined && seq <= lastFoldedSeq) {
        if (appliedBySeq.has(seq)) {
          confirmedSeqByIntentKey.set(event.intentKey, seq);
        }
        const idx = pending.findIndex((entry) => entry.nonce === nonce);
        if (idx >= 0) {
          pending.splice(idx, 1);
          recomputeDisplayed();
        }
        submissionsByIntentKey.delete(event.intentKey);
      }
      return seq;
    } catch (error) {
      // The append may have reached the server before the ack failed. If the
      // subscription already confirmed this nonce, reconciliation removed the
      // pending echo and there is no stranded intent to report as failed.
      const idx = pending.findIndex((entry) => entry.nonce === nonce);
      if (idx < 0) {
        throw error;
      }

      // The append never committed, so the optimistic echo is stranded. Sweep
      // the intent out by nonce, recompute (rollback IS recomputation), report
      // the failure for UX, and rethrow so the caller sees the rejection.
      pending.splice(idx, 1);
      if (event.intentKey !== undefined) {
        submissionsByIntentKey.delete(event.intentKey);
      }
      recomputeDisplayed();
      callbacks.onAppendFailed?.(event, error);
      throw error;
    }
  }

  return {
    submit,
    clientId,
    close: () => unsubscribe(),
  };
}

function fingerprintEvent(event: GameEvent): string {
  return JSON.stringify(event);
}

function sameIntentContract(left: GameEvent, right: GameEvent): boolean {
  return left.type === right.type &&
    JSON.stringify(left.payload) === JSON.stringify(right.payload);
}

function firstChangedPrefixSeq(
  node: LogNode,
  fingerprints: ReadonlyMap<number, string>,
  lastFoldedSeq: number,
): number | null {
  const overlapEnd = Math.min(lastFoldedSeq, node.head);
  for (let seq = node.baseSeq + 1; seq <= overlapEnd; seq += 1) {
    const previous = fingerprints.get(seq);
    if (previous === undefined) continue;
    const authoritative = node.events.get(seq);
    if (
      authoritative === undefined ||
      fingerprintEvent(authoritative) !== previous
    ) {
      return seq;
    }
  }
  return null;
}

function reconcilePendingAgainstNode<S>(
  node: LogNode,
  pending: GameEvent[],
  confirmedSeqByIntentKey: ReadonlyMap<IntentKey, number>,
  callbacks: LogClientCallbacks<S>,
): void {
  for (const [seq, winner] of node.events) {
    for (let index = pending.length - 1; index >= 0; index -= 1) {
      const contender = pending[index];
      const matches =
        contender.nonce === winner.nonce ||
        (
          winner.intentKey !== undefined &&
          confirmedSeqByIntentKey.get(winner.intentKey) === seq &&
          contender.intentKey === winner.intentKey
        );
      if (!matches) continue;
      if (
        winner.intentKey !== undefined &&
        confirmedSeqByIntentKey.get(winner.intentKey) === seq &&
        contender.intentKey === winner.intentKey &&
        !sameIntentContract(contender, winner)
      ) {
        callbacks.onIntentKeyCollision?.({
          intentKey: winner.intentKey,
          winningSeq: seq,
          winner,
          contender,
        });
      }
      pending.splice(index, 1);
    }
  }
}
