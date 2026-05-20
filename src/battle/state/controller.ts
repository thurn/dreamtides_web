import { useEffect, useReducer, useRef, type Dispatch } from "react";
import { applyBattleCommand } from "../debug/apply-command";
import type { BattleCommand } from "../debug/commands";
import { createClearForcedResultMetadata } from "../debug/commands";
import { applyBattleResult } from "../engine/result";
import {
  logBattleCommandApplied,
  logBattleHistoryEvent,
} from "../../logging";
import { cloneBattleMutableState } from "./create-initial-state";
import {
  commitBattleHistoryEntry,
  redoBattleHistory,
  undoBattleHistory,
} from "./history";
import {
  createBattleReducerState,
  emitBattleTransitionLogEvents,
} from "./reducer";
import type {
  BattleHistoryEntry,
  BattleInit,
  BattleMutableState,
  BattleReducerState,
} from "../types";

export type BattleControllerAction =
  | {
    type: "APPLY_COMMAND";
    command: BattleCommand;
  }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "CLEAR_FORCED_RESULT" };

export function createBattleControllerState(
  mutableState: BattleMutableState,
): BattleReducerState {
  return createBattleReducerState(cloneBattleMutableState(mutableState));
}

export function battleControllerReducer(
  state: BattleReducerState,
  action: BattleControllerAction,
  battleInit: Pick<
    BattleInit,
    "enableAi" | "maxEnergyCap" | "playerDrawSkipsTurnOne" | "scoreToWin" | "turnLimit"
  >,
): BattleReducerState {
  switch (action.type) {
    case "APPLY_COMMAND":
      return applyCommandStateChange(
        state,
        applyBattleCommand(state, action.command, battleInit),
      );
    case "UNDO":
      return applyHistoryStateChange(state, "undo", undoBattleHistory(state.history));
    case "REDO":
      return applyHistoryStateChange(state, "redo", redoBattleHistory(state.history));
    case "CLEAR_FORCED_RESULT":
      return clearForcedResultInPlace(state, battleInit);
  }
}

function clearForcedResultInPlace(
  state: BattleReducerState,
  battleInit: Pick<BattleInit, "scoreToWin" | "turnLimit">,
): BattleReducerState {
  if (state.mutable.forcedResult === null) {
    return state;
  }

  const cleared = cloneBattleMutableState(state.mutable);
  cleared.forcedResult = null;
  const resolved = applyBattleResult(cleared, battleInit);

  // Record the auto-clear as its own history entry so undo/redo stays
  // consistent and the forced-result flag can be restored (H-20). The entry
  // is tagged as a `system`-actor result change; the transition carries only
  // the recomputed result (no gameplay steps).
  const metadata = createClearForcedResultMetadata();
  // bug-045: the `after` snapshot carries a synthesised transition so undo
  // targets of this entry see the recompute rather than aliasing whatever
  // transition the live `state.lastTransition` happened to point to.
  const afterTransition = {
    ...resolved.transition,
    metadata,
  };
  const nextHistory = commitBattleHistoryEntry(
    state.history,
    metadata,
    {
      mutable: state.mutable,
      lastTransition: state.lastTransition,
    },
    {
      mutable: resolved.state,
      lastTransition: afterTransition,
    },
  );

  if (nextHistory === state.history) {
    return {
      ...state,
      mutable: resolved.state,
      lastActivity: null,
    };
  }

  return {
    ...state,
    mutable: resolved.state,
    history: nextHistory,
    lastActivity: null,
  };
}


export function useBattleController(
  initialState: BattleMutableState,
  battleInit: Pick<
    BattleInit,
    "enableAi" | "maxEnergyCap" | "playerDrawSkipsTurnOne" | "scoreToWin" | "turnLimit"
  >,
): readonly [BattleReducerState, Dispatch<BattleControllerAction>] {
  const loggedActivityIdRef = useRef(0);
  const loggedTransitionIdRef = useRef(0);
  const [state, dispatch] = useReducer(
    (
      reducerState: BattleReducerState,
      action: BattleControllerAction,
    ) => battleControllerReducer(reducerState, action, battleInit),
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
