import {
  createEndTurnHistoryMetadata,
  createMoveCardHistoryMetadata,
  createPlayCardHistoryMetadata,
  createRecomputeResultHistoryMetadata,
  createRunAiTurnHistoryMetadata,
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
  createEmptyTransitionData,
  evaluateBattleResult,
} from "../engine/result";
import {
  resolveMoveCard,
  resolvePlayCard,
  resolvePlayCardToStack,
  resolveStackCardMove,
} from "../engine/play-card";
import { advanceAfterEndTurn, passBattlePhase } from "../engine/turn-flow";
import { runAiTurn } from "../ai/run-ai-turn";
import {
  selectBattleCardLocation,
  selectBattlefieldCardLocation,
  selectShouldEndTurnFromDay,
} from "./selectors";
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
    case "END_TURN": {
      const metadata = action.metadata ?? createEndTurnHistoryMetadata();
      const context = createEngineEmissionContext(metadata);
      return commitReducerTransition(
        state,
        metadata,
        (mutableState) => endTurnWithAiFollowup(mutableState, battleInit, context),
      );
    }
    case "PASS_PHASE": {
      const context = createEngineEmissionContext(action.metadata);
      return commitReducerTransition(
        state,
        action.metadata,
        (mutableState) => passPhaseWithAiFollowup(mutableState, battleInit, context),
      );
    }
    case "RUN_AI_TURN": {
      // bug-070 / spec §H-15 still applies: the bootstrap dispatch in
      // `use-ai-turn-driver.ts` is the only legal standalone caller, and it
      // already short-circuits when `battleInit.enableAi` is false. The
      // reducer-side guard here is defence-in-depth so any future caller that
      // forgets the gate cannot resurrect heuristic moves at the reducer
      // layer.
      if (!battleInit.enableAi) {
        return state;
      }
      const metadata = createRunAiTurnHistoryMetadata();
      return commitReducerTransition(
        state,
        metadata,
        (mutableState) => runAiTurn(mutableState, battleInit),
      );
    }
    case "PLAY_CARD": {
      const metadata = action.metadata
        ?? createPlayCardHistoryMetadata(state.mutable, action.battleCardId);
      const context = createEngineEmissionContext(metadata);
      return commitGameplayTransition(
        state,
        metadata,
        (mutableState) => {
          // Spec E-16/H-1/H-16: player card play must never be blocked for
          // affordability, timing, or active side. `resolvePlayCard` owns
          // zone validation for hand plays and Reclaim plays from void, then
          // emits a rejection log on any other mismatch (bug-048). The UI
          // layer blocks further plays after victory via the reward surface;
          // defeat and draw remain editable by spec.
          const card = mutableState.cardInstances[action.battleCardId];
          const location = selectBattleCardLocation(mutableState, action.battleCardId);

          if (
            card === undefined ||
            location === null
          ) {
            return {
              state: mutableState,
              transition: createEmptyTransitionData(),
            };
          }

          return resolvePlayCard(mutableState, action.battleCardId, action.target, context);
        },
        battleInit,
        context,
      );
    }
    case "PLAY_CARD_TO_STACK": {
      const context = createEngineEmissionContext(action.metadata);
      return commitGameplayTransition(
        state,
        action.metadata,
        (mutableState) => resolvePlayCardToStack(mutableState, action.battleCardId, context),
        battleInit,
        context,
      );
    }
    case "MOVE_STACK_CARD": {
      const context = createEngineEmissionContext(action.metadata);
      return commitGameplayTransition(
        state,
        action.metadata,
        (mutableState) => resolveStackCardMove(mutableState, action.battleCardId, action.target, context),
        battleInit,
        context,
      );
    }
    case "MOVE_CARD": {
      const metadata = action.metadata
        ?? createMoveCardHistoryMetadata(state.mutable, action.battleCardId, action.target);
      const context = createEngineEmissionContext(metadata);
      return commitGameplayTransition(
        state,
        metadata,
        (mutableState) => {
          // Spec H-1: debug operations can edit both player and opponent
          // state, so battlefield MOVE_CARD is permitted regardless of the
          // active side or current phase. Validity is handled inside
          // `resolveMoveCard` (valid slot address, same-side move, etc.).
          const location = selectBattlefieldCardLocation(mutableState, action.battleCardId);

          if (location === null) {
            return {
              state: mutableState,
              transition: createEmptyTransitionData(),
            };
          }

          return resolveMoveCard(mutableState, action.battleCardId, action.target, context);
        },
        battleInit,
        context,
      );
    }
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

function endTurnWithAiFollowup(
  state: BattleMutableState,
  battleInit: Pick<
    BattleInit,
    "enableAi" | "maxEnergyCap" | "playerDrawSkipsTurnOne" | "scoreToWin" | "turnLimit"
  >,
  context: BattleEngineEmissionContext,
): {
  state: BattleMutableState;
  transition: BattleTransitionData;
} {
  const afterEndTurn = advanceAfterEndTurn(state, battleInit, context);
  if (
    afterEndTurn.state === state ||
    afterEndTurn.state.result !== null ||
    afterEndTurn.state.activeSide !== "enemy" ||
    afterEndTurn.state.phase !== "day" ||
    !battleInit.enableAi
  ) {
    // When `enableAi` is false the enemy's main phase is left intact for the
    // player to drive via debug commands; a subsequent player-issued END_TURN
    // composite will advance the flow back to the player.
    return afterEndTurn;
  }

  const aiTurn = runAiTurn(afterEndTurn.state, battleInit);
  return {
    state: aiTurn.state,
    transition: mergeTransitions(afterEndTurn.transition, aiTurn.transition),
  };
}

function passPhaseWithAiFollowup(
  state: BattleMutableState,
  battleInit: Pick<
    BattleInit,
    "enableAi" | "maxEnergyCap" | "playerDrawSkipsTurnOne" | "scoreToWin" | "turnLimit"
  >,
  context: BattleEngineEmissionContext,
): {
  state: BattleMutableState;
  transition: BattleTransitionData;
} {
  if (selectShouldEndTurnFromDay(state)) {
    return endTurnWithAiFollowup(state, battleInit, context);
  }

  const advanced = passBattlePhase(state, battleInit, context);
  if (
    advanced.state === state ||
    advanced.state.result !== null ||
    advanced.state.activeSide !== "enemy" ||
    advanced.state.phase !== "day" ||
    !battleInit.enableAi
  ) {
    return advanced;
  }

  const aiTurn = runAiTurn(advanced.state, battleInit);
  return {
    state: aiTurn.state,
    transition: mergeTransitions(advanced.transition, aiTurn.transition),
  };
}

// `createReducerTransition` imported from ./transition (bug-016).
