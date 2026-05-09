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
  dispatchClearForcedResult,
} from "../multiplayer/battle-service";
import type { SharedBattleState } from "../multiplayer/battle-types";
import { createBattleReducerState } from "../battle/state/reducer";
import type { BattleControllerAction } from "../battle/state/controller";
import type { BattleReducerState } from "../battle/types";

export interface MultiplayerBattleValue {
  battleState: SharedBattleState | null;
  reducerState: BattleReducerState | null;
  dispatch: (action: BattleControllerAction) => void;
}

const MultiplayerBattleContext = createContext<MultiplayerBattleValue | null>(
  null,
);

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
      case "RUN_AI_TURN":
        // Phase 2 hardcodes startingSide to "player", so the bootstrap
        // RUN_AI_TURN never actually fires in production. Treat as a no-op
        // here; if a future phase needs it, fold into APPLY_COMMAND with a
        // dedicated service helper.
        return;
      case "CLEAR_FORCED_RESULT":
        void dispatchClearForcedResult({
          database: db,
          roomId: id,
          actorId: actor,
        }).catch((error: unknown) => {
          console.error("Failed to dispatch clear forced result", error);
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
    () => ({ battleState, reducerState, dispatch }),
    [battleState, reducerState, dispatch],
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
