import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Database } from "firebase/database";
import {
  dispatchBattleCommandToRoom,
  dispatchBattleHistoryNav,
} from "../multiplayer/battle-service";
import type { SharedBattleState } from "../multiplayer/battle-types";
import { createBattleReducerState } from "../battle/state/reducer";
import {
  battleControllerReducer,
  type BattleControllerAction,
} from "../battle/state/controller";
import type { BattleReducerState } from "../battle/types";

export interface MultiplayerBattleValue {
  database: Database;
  roomId: string;
  clientId: string;
  /**
   * Number of clients currently connected to the room. One connected client is
   * the single-player quest flow; two or more clients are sharing the room. The
   * battle AI uses this to gate itself off in shared rooms (it must run on
   * exactly one client).
   */
  connectedCount: number;
  battleState: SharedBattleState | null;
  reducerState: BattleReducerState | null;
  dispatch: (action: BattleControllerAction) => void;
  /**
   * A monotonic counter bumped every time a REMOTE actor (our coop partner)
   * advances the shared battle past our local command serial. Coop UI watches
   * this to dismiss choices the partner already resolved — most importantly an
   * open automation prompt (e.g. "Choose a card to discard"), which is purely
   * local runner state and would otherwise stay on screen forever after the
   * partner picks. It never bumps for our own optimistic writes (those keep the
   * room serial in lockstep with ours) nor in single-player (no remote actor).
   */
  remoteCommandEpoch: number;
}

export const MultiplayerBattleContext =
  createContext<MultiplayerBattleValue | null>(null);

/**
 * The client's authoritative battle state. It carries the FULL undo/redo history
 * (which is never synced to Firebase — see {@link battleService}) and is advanced
 * locally by every command/undo/redo. `serial` is the command serial this state
 * corresponds to, used to tell our own already-applied writes (room serial ==
 * ours) apart from a remote change (room serial ahead of ours).
 */
interface LocalBattleState {
  battleId: string;
  reducerState: BattleReducerState;
  serial: number;
}

function seedLocalFromShared(
  battleState: SharedBattleState,
): LocalBattleState {
  const reducerState = createReducerStateFromSharedBattleState(battleState);
  return {
    battleId: battleState.init.battleId,
    // `reducerState` is non-null because `battleState` is non-null.
    reducerState: reducerState as BattleReducerState,
    serial: battleState.reducer.commandSerial,
  };
}

export function MultiplayerBattleProvider({
  children,
  database,
  roomId,
  clientId,
  connectedCount,
  battleState,
}: {
  children: ReactNode;
  database: Database;
  roomId: string;
  clientId: string;
  connectedCount: number;
  battleState: SharedBattleState | null;
}) {
  const stateRef = useRef({ database, roomId, clientId });
  stateRef.current = { database, roomId, clientId };

  // `local` is the displayed/authoritative state with full history; `localRef`
  // mirrors it so `dispatch` reads the freshest value synchronously even across
  // several dispatches within one render tick.
  const [local, setLocal] = useState<LocalBattleState | null>(null);
  const localRef = useRef<LocalBattleState | null>(null);

  // Bumped whenever a remote partner command advances the SAME battle past our
  // local serial (see the reconciliation effect below). Exposed so coop UI can
  // dismiss prompts the partner resolved.
  const [remoteCommandEpoch, setRemoteCommandEpoch] = useState(0);
  const commitLocal = useCallback((next: LocalBattleState | null) => {
    localRef.current = next;
    setLocal(next);
  }, []);

  // A committed view rebuilt straight from the synced room, used for the first
  // render (before the reconciliation effect seeds `local`) and as the seed/
  // reseed source.
  const committedReducerState = useMemo<BattleReducerState | null>(
    () => createReducerStateFromSharedBattleState(battleState),
    [battleState],
  );

  // Reconcile the local authoritative state with the synced room. Reseed on a
  // fresh/changed battle or when the room's serial runs AHEAD of ours (a remote
  // change we did not produce — its history is not ours to keep). When the room
  // is the same age or behind (our own optimistic writes not yet echoed), keep
  // the local state and its history.
  useEffect(() => {
    if (battleState === null) {
      commitLocal(null);
      return;
    }
    const current = localRef.current;
    if (current === null || current.battleId !== battleState.init.battleId) {
      // Fresh or changed battle — reseed without treating it as a partner move.
      commitLocal(seedLocalFromShared(battleState));
      return;
    }
    if (battleState.reducer.commandSerial > current.serial) {
      // The room ran AHEAD of us on the same battle: a remote command our coop
      // partner applied (our own writes keep the room serial in lockstep, so the
      // strict `>` is uniquely a partner move). Reseed to their state and bump
      // the epoch so any prompt we have open can dismiss itself.
      commitLocal(seedLocalFromShared(battleState));
      setRemoteCommandEpoch((epoch) => epoch + 1);
    }
  }, [battleState, commitLocal]);

  const reducerState = local?.reducerState ?? committedReducerState;

  const dispatch = useCallback((action: BattleControllerAction) => {
    const { database: db, roomId: id, clientId: actor } = stateRef.current;
    if (battleState === null) {
      return;
    }
    const failedBattleId = battleState.init.battleId;

    // Advance the local authoritative state. The base is our current local state
    // when it belongs to this battle, otherwise a fresh seed from the room.
    const current = localRef.current;
    const base =
      current !== null && current.battleId === battleState.init.battleId
        ? current
        : seedLocalFromShared(battleState);
    const next = battleControllerReducer(base.reducerState, action);
    const changed = next !== base.reducerState;
    if (changed) {
      commitLocal({
        battleId: battleState.init.battleId,
        reducerState: next,
        serial: base.serial + 1,
      });
    }

    const onWriteError = (label: string) => (error: unknown) => {
      // Roll back to the synced room state on a failed write so the client does
      // not diverge from the persisted truth.
      if (localRef.current?.battleId === failedBattleId) {
        commitLocal(seedLocalFromShared(battleState));
      }
      console.error(label, error);
    };

    switch (action.type) {
      case "APPLY_COMMAND":
        // The room is authoritative for commands, so always forward them (a
        // command that no-ops locally simply no-ops in the transaction too).
        void dispatchBattleCommandToRoom({
          database: db,
          roomId: id,
          command: action.command,
          actorId: actor,
        }).catch(onWriteError("Failed to dispatch battle command"));
        return;
      case "UNDO":
      case "REDO":
        // Undo/redo navigate the client-local history; persist the restored
        // snapshot only when there was actually something to navigate.
        if (!changed) {
          return;
        }
        void dispatchBattleHistoryNav({
          database: db,
          roomId: id,
          direction: action.type === "UNDO" ? "undo" : "redo",
          restored: {
            mutable: next.mutable,
            lastTransition: next.lastTransition,
            restoredCommandLabel: next.lastActivity?.metadata.label ?? null,
          },
          actorId: actor,
        }).catch(onWriteError("Failed to dispatch battle history nav"));
        return;
      default: {
        const _exhaustive: never = action;
        void _exhaustive;
        return;
      }
    }
  }, [battleState, commitLocal]);

  const value = useMemo<MultiplayerBattleValue>(
    () => ({
      database,
      roomId,
      clientId,
      connectedCount,
      battleState,
      reducerState,
      dispatch,
      remoteCommandEpoch,
    }),
    [
      database,
      roomId,
      clientId,
      connectedCount,
      battleState,
      reducerState,
      dispatch,
      remoteCommandEpoch,
    ],
  );

  return (
    <MultiplayerBattleContext.Provider value={value}>
      {children}
    </MultiplayerBattleContext.Provider>
  );
}

function createReducerStateFromSharedBattleState(
  battleState: SharedBattleState | null,
): BattleReducerState | null {
  if (battleState === null) return null;
  const seeded = createBattleReducerState(
    battleState.reducer.mutable,
    battleState.reducer.history,
  );
  seeded.lastTransition = battleState.reducer.lastTransition;
  const kind = battleState.reducer.lastActivityKind;
  if (kind !== null) {
    const past = battleState.reducer.history.past;
    const future = battleState.reducer.history.future;
    const lastEntry = past[past.length - 1] ?? future[0];
    if (lastEntry !== undefined) {
      seeded.lastActivity = {
        kind,
        metadata: lastEntry.metadata,
      };
    }
  }
  return seeded;
}

export function useMultiplayerBattle(): MultiplayerBattleValue {
  const value = useContext(MultiplayerBattleContext);
  if (value === null) {
    throw new Error(
      "useMultiplayerBattle must be used within a MultiplayerBattleProvider",
    );
  }
  return value;
}
