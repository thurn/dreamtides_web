import type {
  BattleEngineEmissionContext,
  BattleHistory,
  BattleHistoryEntryMetadata,
  BattleInit,
  BattleMutableState,
  BattleReducerAction,
  BattleReducerTransition,
  BattleReducerState,
  BattleTransitionData,
} from "../types";
import {
  commitBattleHistoryEntry,
  createEmptyBattleHistory,
} from "./history";
import { logEvent } from "../../logging";
import { applyDebugEdit, forceBattleResult } from "./apply-debug-edit";
import { createReducerTransition } from "./transition";

export function createBattleReducerState(
  mutable: BattleMutableState,
  history: BattleHistory = createEmptyBattleHistory(),
): BattleReducerState {
  return {
    mutable,
    history,
    lastTransition: null,
    transitionId: 0,
    lastActivity: null,
    activityId: 0,
  };
}

export function battleReducer(
  state: BattleReducerState,
  action: BattleReducerAction,
  // Battle outcome is manual: DEBUG_EDIT and FORCE_RESULT do not consult init
  // config. The parameter is retained so callers can keep threading the shared
  // `battleInit` through the reducer/controller chain.
  _battleInit: Pick<
    BattleInit,
    "enableAi" | "maxEnergyCap" | "playerDrawSkipsTurnOne" | "scoreToWin" | "turnLimit"
  >,
): BattleReducerState {
  switch (action.type) {
    case "DEBUG_EDIT": {
      const context = createEngineEmissionContext(action.metadata);
      return commitReducerTransition(
        state,
        action.metadata,
        (mutableState) => applyDebugEdit(mutableState, action.edit, context),
      );
    }
    case "FORCE_RESULT": {
      const context = createEngineEmissionContext(action.metadata);
      return commitReducerTransition(
        state,
        action.metadata,
        (mutableState) => forceBattleResult(mutableState, action.result, context),
      );
    }
  }
}

function createEngineEmissionContext(
  metadata: BattleHistoryEntryMetadata,
): BattleEngineEmissionContext {
  const cardTarget = metadata.targets.find((target) => target.kind === "card");
  return {
    sourceSurface: metadata.sourceSurface,
    selectedCardId: cardTarget === undefined ? null : cardTarget.ref,
  };
}

function commitReducerTransition(
  state: BattleReducerState,
  metadata: BattleHistoryEntryMetadata,
  apply: (mutableState: BattleMutableState) => {
    state: BattleMutableState;
    transition: BattleTransitionData;
  },
): BattleReducerState {
  const next = apply(state.mutable);
  const nextTransition = createReducerTransition(metadata, next.transition);
  const nextHistory = commitBattleHistoryEntry(
    state.history,
    metadata,
    {
      mutable: state.mutable,
      lastTransition: state.lastTransition,
    },
    {
      mutable: next.state,
      lastTransition: nextTransition,
    },
  );

  if (nextHistory === state.history) {
    return state;
  }

  return {
    mutable: next.state,
    history: nextHistory,
    lastTransition: nextTransition,
    transitionId: state.transitionId + 1,
    lastActivity: state.lastActivity,
    activityId: state.activityId,
  };
}

export function emitBattleTransitionLogEvents(
  transition: BattleReducerTransition | null,
): void {
  if (transition === null) {
    return;
  }

  for (const event of transition.logEvents) {
    logEvent(event.event, event.fields);
  }
}

// `createReducerTransition` imported from ./transition (bug-016).
