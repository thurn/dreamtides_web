// The local-first event log: one writer's ordered list of committed events and
// the fold over them.
//
// `append` is synchronous. It stamps the envelope (`actor`, `clientTimestamp`,
// `basedOnSeq`), assigns the next seq, folds the event through the pure
// reducer, and commits it — applied or deterministically bounced — to the
// ordered in-memory event list before it returns. Listeners then receive one
// record per committed event, in seq order; persistence and logging are
// listeners, so this module does no IO.
//
// A log opens from a base (genesis, or a checkpoint of the fold) plus the
// committed events after that base. Replaying those events uses contained-throw
// mode, exactly like `replayLog`, so a stored log always opens. The events the
// base already covers can be supplied as history: they join the event list
// without being folded, so the list holds every event from seq 1.
//
// Game-agnostic: parameterized over `EngineConfig<S>`, never imports from
// src/rules/ or src/session/.

import { foldEvents, type FoldError } from "./fold";
import { assertJsonSafe } from "./hash";
import type {
  BounceReason,
  EngineConfig,
  EventActor,
  EventOutcome,
  EventType,
  GameEvent,
  Genesis,
} from "./types";
import type { IntentKey } from "../types/identifiers";

/** Build-time dev flag; mirrors `fold.ts`. Never gates game flow. */
const ENV_DEV: boolean =
  typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV);

/** An intent before the log stamps its envelope fields. */
export interface EventDraft {
  type: EventType;
  payload: Record<string, unknown>;
  /** Defaults to the log's local actor. AI-originated intents override it. */
  actor?: EventActor;
  /**
   * Stable identity for one logical intent. Once an event with this key has
   * applied, appending the key again returns the original seq and appends
   * nothing, so remounts and reloads cannot repeat an automatic transition.
   */
  intentKey?: IntentKey;
}

/** A committed event with its seq. */
export interface CommittedEvent {
  seq: number;
  event: GameEvent;
}

/** One committed event's resolution, delivered to listeners in seq order. */
export interface LocalLogRecord<S> {
  seq: number;
  event: GameEvent;
  outcome: EventOutcome;
  bounceReason?: BounceReason;
  /** A reducer throw contained as a bounce (production builds only). */
  error?: FoldError;
  stateBefore: S;
  stateAfter: S;
}

export type LocalLogListener<S> = (record: LocalLogRecord<S>) => void;

/** A fold position the log can resume from. */
export interface LocalLogBase<S> {
  /** Seq of the newest event folded into `state`; 0 for genesis. */
  seq: number;
  state: S;
  /** Every applied intent key with seq <= `seq`, and the seq that applied it. */
  intentKeys: ReadonlyArray<readonly [IntentKey, number]>;
}

/** What opening the log replayed on top of its base. */
export interface LocalLogReplaySummary {
  events: number;
  bounced: number;
  errors: readonly FoldError[];
}

export interface LocalLogOptions<S> {
  config: EngineConfig<S>;
  genesis: Genesis;
  /** The single local player's actor id: the default actor of every draft. */
  localActor: EventActor;
  /** Resume point; defaults to the genesis state at seq 0. */
  base?: LocalLogBase<S>;
  /** Committed events after `base`, dense and ascending from `base.seq + 1`. */
  events?: readonly CommittedEvent[];
  /**
   * The committed events `base` covers, dense and ascending from seq 1 to
   * `base.seq`. They are kept in the event list, not folded. Omitted, the list
   * starts after the base.
   */
  history?: readonly CommittedEvent[];
  /** Clock for `clientTimestamp`. Defaults to the wall clock. */
  now?: () => string;
  /** Rethrow reducer throws from `append`. Defaults to the build's dev flag. */
  devMode?: boolean;
}

export interface LocalLog<S> {
  readonly genesis: Genesis;
  readonly localActor: EventActor;
  /** What opening the log replayed. */
  readonly replay: LocalLogReplaySummary;
  /** Seq of the newest committed event; 0 for an empty log. */
  head(): number;
  /** The fold of every committed event. Stable identity between appends. */
  state(): S;
  /**
   * The committed events in seq order, dense and ending at `head()`: the
   * history, the replayed events, and every append since opening. Starts at
   * seq 1 unless the log opened from a base without history. A read-only view
   * that grows with each append.
   */
  events(): readonly CommittedEvent[];
  /**
   * Stamp, fold, and commit one intent; returns its seq. An already-applied
   * `intentKey` returns the seq that applied it and commits nothing. In dev
   * mode a reducer throw propagates and nothing is committed.
   */
  append(draft: EventDraft): number;
  /** Receive a record for every event committed after subscribing. */
  subscribe(listener: LocalLogListener<S>): () => void;
  /** The current fold position, for persisting a checkpoint. */
  checkpoint(): LocalLogBase<S>;
}

/** Opens a log at `base` and replays the committed events after it. */
export function createLocalLog<S>(options: LocalLogOptions<S>): LocalLog<S> {
  const { config, genesis, localActor } = options;
  const now = options.now ?? (() => new Date().toISOString());
  const devMode = options.devMode ?? ENV_DEV;
  const base = options.base ?? {
    seq: 0,
    state: config.genesisState(genesis),
    intentKeys: [],
  };

  let state = base.state;
  let head = base.seq;
  const appliedSeqByIntentKey = new Map<IntentKey, number>(base.intentKeys);
  const listeners = new Set<LocalLogListener<S>>();
  const pendingRecords: LocalLogRecord<S>[] = [];
  let notifying = false;

  const replayEvents = options.events ?? [];
  replayEvents.forEach(({ seq }, index) => {
    if (seq !== base.seq + 1 + index) {
      throw new Error(
        `Local log events must be dense after seq ${base.seq}; found seq ${seq} at position ${index}.`,
      );
    }
  });
  const history = options.history;
  if (history !== undefined) {
    if (history.length !== base.seq) {
      throw new Error(
        `Local log history must hold seqs 1 to ${base.seq}; found ${history.length} events.`,
      );
    }
    history.forEach(({ seq }, index) => {
      if (seq !== index + 1) {
        throw new Error(
          `Local log history must be dense from seq 1; found seq ${seq} at position ${index}.`,
        );
      }
    });
  }
  const committed: CommittedEvent[] = [...(history ?? []), ...replayEvents];
  const replayed = foldEvents(
    config,
    genesis,
    { seq: base.seq, state },
    [...replayEvents],
    { coveredFromSeq: 0, devMode: false },
  );
  state = replayed.state;
  head = base.seq + replayEvents.length;
  for (const outcome of replayed.outcomes) {
    recordIntentKey(outcome.event, outcome.seq, outcome.outcome);
  }
  const replay: LocalLogReplaySummary = {
    events: replayEvents.length,
    bounced: replayed.outcomes.filter((o) => o.outcome === "bounced").length,
    errors: replayed.outcomes.flatMap((o) =>
      o.error === undefined ? [] : [o.error],
    ),
  };

  function recordIntentKey(
    event: GameEvent,
    seq: number,
    outcome: EventOutcome,
  ): void {
    if (outcome === "applied" && event.intentKey !== undefined) {
      appliedSeqByIntentKey.set(event.intentKey, seq);
    }
  }

  // Records are queued and drained by the outermost append, so an append made
  // from inside a listener still reaches every listener after the record that
  // triggered it.
  function drainRecords(): void {
    if (notifying) return;
    notifying = true;
    let failure: Error | null = null;
    try {
      while (pendingRecords.length > 0) {
        const record = pendingRecords.shift()!;
        for (const listener of [...listeners]) {
          try {
            listener(record);
          } catch (error) {
            failure ??= error instanceof Error ? error : new Error(String(error));
          }
        }
      }
    } finally {
      notifying = false;
    }
    if (failure !== null) throw failure;
  }

  function append(draft: EventDraft): number {
    if (draft.intentKey !== undefined) {
      const appliedSeq = appliedSeqByIntentKey.get(draft.intentKey);
      if (appliedSeq !== undefined) return appliedSeq;
    }
    const seq = head + 1;
    const event: GameEvent = {
      type: draft.type,
      payload: draft.payload,
      actor: draft.actor ?? localActor,
      clientTimestamp: now(),
      basedOnSeq: head,
      ...(draft.intentKey === undefined ? {} : { intentKey: draft.intentKey }),
    };
    const stateBefore = state;
    const folded = foldEvents(
      config,
      genesis,
      { seq: head, state },
      [{ seq, event }],
      { coveredFromSeq: 0, devMode },
    );
    const outcome = folded.outcomes[0];
    if (devMode && outcome.outcome === "applied") {
      assertJsonSafe(folded.state, `localLogState@seq${seq}`);
    }
    state = folded.state;
    head = seq;
    committed.push({ seq, event });
    recordIntentKey(event, seq, outcome.outcome);
    pendingRecords.push({
      seq,
      event,
      outcome: outcome.outcome,
      stateBefore,
      stateAfter: state,
      ...(outcome.bounceReason === undefined
        ? {}
        : { bounceReason: outcome.bounceReason }),
      ...(outcome.error === undefined ? {} : { error: outcome.error }),
    });
    drainRecords();
    return seq;
  }

  return {
    genesis,
    localActor,
    replay,
    head: () => head,
    state: () => state,
    events: () => committed,
    append,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    checkpoint: () => ({
      seq: head,
      state,
      intentKeys: [...appliedSeqByIntentKey],
    }),
  };
}
