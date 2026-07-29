import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useActions, useClientId, useGameState } from "../coop/hooks";
import type { BattleFoldState, FrontDoorState } from "../rules/fold-state";
import type { BeginTutorialOptions, TutorialAction } from "../types/tutorial";

export interface FrontDoorMutations {
  action: (
    surface: "main" | "tutorial",
    actionId: string,
    detail?: unknown,
  ) => Promise<number>;
  advance: (
    from: "mainExiting" | "loading",
    journeyId: string,
  ) => Promise<number>;
  beginTutorial: (
    actions: readonly TutorialAction[],
    options?: BeginTutorialOptions,
  ) => Promise<number>;
  completeTutorialAction: (runId: string, actionId: string) => Promise<number>;
  beginTutorialBattle?: (tutorialRunId: string) => Promise<number>;
  restartTutorialBattle?: (battleId: string) => Promise<number>;
  exitTutorialBattle?: (battleId: string) => Promise<number>;
}

export interface FrontDoorContextValue {
  state: FrontDoorState;
  battle?: BattleFoldState | null;
  mutations: FrontDoorMutations;
  isCurrentPlaytestController: boolean;
}

const FrontDoorContext = createContext<FrontDoorContextValue | null>(null);

/** Exposes the room fold through the state boundary used by UI adapters. */
export function FrontDoorProvider({ children }: { children: ReactNode }) {
  const gameState = useGameState();
  const { frontDoor } = gameState;
  const actions = useActions();
  const clientId = useClientId();
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
      isCurrentPlaytestController:
        gameState.playtestControl?.controllerClientId === clientId,
    }),
    [
      clientId,
      frontDoor,
      gameState.battle,
      gameState.playtestControl?.controllerClientId,
      mutations,
    ],
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
