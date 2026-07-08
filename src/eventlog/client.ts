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
import type { EngineConfig, EventOutcome, GameEvent, Genesis, LogNode } from "./types";

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
  /** Every confirmed event's resolved outcome, reported once per seq. */
  onEventOutcome: (event: GameEvent, seq: number, outcome: EventOutcome) => void;
  /** A confirmed event's `stateHashAfter` disagreed with this client's fold. */
  onDivergence: (info: { seq: number; expected: string; actual: string }) => void;
  /** A contained reducer throw or malformed entry (poison-event containment). */
  onFoldError?: (error: FoldError) => void;
}

/** A draft the caller submits; the client stamps the envelope fields. */
export interface EventDraft {
  type: string;
  payload: Record<string, unknown>;
  /** Defaults to the client's own id when omitted. */
  actor?: string;
}

export interface LogClient {
  /** Stamp, append, and optimistically echo an intent. Resolves to the committed seq. */
  submit: (draft: EventDraft) => Promise<number>;
  /** The client's actor id (also the nonce prefix). */
  clientId: string;
  /** Tear down the subscription. */
  close: () => void;
}

export interface LogClientOptions {
  /** Stable per-tab id; also the actor default and nonce prefix. */
  clientId?: string;
}

function randomClientId(): string {
  return `c-${Math.random().toString(36).slice(2, 10)}`;
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

  // Ordered queue of this client's submitted-but-unconfirmed intents.
  const pending: GameEvent[] = [];
  let nonceCounter = 0;

  function requireGenesis(): Genesis {
    if (genesis === undefined) {
      throw new Error("LogClient: no genesis yet (no log node delivered)");
    }
    return genesis;
  }

  /** Base state a full fold starts from: the snapshot, or genesis when null. */
  function baseState(node: LogNode): S {
    // `baseSnapshot` was JSON-decoded by subscribe; for the engine's JSON-based
    // encode/decode this is exactly `config.decode(encodedSnapshot)`.
    return node.baseSnapshot === null
      ? config.genesisState(requireGenesis())
      : (node.baseSnapshot as S);
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
        // Gap in a supposedly-dense window: skip rather than fold a hole. The
        // next node with the event present will fold it.
        continue;
      }
      const result = foldEvents(
        config,
        g,
        { seq: baseSeq, state: confirmedState as S },
        [{ seq, event }],
        { appliedBySeq },
      );
      confirmedState = result.state;
      lastFoldedSeq = seq;
      const outcome = result.outcomes[0];
      if (outcome.outcome === "applied") {
        appliedBySeq.set(seq, { actor: event.actor, type: event.type });
      }
      if (outcome.error !== undefined) {
        callbacks.onFoldError?.(outcome.error);
      }

      if (seq > lastEmittedSeq) {
        callbacks.onEventOutcome(event, seq, outcome.outcome);

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
        if (typeof event.nonce === "string") {
          const idx = pending.findIndex((p) => p.nonce === event.nonce);
          if (idx >= 0) {
            pending.splice(idx, 1);
          }
        }
      }
    }
    if (node.head > lastEmittedSeq) {
      lastEmittedSeq = node.head;
    }
    // Drop applied entries now below the horizon; their window can never be
    // enumerated again (basedOnSeq < baseSeq folds to "unknown").
    for (const key of appliedBySeq.keys()) {
      if (key <= baseSeq) {
        appliedBySeq.delete(key);
      }
    }
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
      { appliedBySeq },
    );
    callbacks.onDisplayState(result.state);
  }

  function onNode(node: LogNode): void {
    genesis = node.genesis;

    const needFullFold =
      !initialized ||
      node.baseSeq > lastFoldedSeq || // compaction advanced past our fold
      node.head < lastFoldedSeq; // log rewound (reconnect/rewrite)

    baseSeq = node.baseSeq;

    if (needFullFold) {
      confirmedState = baseState(node);
      lastFoldedSeq = node.baseSeq;
      appliedBySeq.clear();
      foldConfirmedRange(node, node.baseSeq);
    } else {
      foldConfirmedRange(node, lastFoldedSeq);
    }

    initialized = true;
    recomputeDisplayed();
  }

  const unsubscribe = io.subscribe(onNode);

  async function submit(draft: EventDraft): Promise<number> {
    if (!initialized || confirmedState === undefined) {
      throw new Error("LogClient.submit called before the first log node arrived");
    }
    const g = requireGenesis();
    nonceCounter += 1;
    const nonce = `${clientId}:${nonceCounter}`;

    const event: GameEvent = {
      type: draft.type,
      payload: draft.payload,
      actor: draft.actor ?? clientId,
      clientTimestamp: new Date().toISOString(),
      // basedOnSeq is the newest CONFIRMED seq folded into the displayed state;
      // this client's own pending intents are covered by the self-chain rule.
      basedOnSeq: lastFoldedSeq,
      nonce,
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
        { appliedBySeq },
      );
      event.stateHashAfter = config.hash(folded.state);
    }

    pending.push(event);
    // Optimistic echo: render immediately, before the append round-trips.
    recomputeDisplayed();

    return io.append(event);
  }

  return {
    submit,
    clientId,
    close: () => unsubscribe(),
  };
}
