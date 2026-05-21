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
  battleState: SharedBattleState | null;
  reducerState: BattleReducerState | null;
  dispatch: (action: BattleControllerAction) => void;
}

export const MultiplayerBattleContext =
  createContext<MultiplayerBattleValue | null>(null);

interface OptimisticBattleReducerState {
  battleId: string;
  reducerState: BattleReducerState;
  serial: number;
}

export function MultiplayerBattleProvider({
  children,
  database,
  roomId,
  clientId,
  battleState,
}: {
  children: ReactNode;
  database: Database;
  roomId: string;
  clientId: string;
  battleState: SharedBattleState | null;
}) {
  const stateRef = useRef({ database, roomId, clientId });
  stateRef.current = { database, roomId, clientId };
  const [optimistic, setOptimistic] = useState<OptimisticBattleReducerState | null>(null);

  const committedReducerState = useMemo<BattleReducerState | null>(
    () => createReducerStateFromSharedBattleState(battleState),
    [battleState],
  );

  useEffect(() => {
    if (battleState === null) {
      setOptimistic(null);
      return;
    }

    setOptimistic((current) => {
      if (current === null) return null;
      if (current.battleId !== battleState.init.battleId) return null;
      if (battleState.reducer.commandSerial >= current.serial) return null;
      return current;
    });
  }, [battleState]);

  const reducerState = optimistic?.reducerState ?? committedReducerState;

  const dispatch = useCallback((action: BattleControllerAction) => {
    const { database: db, roomId: id, clientId: actor } = stateRef.current;
    const failedBattleId = battleState?.init.battleId ?? null;
    setOptimistic((current) => {
      if (battleState === null || committedReducerState === null) {
        return current;
      }

      const isSameOptimisticBattle = current?.battleId === battleState.init.battleId;
      const source = isSameOptimisticBattle
        ? current.reducerState
        : committedReducerState;
      const next = battleControllerReducer(source, action);
      if (next === source) {
        return current;
      }

      return {
        battleId: battleState.init.battleId,
        reducerState: next,
        serial: (isSameOptimisticBattle
          ? current.serial
          : battleState.reducer.commandSerial) + 1,
      };
    });

    switch (action.type) {
      case "APPLY_COMMAND":
        void dispatchBattleCommandToRoom({
          database: db,
          roomId: id,
          command: action.command,
          actorId: actor,
        }).catch((error: unknown) => {
          if (failedBattleId !== null) {
            setOptimistic((current) =>
              current?.battleId === failedBattleId ? null : current,
            );
          }
          console.error("Failed to dispatch battle command", error);
        });
        return;
      case "UNDO":
      case "REDO":
        void dispatchBattleHistoryNav({
          database: db,
          roomId: id,
          direction: action.type === "UNDO" ? "undo" : "redo",
          actorId: actor,
        }).catch((error: unknown) => {
          if (failedBattleId !== null) {
            setOptimistic((current) =>
              current?.battleId === failedBattleId ? null : current,
            );
          }
          console.error("Failed to dispatch battle history nav", error);
        });
        return;
      default: {
        const _exhaustive: never = action;
        void _exhaustive;
        return;
      }
    }
  }, [battleState, committedReducerState]);

  const value = useMemo<MultiplayerBattleValue>(
    () => ({
      database,
      roomId,
      clientId,
      battleState,
      reducerState,
      dispatch,
    }),
    [database, roomId, clientId, battleState, reducerState, dispatch],
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
