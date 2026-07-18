import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useActions, useGameState } from "../coop/hooks";
import type { FrontDoorState } from "../rules/fold-state";

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
}

export interface FrontDoorContextValue {
  state: FrontDoorState;
  mutations: FrontDoorMutations;
}

const FrontDoorContext = createContext<FrontDoorContextValue | null>(null);

/** Exposes the room fold through the state boundary used by UI adapters. */
export function FrontDoorProvider({ children }: { children: ReactNode }) {
  const { frontDoor } = useGameState();
  const actions = useActions();
  const mutations = useMemo<FrontDoorMutations>(
    () => ({
      action: actions.frontDoorAction,
      advance: actions.advanceFrontDoor,
    }),
    [actions],
  );
  const value = useMemo<FrontDoorContextValue>(
    () => ({ state: frontDoor, mutations }),
    [frontDoor, mutations],
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
