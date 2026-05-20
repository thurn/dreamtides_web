import { useEffect, useReducer, useRef, type Dispatch } from "react";
import { applyBattleCommand } from "../debug/apply-command";
import type { BattleCommand } from "../debug/commands";
import {
  logBattleCommandApplied,
  logBattleHistoryEvent,
} from "../../logging";
import { cloneBattleMutableState } from "./create-initial-state";
import {
  redoBattleHistory,
  undoBattleHistory,
} from "./history";
import {
  createBattleReducerState,
  emitBattleTransitionLogEvents,
} from "./reducer";
import type {
  BattleHistoryEntry,
  BattleMutableState,
  BattleReducerState,
} from "../types";

export type BattleControllerAction =
  | {
    type: "APPLY_COMMAND";
    command: BattleCommand;
  }
  | { type: "UNDO" }
  | { type: "REDO" };

export function createBattleControllerState(
  mutableState: BattleMutableState,
): BattleReducerState {
  return createBattleReducerState(cloneBattleMutableState(mutableState));
}

export function battleControllerReducer(
  state: BattleReducerState,
  action: BattleControllerAction,
): BattleReducerState {
  switch (action.type) {
    case "APPLY_COMMAND":
      return applyCommandStateChange(
        state,
        applyBattleCommand(state, action.command),
      );
    case "UNDO":
      return applyHistoryStateChange(state, "undo", undoBattleHistory(state.history));
    case "REDO":
      return applyHistoryStateChange(state, "redo", redoBattleHistory(state.history));
  }
}

export function useBattleController(
  initialState: BattleMutableState,
): readonly [BattleReducerState, Dispatch<BattleControllerAction>] {
  const loggedActivityIdRef = useRef(0);
  const loggedTransitionIdRef = useRef(0);
  const [state, dispatch] = useReducer(
    (
      reducerState: BattleReducerState,
      action: BattleControllerAction,
    ) => battleControllerReducer(reducerState, action),
    initialState,
    createBattleControllerState,
  );

  useEffect(() => {
    if (
      state.lastActivity === null ||
      state.activityId === loggedActivityIdRef.current
    ) {
      return;
    }

    loggedActivityIdRef.current = state.activityId;

    if (state.lastActivity.kind === "command") {
      logBattleCommandApplied(state.lastActivity.metadata, state.mutable);
      return;
    }

    logBattleHistoryEvent(
      state.lastActivity.kind === "undo"
        ? "battle_proto_history_undo"
        : "battle_proto_history_redo",
      state.lastActivity.metadata,
      state.mutable,
      {
        futureCount: state.history.future.length,
        historyCount: state.history.past.length,
      },
    );
  }, [
    state.activityId,
    state.history.future.length,
    state.history.past.length,
    state.lastActivity,
    state.mutable,
  ]);

  useEffect(() => {
    if (
      state.lastTransition === null ||
      state.transitionId === loggedTransitionIdRef.current
    ) {
      return;
    }

    loggedTransitionIdRef.current = state.transitionId;
    emitBattleTransitionLogEvents(state.lastTransition);
  }, [state.lastTransition, state.transitionId]);

  return [state, dispatch] as const;
}

function applyCommandStateChange(
  previousState: BattleReducerState,
  nextState: BattleReducerState,
): BattleReducerState {
  if (nextState === previousState) {
    return previousState;
  }

  const entry = nextState.history.past[nextState.history.past.length - 1];
  if (entry === undefined) {
    return nextState;
  }

  return {
    ...nextState,
    lastActivity: {
      kind: "command",
      metadata: { ...entry.metadata },
    },
    activityId: previousState.activityId + 1,
  };
}

function applyHistoryStateChange(
  state: BattleReducerState,
  kind: "undo" | "redo",
  restored:
    | {
      history: BattleReducerState["history"];
      restored: BattleHistoryEntry["before"];
      entry: BattleHistoryEntry;
    }
    | null,
): BattleReducerState {
  if (restored === null) {
    return state;
  }

  return {
    mutable: restored.restored.mutable,
    history: restored.history,
    lastTransition: restored.restored.lastTransition,
    transitionId: state.transitionId,
    lastActivity: {
      kind,
      metadata: { ...restored.entry.metadata },
    },
    activityId: state.activityId + 1,
  };
}
