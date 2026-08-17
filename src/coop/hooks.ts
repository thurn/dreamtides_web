// The coop React provider and hooks: the LogClient's React face.
//
// `CoopProvider` owns exactly ONE `createLogClient(GAME_ENGINE_CONFIG, io, ...)`
// per ready room. It binds the client's IO to `subscribeToLog` + `appendEvent`
// (RTDB-backed via the room's `db` + `roomId` from RoomGate's ready context),
// wires the client's callbacks to the journey-log sink's record helpers, keeps the
// displayed fold in React state, and drives the own-bounce toast.
//
// Hooks exposed:
//   - `useGameState()`     — the displayed fold (confirmed + optimistic).
//   - `useAppend()`        — an append fn that stamps actor/clientTimestamp/
//                            basedOnSeq via the client; accepts an actor override
//                            for AI-originated events (`actor: "ai:<clientId>"`).
//   - `useActions()`       — the named action facade bound to `useAppend`, with
//                            the RESOLVE_PROMPT confirmed-prompt guard applied.
//   - `useConnectedCount()`— presence-derived connected-client count.
//   - `useEventOutcomes(cb)` — subscribe to confirmed event outcomes.
//   - `useConfirmedPromptId()` — the open prompt's id, but only once its opening
//                            event is CONFIRMED (see the RESOLVE_PROMPT rule).
//
// This file lives under src/coop/ (React + Firebase allowed); it is the ONLY
// place the game engine meets React.
//
// See docs/superpowers/specs/2026-07-01-coop-event-sourcing-rewrite-design.md
// §"Client layer".

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { settleDeferredOpponentLog } from "./providers/battle-init-provider";
import { onValue, ref, type Database } from "firebase/database";
import {
  createLogClient,
  type EventDraft,
  type LogClient,
  type LogClientIo,
} from "../eventlog/client";
import type { EventOutcome, GameEvent } from "../eventlog/types";
import { appendEvent } from "../eventlog/append";
import { subscribeToLog } from "../eventlog/subscribe";
import { connectedClientCount, decodePresence } from "../eventlog/room";
import { GAME_ENGINE_CONFIG } from "../rules/replay/replay";
import type { FoldState } from "../rules/fold-state";
import { logEvent } from "../logging";
import type { RoomReadyContext } from "./RoomGate";
import { makeActions, type AppendFn, type CoopActions } from "./actions";
import {
  APPEND_FAILED_MESSAGE,
  BounceToast,
  INVALID_ACTION_MESSAGE,
  PENDING_DROPPED_MESSAGE,
  bounceMessageForReason,
} from "./BounceToast";
import { UnreadableRoomScreen } from "./UnreadableRoomScreen";
import { CURRENT_REDUCER_VERSION } from "./reducer-version";
import type { LocalizedString } from "@trox/runtime";
import {
  parseClientId,
  type ClientId,
} from "../types/identifiers";

/** A confirmed event's outcome, delivered to `useEventOutcomes` subscribers. */
export type OutcomeListener = (
  event: GameEvent,
  seq: number,
  outcome: EventOutcome,
) => void;

interface CoopContextValue {
  /** Firebase database and room identity used by disaster-recovery metadata. */
  db: Database;
  roomId: RoomReadyContext["roomId"];
  genesis: RoomReadyContext["genesis"];
  /** This client's id, as minted by `RoomGate` (`mintClientId`). */
  clientId: ClientId;
  /** The displayed fold (confirmed + optimistic); seeded from genesis pre-fold. */
  gameState: FoldState;
  /** The room fold containing committed events only; safe for autonomous work. */
  confirmedGameState: FoldState;
  /** Stamp + append one event; `draft.actor` overrides this client's id. */
  append: AppendFn;
  /** Named action creators bound to `append` (RESOLVE_PROMPT guard applied). */
  actions: CoopActions;
  /** Connected clients, from the room's presence node. */
  connectedCount: number | null;
  /** Connected presence client ids, or null until presence has loaded. */
  connectedClientIds: readonly ClientId[] | null;
  /** Contiguous confirmed log head; null until the first node is folded. */
  confirmedHead: number | null;
  /** Recovery generation containing the confirmed fold. */
  confirmedGeneration: number;
  /**
   * Newest CONFIRMED seq (the max seq `onEventOutcome` has reported). A prompt
   * whose `promptId` (= its opening event's seq) exceeds this is still an
   * optimistic echo and must not be resolved yet.
   */
  confirmedSeqRef: MutableRefObject<number>;
  /** Register an outcome listener; returns an unsubscribe. */
  registerOutcomeListener: (listener: OutcomeListener) => () => void;
}

const CoopContext = createContext<CoopContextValue | null>(null);

function useCoop(): CoopContextValue {
  const value = useContext(CoopContext);
  if (value === null) {
    throw new Error("Coop hooks must be used within a CoopProvider");
  }
  return value;
}

/** How long the own-bounce toast stays up before auto-dismissing. */
const BOUNCE_TOAST_MS = 4000;

/**
 * Mounts one LogClient for the ready room and provides the coop hooks to
 * `children`. Renders the own-bounce toast alongside them.
 */
export function CoopProvider({
  context,
  children,
}: {
  context: RoomReadyContext;
  children: ReactNode;
}): ReactNode {
  const { db, roomId, clientId, genesis, logSink } = context;

  // Displayed fold. Seeded from genesis so `useGameState` is never null before
  // the first log node folds; `onDisplayState` overwrites it thereafter.
  const [gameState, setGameState] = useState<FoldState>(() =>
    GAME_ENGINE_CONFIG.genesisState(genesis),
  );
  const [confirmedGameState, setConfirmedGameState] = useState<FoldState>(() =>
    GAME_ENGINE_CONFIG.genesisState(genesis),
  );
  const [connectedCount, setConnectedCount] = useState<number | null>(null);
  const [connectedClientIds, setConnectedClientIds] = useState<
    readonly ClientId[] | null
  >(null);
  const [confirmedHead, setConfirmedHead] = useState<number | null>(null);
  const [confirmedGeneration, setConfirmedGeneration] = useState(0);
  const [corruptLog, setCorruptLog] = useState(false);
  const [bounceToken, setBounceToken] = useState(0);
  // The copy for the toast the next `bounceToken` bump shows. Set by whichever
  // callback triggers it (own bounce / append failure / pending drop); read at
  // render time. A ref (not state) because the token bump already re-renders.
  const bounceMessageRef = useRef<LocalizedString>(INVALID_ACTION_MESSAGE);

  const confirmedSeqRef = useRef(0);
  const clientRef = useRef<LogClient | null>(null);
  // True once the client has folded its first log node and therefore has a
  // confirmed baseline (`confirmedState`/`lastFoldedSeq` defined). The real
  // `LogClient.submit` REJECTS before that baseline exists — it needs it to
  // stamp `basedOnSeq` — so a draft must not be submitted until this flips.
  // Set on the client's first `onDisplayState` (the first fold's signal) and
  // reset on teardown so a new room starts unready.
  const baselineReadyRef = useRef(false);
  // Appends requested before the LogClient has a confirmed baseline. Two races
  // feed this queue:
  //   1. Client does not yet EXIST. On initial mount React flushes child
  //      effects before parent effects, so a child's mount-time dispatch (the
  //      `?goto=` bootstrap, which auto-appends a
  //      LOAD_STATE) runs before this provider's client-creating effect.
  //   2. Client exists but its FIRST NODE has not arrived. The log subscription
  //      delivers its genesis/first node asynchronously (Firebase `onValue`),
  //      so `submit` would reject with "called before the first log node
  //      arrived" until the baseline folds.
  // Rather than reject and strand these drafts, `append` queues them here and
  // the queue is flushed — in FIFO order — the instant the baseline is ready.
  const pendingAppendsRef = useRef<
    Array<{
      draft: EventDraft;
      resolve: (seq: number) => void;
      reject: (error: unknown) => void;
    }>
  >([]);
  const outcomeListenersRef = useRef<Set<OutcomeListener>>(new Set());
  // Keep the latest sink handle reachable from the (stable) client callbacks so
  // a sink swap does not force the client to be torn down and re-subscribed.
  const logSinkRef = useRef(logSink);
  logSinkRef.current = logSink;

  // One LogClient per (db, roomId, clientId). Its callbacks are stable across
  // renders (they read mutable refs), so the client is created once per room.
  useEffect(() => {
    setCorruptLog(false);
    setConfirmedHead(null);
    const io: LogClientIo = {
      subscribe: (onNode) =>
        subscribeToLog(db, roomId, onNode, () => {
          setCorruptLog(true);
        }),
      append: (event) => appendEvent(db, roomId, GAME_ENGINE_CONFIG, event),
    };

    // Drain the pending-append queue once a client exists AND has a confirmed
    // baseline. Captures-then-clears before iterating (no draft can be
    // double-submitted) and preserves FIFO order. `submit` stamps
    // basedOnSeq/nonce itself at this point, so nothing is captured early.
    const flushPendingAppends = (): void => {
      const client = clientRef.current;
      if (client === null || !baselineReadyRef.current) {
        return;
      }
      const pending = pendingAppendsRef.current;
      if (pending.length === 0) {
        return;
      }
      pendingAppendsRef.current = [];
      for (const { draft, resolve, reject } of pending) {
        client.submit(draft).then(resolve, reject);
      }
    };

    const client = createLogClient<FoldState>(
      GAME_ENGINE_CONFIG,
      io,
      {
        onDisplayState: (state) => {
          setGameState(state);
          // The first fold delivers the confirmed baseline. Flip the gate and
          // flush any drafts queued while the baseline was still pending.
          if (!baselineReadyRef.current) {
            baselineReadyRef.current = true;
            flushPendingAppends();
          }
        },
        onConfirmedState: setConfirmedGameState,
        onConfirmedHead: setConfirmedHead,
        onConfirmedGeneration: setConfirmedGeneration,
        onEventOutcome: (event, seq, outcome, detail) => {
          if (seq > confirmedSeqRef.current) {
            confirmedSeqRef.current = seq;
          }
          // Single-writer mirror: records only events THIS client appended
          // (returns true), deduped past a high-water seq.
          const owned = logSinkRef.current.recordCoopEvent(event, seq, outcome);
          if (owned && outcome === "applied") {
            logSinkRef.current.recordPlaytestControlChange(
              seq,
              detail.stateBefore,
              detail.stateAfter,
            );
            if (
              event.type === "END_BATTLE" &&
              detail.stateBefore.battle?.board.result === "victory"
            ) {
              const before = detail.stateBefore;
              const after = detail.stateAfter;
              const init = before.battle!.init;
              const completedNode =
                init.dreamscapeId === null
                  ? undefined
                  : before.journey.atlas.nodes[init.dreamscapeId];
              const availableForwardIds = (
                completedNode?.forwardIds ?? []
              ).filter(
                (nodeId) =>
                  after.journey.atlas.nodes[nodeId]?.state === "available",
              );
              logEvent("battle_victory_committed", {
                coopSeq: seq,
                battleId: init.battleId,
                siteId: init.siteId,
                dreamscapeId: init.dreamscapeId,
                essenceReward: init.essenceReward,
                essenceBefore: before.journey.essence,
                essenceAfter: after.journey.essence,
                completionLevelBefore: before.journey.completionLevel,
                completionLevelAfter: after.journey.completionLevel,
                completedNodeState:
                  init.dreamscapeId === null
                    ? null
                    : (after.journey.atlas.nodes[init.dreamscapeId]?.state ??
                      null),
                availableForwardIds,
                availableForwardDreamscapeIds: availableForwardIds.map(
                  (nodeId) =>
                    after.journey.atlas.nodes[nodeId]?.dreamscapeId ?? null,
                ),
              });
            }
          }
          if (event.type === "BEGIN_BATTLE") {
            settleDeferredOpponentLog(seq, owned && outcome === "applied");
          }
          if (owned && outcome === "bounced") {
            // Own intent bounced. Preserve both the machine-readable cause and
            // the diagnostic intervening window, then show cause-specific copy.
            logSinkRef.current.recordBounce(
              seq,
              detail?.interveningSeqs ?? [],
              detail?.bounceReason ?? "invalid_action",
            );
            // Surface the toast; a token bump re-shows it even on repeats.
            bounceMessageRef.current = bounceMessageForReason(
              detail?.bounceReason,
            );
            setBounceToken((token) => token + 1);
          }
          for (const listener of outcomeListenersRef.current) {
            listener(event, seq, outcome);
          }
        },
        onDivergence: (info) => {
          logSinkRef.current.recordDivergence(info);
        },
        onFoldError: (error, event, detail) => {
          logSinkRef.current.recordFoldError(
            error,
            event,
            GAME_ENGINE_CONFIG.hash(detail.stateBefore),
            GAME_ENGINE_CONFIG.hash(detail.stateAfter),
          );
          console.error("Coop fold error", error);
        },
        onAppendFailed: (event, error) => {
          // The intent never reached the log; the echo already rolled back.
          // Log it for reconstruction and tell the player to retry.
          logSinkRef.current.recordAppendFailed(event, error);
          bounceMessageRef.current = APPEND_FAILED_MESSAGE;
          setBounceToken((token) => token + 1);
        },
        onPendingDropped: (events) => {
          // A reconnect/compaction full refold discarded these unconfirmed
          // intents. Log each and tell the player they were dropped.
          logSinkRef.current.recordPendingDropped(events);
          bounceMessageRef.current = PENDING_DROPPED_MESSAGE;
          setBounceToken((token) => token + 1);
        },
        onAuthoritativeCorrection: (info) => {
          logSinkRef.current.recordAuthoritativeCorrection(info);
        },
        onIntentKeyCollision: (info) => {
          logSinkRef.current.recordIntentKeyCollision(info);
        },
      },
      { clientId },
    );
    clientRef.current = client;

    // Cover the case where the subscription delivered its first node
    // synchronously during `createLogClient`: `baselineReadyRef` is already
    // true but the flush inside `onDisplayState` saw a null `clientRef`. Now
    // that the client is installed, drain whatever is queued. On the ordinary
    // async-delivery path the baseline is not ready yet, so this is a no-op and
    // the flush happens later, from the first `onDisplayState`.
    flushPendingAppends();

    return () => {
      client.close();
      clientRef.current = null;
      baselineReadyRef.current = false;
      // Reject anything still queued when the room tears down so callers are
      // not left with a promise that never settles.
      const stranded = pendingAppendsRef.current;
      pendingAppendsRef.current = [];
      for (const { reject } of stranded) {
        reject(
          new Error("CoopProvider: room closed before LogClient was ready"),
        );
      }
    };
  }, [db, roomId, clientId]);

  // Presence-derived connected count for `useConnectedCount`.
  useEffect(() => {
    const presenceRef = ref(db, `rooms/${roomId}/presence`);
    return onValue(presenceRef, (snapshot) => {
      const presence = decodePresence(snapshot.val());
      setConnectedCount(connectedClientCount(presence));
      setConnectedClientIds(
        Object.keys(presence ?? {})
          .filter((clientId) => presence?.[clientId]?.connected === true)
          .map(parseClientId)
          .sort(),
      );
    });
  }, [db, roomId]);

  // Own-bounce toast auto-dismiss.
  const [showBounce, setShowBounce] = useState(false);
  useEffect(() => {
    if (bounceToken === 0) {
      return undefined;
    }
    setShowBounce(true);
    const timer = setTimeout(() => setShowBounce(false), BOUNCE_TOAST_MS);
    return () => clearTimeout(timer);
  }, [bounceToken]);

  const append = useCallback<AppendFn>((draft: EventDraft) => {
    const client = clientRef.current;
    if (client === null || !baselineReadyRef.current) {
      // The client does not exist yet, or exists but has no confirmed baseline
      // (its first node has not folded). Either way `submit` cannot stamp
      // `basedOnSeq`, so queue until the baseline arrives (see
      // `pendingAppendsRef`); the first `onDisplayState` flushes in FIFO order.
      // Resolves with the committed seq once submitted.
      return new Promise<number>((resolve, reject) => {
        pendingAppendsRef.current.push({ draft, resolve, reject });
      });
    }
    // Baseline is ready: submit immediately, adding no queuing latency.
    return client.submit(draft);
  }, []);

  const registerOutcomeListener = useCallback((listener: OutcomeListener) => {
    outcomeListenersRef.current.add(listener);
    return () => {
      outcomeListenersRef.current.delete(listener);
    };
  }, []);

  // Action facade bound to `append`. `resolvePrompt` is guarded: a promptId
  // greater than the newest confirmed seq targets a prompt that exists only
  // optimistically, so the resolve is refused until confirmation lands (the
  // "resolve waits for its confirmation" rule; the battle UI keeps its button
  // disabled via `useConfirmedPromptId` so this is a defensive backstop).
  const actions = useMemo<CoopActions>(() => {
    const base = makeActions(append, {
      selectionRulesVersion:
        genesis.reducerVersion === CURRENT_REDUCER_VERSION ? undefined : null,
    });
    return {
      ...base,
      resolvePrompt: (promptId, resolution, intentKey, actor) => {
        if (promptId > confirmedSeqRef.current) {
          return Promise.reject(
            new Error(
              `RESOLVE_PROMPT refused: promptId ${promptId} is not yet confirmed`,
            ),
          );
        }
        return base.resolvePrompt(promptId, resolution, intentKey, actor);
      },
    };
  }, [append, genesis.reducerVersion]);

  const value = useMemo<CoopContextValue>(
    () => ({
      db,
      roomId,
      genesis,
      clientId,
      gameState,
      confirmedGameState,
      append,
      actions,
      connectedCount,
      connectedClientIds,
      confirmedHead,
      confirmedGeneration,
      confirmedSeqRef,
      registerOutcomeListener,
    }),
    [
      db,
      roomId,
      genesis,
      clientId,
      gameState,
      confirmedGameState,
      append,
      actions,
      connectedCount,
      connectedClientIds,
      confirmedHead,
      confirmedGeneration,
      registerOutcomeListener,
    ],
  );

  if (corruptLog) {
    return createElement(UnreadableRoomScreen, {
      db,
      contentConfig: genesis.contentConfig,
    });
  }

  return createElement(
    CoopContext.Provider,
    { value },
    children,
    showBounce
      ? createElement(BounceToast, {
          key: "coop-bounce-toast",
          message: bounceMessageRef.current,
          onDismiss: () => setShowBounce(false),
        })
      : null,
  );
}

/** The displayed fold state (confirmed + optimistic). */
export function useGameState(): FoldState {
  return useCoop().gameState;
}

/** The committed room fold, excluding this client's optimistic intent queue. */
export function useConfirmedGameState(): FoldState {
  return useCoop().confirmedGameState;
}

/** The contiguous confirmed log head, or null before the initial fold. */
export function useConfirmedHead(): number | null {
  return useCoop().confirmedHead;
}

/** Inputs required to publish a verified room recovery checkpoint. */
export function useRoomRecoveryContext(): Pick<
  CoopContextValue,
  | "db"
  | "roomId"
  | "genesis"
  | "confirmedGameState"
  | "confirmedHead"
  | "confirmedGeneration"
> | null {
  const value = useContext(CoopContext);
  if (value === null) return null;
  return {
    db: value.db,
    roomId: value.roomId,
    genesis: value.genesis,
    confirmedGameState: value.confirmedGameState,
    confirmedHead: value.confirmedHead,
    confirmedGeneration: value.confirmedGeneration,
  };
}

/** This client's id, as minted by `RoomGate` (`mintClientId`). Stable for the
 *  lifetime of the room mount; used to stamp AI-originated events
 *  (`actor: "ai:<clientId>"`). */
export function useClientId(): ClientId {
  return useCoop().clientId;
}

/**
 * An append fn that builds a full event from a draft, stamping actor,
 * clientTimestamp, and basedOnSeq via the LogClient. Pass `draft.actor` to
 * override the actor for AI-originated events (`"ai:<clientId>"`).
 */
export function useAppend(): AppendFn {
  return useCoop().append;
}

/** The named action facade, bound to this room's append. */
export function useActions(): CoopActions {
  return useCoop().actions;
}

/** The number of clients currently connected to the room. */
export function useConnectedCount(): number | null {
  return useCoop().connectedCount;
}

/** Connected presence client ids, or null while the presence snapshot is unknown. */
export function useConnectedClientIds(): readonly ClientId[] | null {
  return useCoop().connectedClientIds;
}

/** Subscribe to confirmed event outcomes for the lifetime of the caller. */
export function useEventOutcomes(listener: OutcomeListener): void {
  const { registerOutcomeListener } = useCoop();
  const listenerRef = useRef(listener);
  listenerRef.current = listener;
  useEffect(
    () =>
      registerOutcomeListener((event, seq, outcome) =>
        listenerRef.current(event, seq, outcome),
      ),
    [registerOutcomeListener],
  );
}

/**
 * The open prompt's id, but only once its opening event is CONFIRMED. Returns
 * `null` while no prompt is open or while the prompt exists only as an
 * optimistic echo (its promptId — the opening event's predicted seq — exceeds
 * the newest confirmed seq). Callers use this to gate the resolve control so a
 * resolve never targets a promptId that has not yet come to exist confirmed.
 */
export function useConfirmedPromptId(): number | null {
  const { gameState, confirmedSeqRef } = useCoop();
  const promptId = gameState.battle?.pendingPrompt?.promptId ?? null;
  if (promptId === null || promptId > confirmedSeqRef.current) {
    return null;
  }
  return promptId;
}
