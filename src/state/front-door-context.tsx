import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useActions, useGameState } from "../session/hooks";
import type { BattleFoldState, FrontDoorState } from "../rules/fold-state";
import type { BeginTutorialOptions, TutorialAction } from "../types/tutorial";
import type {
  BattleId,
  FrontDoorActionId,
  JourneyId,
  TutorialActionId,
  TutorialRunId,
} from "../types/identifiers";

export interface FrontDoorMutations {
  action: (
    surface: "main" | "tutorial",
    actionId: FrontDoorActionId,
    detail?: unknown,
  ) => Promise<number>;
  advance: (
    from: "mainExiting" | "loading",
    journeyId: JourneyId,
  ) => Promise<number>;
  beginTutorial: (
    actions: readonly TutorialAction[],
    options?: BeginTutorialOptions,
  ) => Promise<number>;
  completeTutorialAction: (
    runId: TutorialRunId,
    actionId: TutorialActionId,
  ) => Promise<number>;
  beginTutorialBattle?: (tutorialRunId: TutorialRunId) => Promise<number>;
  restartTutorialBattle?: (battleId: BattleId) => Promise<number>;
  exitTutorialBattle?: (battleId: BattleId) => Promise<number>;
}

export interface FrontDoorContextValue {
  state: FrontDoorState;
  battle?: BattleFoldState | null;
  mutations: FrontDoorMutations;
}

const FrontDoorContext = createContext<FrontDoorContextValue | null>(null);

/** Exposes the game fold through the state boundary used by UI adapters. */
export function FrontDoorProvider({ children }: { children: ReactNode }) {
  const gameState = useGameState();
  const { frontDoor } = gameState;
  const actions = useActions();
  const mutations = useMemo<FrontDoorMutations>(
    () => ({
      action: actions.frontDoorAction,
      advance: actions.advanceFrontDoor,
      beginTutorial: actions.beginTutorial,
      completeTutorialAction: actions.completeTutorialAction,
      beginTutorialBattle: actions.beginTutorialBattle,
      restartTutorialBattle: actions.restartTutorialBattle,
      exitTutorialBattle: actions.exitTutorialBattle,
    }),
    [actions],
  );
  const value = useMemo<FrontDoorContextValue>(
    () => ({
      state: frontDoor,
      battle: gameState.battle,
      mutations,
    }),
    [frontDoor, gameState.battle, mutations],
  );

  return (
    <FrontDoorContext.Provider value={value}>
      {children}
    </FrontDoorContext.Provider>
  );
}

export function useFrontDoor(): FrontDoorContextValue {
  const value = useContext(FrontDoorContext);
  if (value === null) {
    throw new Error("useFrontDoor must be used within a FrontDoorProvider");
  }
  return value;
}
