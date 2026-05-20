import {
  createRecomputeResultHistoryMetadata,
} from "../debug/commands";
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
  applyBattleResult,
  evaluateBattleResult,
} from "../engine/result";
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
  battleInit: Pick<
    BattleInit,
    "enableAi" | "maxEnergyCap" | "playerDrawSkipsTurnOne" | "scoreToWin" | "turnLimit"
  >,
): BattleReducerState {
  switch (action.type) {
    case "DEBUG_EDIT": {
      const context = createEngineEmissionContext(action.metadata);
      return commitGameplayTransition(
        state,
        action.metadata,
        (mutableState) => applyDebugEdit(mutableState, action.edit, context),
        battleInit,
        context,
      );
    }
    case "FORCE_RESULT": {
      const context = createEngineEmissionContext(action.metadata);
      return commitReducerTransition(
        state,
        action.metadata,
        (mutableState) => forceBattleResult(mutableState, action.result, battleInit, context),
      );
    }
    case "RECOMPUTE_RESULT":
      return commitReducerTransition(
        state,
        createRecomputeResultHistoryMetadata(action),
        (mutableState) =>
          applyBattleResult(mutableState, battleInit),
      );
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

function commitGameplayTransition(
  state: BattleReducerState,
  metadata: BattleHistoryEntryMetadata,
  apply: (mutableState: BattleMutableState) => {
    state: BattleMutableState;
    transition: BattleTransitionData;
  },
  battleInit: Pick<BattleInit, "scoreToWin" | "turnLimit">,
  context: BattleEngineEmissionContext,
): BattleReducerState {
  return commitReducerTransition(state, metadata, (mutableState) => {
    const next = apply(mutableState);
    if (next.state === mutableState) {
      return next;
    }

    // Bug 019 / H-7 / K-13: gameplay edits (PLAY_CARD / MOVE_CARD /
    // DEBUG_EDIT) fold an auto-clear of a stale forced defeat/draw into the
    // same history entry as the triggering user action. Without this inline
    // clear, the separate `CLEAR_FORCED_RESULT` history commit produced by
    // `useAutoClearForcedResult` doubles the undo depth for one user gesture.
    const cleared = clearStaleForcedResultInPlace(next.state, battleInit);
    const resolved = applyBattleResult(cleared, battleInit, context);
    return {
      state: resolved.state,
      transition: mergeTransitions(next.transition, resolved.transition),
    };
  });
}

function clearStaleForcedResultInPlace(
  state: BattleMutableState,
  battleInit: Pick<BattleInit, "scoreToWin" | "turnLimit">,
): BattleMutableState {
  // Only auto-clear stale defeat/draw. Forced victory is sticky (user
  // intent to jump to reward flow); see §K-13 / use-auto-clear-forced-result.
  if (state.forcedResult === null || state.forcedResult === "victory") {
    return state;
  }
  const withoutForced = { ...state, forcedResult: null };
  const naturalResult = evaluateBattleResult(withoutForced, battleInit).result;
  if (naturalResult === state.forcedResult) {
    return state;
  }
  // A state edit undid the condition that justified the forced defeat/draw.
  // Drop the forced flag inline so the outer `applyBattleResult` can
  // recompute the live result in the same history commit.
  return withoutForced;
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

function mergeTransitions(
  left: BattleTransitionData,
  right: BattleTransitionData,
): BattleTransitionData {
  return {
    steps: [...left.steps, ...right.steps],
    energyChanges: [...left.energyChanges, ...right.energyChanges],
    judgment: right.judgment ?? left.judgment,
    scoreChanges: [...left.scoreChanges, ...right.scoreChanges],
    resultChange: right.resultChange ?? left.resultChange,
    aiChoices: [...left.aiChoices, ...right.aiChoices],
    logEvents: [...left.logEvents, ...right.logEvents],
  };
}

// `createReducerTransition` imported from ./transition (bug-016).
