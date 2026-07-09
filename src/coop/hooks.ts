// The coop React provider and hooks: the LogClient's React face.
//
// `CoopProvider` owns exactly ONE `createLogClient(GAME_ENGINE_CONFIG, io, ...)`
// per ready room. It binds the client's IO to `subscribeToLog` + `appendEvent`
// (RTDB-backed via the room's `db` + `roomId` from RoomGate's ready context),
// wires the client's callbacks to the quest-log sink's record helpers, keeps the
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
import { onValue, ref } from "firebase/database";
import {
  createLogClient,
  type EventDraft,
  type LogClient,
  type LogClientIo,
} from "../eventlog/client";
import type { EventOutcome, GameEvent } from "../eventlog/types";
import { appendEvent } from "../eventlog/append";
import { subscribeToLog } from "../eventlog/subscribe";
import { connectedClientCount, type PresenceEntry } from "../eventlog/room";
import { GAME_ENGINE_CONFIG } from "../rules/replay/replay";
import type { FoldState } from "../rules/fold-state";
import type { RoomReadyContext } from "./RoomGate";
import { makeActions, type AppendFn, type CoopActions } from "./actions";
import { BounceToast } from "./BounceToast";

/** A confirmed event's outcome, delivered to `useEventOutcomes` subscribers. */
export type OutcomeListener = (
  event: GameEvent,
  seq: number,
  outcome: EventOutcome,
) => void;

interface CoopContextValue {
  /** This client's id, as minted by `RoomGate` (`mintClientId`). */
  clientId: string;
  /** The displayed fold (confirmed + optimistic); seeded from genesis pre-fold. */
  gameState: FoldState;
  /** Stamp + append one event; `draft.actor` overrides this client's id. */
  append: AppendFn;
  /** Named action creators bound to `append` (RESOLVE_PROMPT guard applied). */
  actions: CoopActions;
  /** Connected clients, from the room's presence node. */
  connectedCount: number;
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
  const [connectedCount, setConnectedCount] = useState(0);
  const [bounceToken, setBounceToken] = useState(0);

  const confirmedSeqRef = useRef(0);
  const clientRef = useRef<LogClient | null>(null);
  // Appends requested before the LogClient exists. On initial mount React
  // flushes child effects before parent effects, so a child's mount-time
  // dispatch (the `?startInBattle=1` / `?goto=` bootstrap, which auto-appends
  // a LOAD_STATE) runs before this provider's client-creating effect. Rather
  // than reject and strand that one-shot bootstrap forever, `append` queues the
  // draft here and the client-creating effect flushes the queue the instant the
  // client exists.
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
    const io: LogClientIo = {
      subscribe: (onNode) => subscribeToLog(db, roomId, onNode),
      append: (event) => appendEvent(db, roomId, GAME_ENGINE_CONFIG, event),
    };

    const client = createLogClient<FoldState>(
      GAME_ENGINE_CONFIG,
      io,
      {
        onDisplayState: (state) => {
          setGameState(state);
        },
        onEventOutcome: (event, seq, outcome) => {
          if (seq > confirmedSeqRef.current) {
            confirmedSeqRef.current = seq;
          }
          // Single-writer mirror: records only events THIS client appended
          // (returns true), deduped past a high-water seq.
          const owned = logSinkRef.current.recordCoopEvent(event, seq, outcome);
          if (owned && outcome === "bounced") {
            // Own intent bounced (a partner committed first). The intervening
            // seqs are not surfaced by this callback; [] is acceptable per the
            // Task 24 recorder contract.
            logSinkRef.current.recordBounce(seq, []);
            // Surface the toast; a token bump re-shows it even on repeats.
            setBounceToken((token) => token + 1);
          }
          for (const listener of outcomeListenersRef.current) {
            listener(event, seq, outcome);
          }
        },
        onDivergence: (info) => {
          logSinkRef.current.recordDivergence(info);
        },
        onFoldError: (error) => {
          console.error("Coop fold error", error);
        },
      },
      { clientId },
    );
    clientRef.current = client;

    // Flush any appends queued before the client existed (the mount-time
    // bootstrap race described on `pendingAppendsRef`), preserving order.
    const pending = pendingAppendsRef.current;
    pendingAppendsRef.current = [];
    for (const { draft, resolve, reject } of pending) {
      client.submit(draft).then(resolve, reject);
    }

    return () => {
      client.close();
      clientRef.current = null;
      // Reject anything still queued when the room tears down so callers are
      // not left with a promise that never settles.
      const stranded = pendingAppendsRef.current;
      pendingAppendsRef.current = [];
      for (const { reject } of stranded) {
        reject(new Error("CoopProvider: room closed before LogClient was ready"));
      }
    };
  }, [db, roomId, clientId]);

  // Presence-derived connected count for `useConnectedCount`.
  useEffect(() => {
    const presenceRef = ref(db, `rooms/${roomId}/presence`);
    return onValue(presenceRef, (snapshot) => {
      const presence = snapshot.val() as Record<string, PresenceEntry> | null;
      setConnectedCount(connectedClientCount(presence));
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
    if (client === null) {
      // Queue until the client-creating effect runs and flushes (see
      // `pendingAppendsRef`). Resolves with the committed seq once submitted.
      return new Promise<number>((resolve, reject) => {
        pendingAppendsRef.current.push({ draft, resolve, reject });
      });
    }
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
    const base = makeActions(append);
    return {
      ...base,
      resolvePrompt: (promptId, resolution) => {
        if (promptId > confirmedSeqRef.current) {
          return Promise.reject(
            new Error(
              `RESOLVE_PROMPT refused: promptId ${promptId} is not yet confirmed`,
            ),
          );
        }
        return base.resolvePrompt(promptId, resolution);
      },
    };
  }, [append]);

  const value = useMemo<CoopContextValue>(
    () => ({
      clientId,
      gameState,
      append,
      actions,
      connectedCount,
      confirmedSeqRef,
      registerOutcomeListener,
    }),
    [clientId, gameState, append, actions, connectedCount, registerOutcomeListener],
  );

  return createElement(
    CoopContext.Provider,
    { value },
    children,
    showBounce
      ? createElement(BounceToast, {
          key: "coop-bounce-toast",
          onDismiss: () => setShowBounce(false),
        })
      : null,
  );
}

/** The displayed fold state (confirmed + optimistic). */
export function useGameState(): FoldState {
  return useCoop().gameState;
}

/** This client's id, as minted by `RoomGate` (`mintClientId`). Stable for the
 *  lifetime of the room mount; used to stamp AI-originated events
 *  (`actor: "ai:<clientId>"`). */
export function useClientId(): string {
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
export function useConnectedCount(): number {
  return useCoop().connectedCount;
}

/** Subscribe to confirmed event outcomes for the lifetime of the caller. */
export function useEventOutcomes(listener: OutcomeListener): void {
  const { registerOutcomeListener } = useCoop();
  const listenerRef = useRef(listener);
  listenerRef.current = listener;
  useEffect(
    () => registerOutcomeListener((event, seq, outcome) => listenerRef.current(event, seq, outcome)),
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
