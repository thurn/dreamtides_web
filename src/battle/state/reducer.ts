import type {
  BattleAiChoiceTrace,
  BattleEngineEmissionContext,
  BattleHistory,
  BattleHistoryEntryMetadata,
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
): BattleReducerState {
  switch (action.type) {
    case "DEBUG_EDIT": {
      const context = createEngineEmissionContext(action.metadata);
      return commitReducerTransition(
        state,
        action.metadata,
        (mutableState) => applyDebugEdit(mutableState, action.edit, context),
        action.aiChoices,
      );
    }
    case "FORCE_RESULT": {
      const context = createEngineEmissionContext(action.metadata);
      return commitReducerTransition(
        state,
        action.metadata,
        (mutableState) => forceBattleResult(mutableState, action.result, context),
        action.aiChoices,
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
  aiChoices: BattleAiChoiceTrace[] | undefined,
): BattleReducerState {
  const next = apply(state.mutable);
  // Overlay the command envelope's AI choice trace(s) onto the resolved
  // transition so the battle log can render the move's rationale. Commands
  // without a trace keep the transition's own `aiChoices` (the `[]` default).
  const transitionData = aiChoices === undefined || aiChoices.length === 0
    ? next.transition
    : { ...next.transition, aiChoices };
  const nextTransition = createReducerTransition(metadata, transitionData);
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
