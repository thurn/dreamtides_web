// A local game: one `LocalLog` written through to a `GameRepository`.
//
// Every committed event is persisted in seq order. Appends made in the same
// task are batched into one atomic write. A failed write is requeued ahead of
// later events and retried on its own after a backoff delay
// (`GAME_EVENT_PERSISTENCE`), or sooner with the next batch, until it lands or
// the game closes. Every `checkpointInterval` events the batch also carries a
// fold checkpoint, so opening a long game replays at most that many events.
// Opening verifies the checkpoint against its stored hash and falls back to
// replaying from genesis when it does not match; the events the checkpoint
// covers still load into the log's event list, unfolded. A game with a
// snapshot codec also writes a durable snapshot with the batch after every
// applied event, and opens from that snapshot in place of the checkpoint.

import { GAME_EVENT_PERSISTENCE } from "../content/game-logs";
import {
  createLocalLog,
  type LocalLog,
  type LocalLogBase,
  type CommittedEvent,
} from "../eventlog/local-log";
import type { EngineConfig, Genesis } from "../eventlog/types";
import { isFoldableGenesis } from "../eventlog/wire";
import type { ClientId, GameId } from "../types/identifiers";
import {
  UnreadableLocalGameError,
  type GameRepository,
  type LocalGameSummary,
  type StoredCheckpoint,
  type StoredLocalGame,
} from "./game-repository";

/** A stored game whose genesis carries the content configuration the fold reads. */
type FoldableLocalGame = Omit<StoredLocalGame, "genesis"> & { genesis: Genesis };

/** Events between persisted fold checkpoints. */
export const DEFAULT_CHECKPOINT_INTERVAL = 100;

/**
 * A game's durable snapshot codec. The snapshot is written with the batch
 * after every applied event and is the base the game opens from.
 */
export interface LocalGameSnapshots<S> {
  /** The snapshot of the state after the applied event at `seq`, or null to write none. */
  readonly encode: (state: S, seq: number, intentKeys: LocalLogBase<S>["intentKeys"]) => string | null;
  /** The log base a stored snapshot opens from, or undefined to ignore it. */
  readonly decode: (snapshot: string, genesis: Genesis) => LocalLogBase<S> | undefined;
}

/** How a game was opened, for logs. */
export interface LocalGameOpenReport {
  /** What the fold resumed from. */
  openedFrom: "snapshot" | "checkpoint" | "genesis";
  /** Seq of the checkpoint the fold resumed from; 0 when it replayed from genesis. */
  checkpointSeq: number;
  /** A stored checkpoint failed verification and was ignored. */
  checkpointRejected: boolean;
  replayedEvents: number;
  replayFoldErrors: number;
}

export interface LocalGame<S> {
  readonly gameId: GameId;
  readonly localPlayerId: ClientId;
  readonly genesis: Genesis;
  readonly log: LocalLog<S>;
  readonly opened: LocalGameOpenReport;
  /** Resolves once every event committed so far has been written (or failed). */
  flush(): Promise<void>;
  /** Stop writing through after flushing what is pending. */
  close(): Promise<void>;
}

export interface LocalGameOptions<S = unknown> {
  /** A durable snapshot codec; games without one use checkpoints alone. */
  snapshots?: LocalGameSnapshots<S>;
  /** Events between checkpoints. Defaults to `DEFAULT_CHECKPOINT_INTERVAL`. */
  checkpointInterval?: number;
  /** Epoch-millisecond clock for game summaries. */
  now?: () => number;
  /** Clock for event `clientTimestamp`s. */
  eventClock?: () => string;
  /**
   * A batch failed to persist; it is retried after a backoff delay or with the
   * next batch, whichever comes first.
   */
  onPersistError?: (error: unknown) => void;
}

export interface NewLocalGame {
  gameId: GameId;
  genesis: Genesis;
  localPlayerId: ClientId;
}

/** Persist a new, empty game and open it. */
export async function createLocalGame<S>(
  repository: GameRepository,
  config: EngineConfig<S>,
  game: NewLocalGame,
  options: LocalGameOptions<S> = {},
): Promise<LocalGame<S>> {
  const now = options.now ?? Date.now;
  const createdAt = now();
  const summary: LocalGameSummary = {
    gameId: game.gameId,
    localPlayerId: game.localPlayerId,
    createdAt,
    updatedAt: createdAt,
    head: 0,
  };
  await repository.createGame(summary, game.genesis);
  return attach(
    repository,
    config,
    { summary, genesis: game.genesis, checkpoint: null, snapshot: null },
    undefined,
    { history: [], events: [] },
    { openedFrom: "genesis", checkpointSeq: 0, checkpointRejected: false },
    options,
  );
}

/** Open a stored game, or resolve null when no game has this id. */
export async function openLocalGame<S>(
  repository: GameRepository,
  config: EngineConfig<S>,
  gameId: GameId,
  options: LocalGameOptions<S> = {},
): Promise<LocalGame<S> | null> {
  const read = await repository.readGame(gameId);
  if (read === null) return null;
  const { genesis } = read;
  if (!isFoldableGenesis(genesis)) {
    throw new UnreadableLocalGameError(
      gameId,
      "genesis lacks the content configuration the fold reads",
    );
  }
  const stored = { ...read, genesis };
  const snapshotBase = snapshotLogBase(options.snapshots, stored);
  const checkpointBase = snapshotBase === undefined ? verifiedCheckpoint(config, stored) : undefined;
  const base = snapshotBase ?? checkpointBase;
  const checkpointRejected = snapshotBase === undefined && stored.checkpoint !== null && base === undefined;
  const storedEvents = await repository.readEvents(gameId, 0);
  const baseSeq = base?.seq ?? 0;
  return attach(
    repository,
    config,
    stored,
    base,
    {
      history: storedEvents.slice(0, baseSeq),
      events: storedEvents.slice(baseSeq),
    },
    {
      openedFrom: snapshotBase !== undefined ? "snapshot" : checkpointBase !== undefined ? "checkpoint" : "genesis",
      checkpointSeq: base?.seq ?? 0,
      checkpointRejected,
    },
    options,
  );
}

function snapshotLogBase<S>(
  snapshots: LocalGameSnapshots<S> | undefined,
  stored: FoldableLocalGame,
): LocalLogBase<S> | undefined {
  if (snapshots === undefined || stored.snapshot === null) return undefined;
  try {
    const base = snapshots.decode(stored.snapshot, stored.genesis);
    return base === undefined || base.seq > stored.summary.head ? undefined : base;
  } catch {
    return undefined;
  }
}

function verifiedCheckpoint<S>(
  config: EngineConfig<S>,
  stored: FoldableLocalGame,
): LocalLogBase<S> | undefined {
  const checkpoint = stored.checkpoint;
  if (checkpoint === null || checkpoint.seq > stored.summary.head) {
    return undefined;
  }
  try {
    const state = config.decode(checkpoint.state);
    if (config.hash(state) !== checkpoint.stateHash) return undefined;
    return { seq: checkpoint.seq, state, intentKeys: checkpoint.intentKeys };
  } catch {
    return undefined;
  }
}

function encodeCheckpoint<S>(
  config: EngineConfig<S>,
  base: LocalLogBase<S>,
): StoredCheckpoint {
  return {
    seq: base.seq,
    state: config.encode(base.state),
    stateHash: config.hash(base.state),
    intentKeys: base.intentKeys.map(([key, seq]) => [key, seq]),
  };
}

/** The stored events of a game, split at its fold base. */
interface StoredEvents {
  /** Events the base covers: kept in the event list, not folded. */
  history: readonly CommittedEvent[];
  /** Events after the base, folded on open. */
  events: readonly CommittedEvent[];
}

/** Backoff before the retry that follows `failures` consecutive failures. */
function retryDelayMs(failures: number): number {
  const { retryInitialDelayMs, retryBackoffFactor, retryMaxDelayMs } =
    GAME_EVENT_PERSISTENCE;
  return Math.min(
    retryInitialDelayMs * retryBackoffFactor ** Math.max(0, failures - 1),
    retryMaxDelayMs,
  );
}

function attach<S>(
  repository: GameRepository,
  config: EngineConfig<S>,
  stored: FoldableLocalGame,
  base: LocalLogBase<S> | undefined,
  { history, events }: StoredEvents,
  checkpoint: Pick<LocalGameOpenReport, "openedFrom" | "checkpointSeq" | "checkpointRejected">,
  options: LocalGameOptions<S>,
): LocalGame<S> {
  const { gameId, localPlayerId, createdAt } = stored.summary;
  const now = options.now ?? Date.now;
  const interval = options.checkpointInterval ?? DEFAULT_CHECKPOINT_INTERVAL;
  const onPersistError = options.onPersistError ?? (() => undefined);

  let log: LocalLog<S>;
  try {
    log = createLocalLog({
      config,
      genesis: stored.genesis,
      localActor: localPlayerId,
      base,
      events,
      history,
      now: options.eventClock,
    });
  } catch (error) {
    throw new UnreadableLocalGameError(
      gameId,
      error instanceof Error ? error.message : String(error),
    );
  }

  let lastCheckpointSeq = checkpoint.checkpointSeq;
  let pendingEvents: CommittedEvent[] = [];
  let pendingSnapshot: string | null = null;
  let scheduled = false;
  let writing: Promise<void> | null = null;
  let consecutiveFailures = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const checkpointDue = (): boolean => log.head() - lastCheckpointSeq >= interval;

  async function writePending(): Promise<void> {
    while (pendingEvents.length > 0 || pendingSnapshot !== null || checkpointDue()) {
      // Every committed event is pending or written, so the batch ends at the
      // log head and a checkpoint taken now matches its last event.
      const batch = pendingEvents;
      const snapshot = pendingSnapshot;
      pendingEvents = [];
      pendingSnapshot = null;
      const due = checkpointDue()
        ? encodeCheckpoint(config, log.checkpoint())
        : undefined;
      try {
        await repository.write(gameId, {
          summary: {
            gameId,
            localPlayerId,
            createdAt,
            updatedAt: now(),
            head: log.head(),
          },
          events: batch,
          ...(due === undefined ? {} : { checkpoint: due }),
          ...(snapshot === null ? {} : { snapshot }),
        });
        if (due !== undefined) lastCheckpointSeq = due.seq;
        consecutiveFailures = 0;
      } catch (error) {
        pendingEvents = [...batch, ...pendingEvents];
        pendingSnapshot ??= snapshot;
        consecutiveFailures += 1;
        onPersistError(error);
        scheduleRetry();
        return;
      }
    }
  }

  // A failed batch is retried without waiting for another append, so the last
  // events before a reload still reach storage.
  function scheduleRetry(): void {
    if (closed || retryTimer !== null) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void drain();
    }, retryDelayMs(consecutiveFailures));
  }

  function drain(): Promise<void> {
    writing ??= writePending().finally(() => {
      writing = null;
    });
    return writing;
  }

  function schedule(): void {
    if (scheduled) return;
    scheduled = true;
    // Deferred so that appends made in the same task share one write.
    queueMicrotask(() => {
      scheduled = false;
      void drain();
    });
  }

  const snapshots = options.snapshots;
  const unsubscribe = log.subscribe((record) => {
    pendingEvents.push({ seq: record.seq, event: record.event });
    if (snapshots !== undefined && record.outcome === "applied") {
      pendingSnapshot = snapshots.encode(record.stateAfter, record.seq, log.checkpoint().intentKeys) ?? pendingSnapshot;
    }
    schedule();
  });
  if (checkpointDue()) schedule();

  return {
    gameId,
    localPlayerId,
    genesis: stored.genesis,
    log,
    opened: {
      ...checkpoint,
      replayedEvents: log.replay.events,
      replayFoldErrors: log.replay.errors.length,
    },
    flush: () => (writing ?? Promise.resolve()).then(drain),
    async close() {
      closed = true;
      if (retryTimer !== null) clearTimeout(retryTimer);
      retryTimer = null;
      unsubscribe();
      await (writing ?? Promise.resolve()).then(drain);
    },
  };
}
