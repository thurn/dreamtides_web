import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import type { Database } from "firebase/database";
import {
  dispatchBattleCommandToRoom,
  dispatchBattleHistoryNav,
} from "../multiplayer/battle-service";
import type { SharedBattleState } from "../multiplayer/battle-types";
import { createBattleReducerState } from "../battle/state/reducer";
import type { BattleControllerAction } from "../battle/state/controller";
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

  const reducerState = useMemo<BattleReducerState | null>(() => {
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
  }, [battleState]);

  const dispatch = useCallback((action: BattleControllerAction) => {
    const { database: db, roomId: id, clientId: actor } = stateRef.current;
    switch (action.type) {
      case "APPLY_COMMAND":
        void dispatchBattleCommandToRoom({
          database: db,
          roomId: id,
          command: action.command,
          actorId: actor,
        }).catch((error: unknown) => {
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
          console.error("Failed to dispatch battle history nav", error);
        });
        return;
      default: {
        const _exhaustive: never = action;
        void _exhaustive;
        return;
      }
    }
  }, []);

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

export function useMultiplayerBattle(): MultiplayerBattleValue {
  const value = useContext(MultiplayerBattleContext);
  if (value === null) {
    throw new Error(
      "useMultiplayerBattle must be used within a MultiplayerBattleProvider",
    );
  }
  return value;
}
