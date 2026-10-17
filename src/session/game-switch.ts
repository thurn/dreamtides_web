// Player-invoked switches from the open local game to another one: a new
// Dreamtides 97 run, or the most recently played stored run. The game
// selection (`useLocalGame`) supplies them beside the game's own controls;
// the main menu reads them with `useGameSwitch`, which is null outside a game.

import { createContext, useContext } from "react";
import { genesisMode, type GameMode } from "../eventlog/types";
import { logEvent } from "../logging";
import type { GameId } from "../types/identifiers";
import {
  UnreadableLocalGameError,
  type GameRepository,
} from "./game-repository";

/** A request to leave the open game for another one. */
export type LocalGameRequest =
  | { readonly kind: "create"; readonly mode: GameMode }
  | { readonly kind: "open"; readonly gameId: GameId };

/** Where a switch was invoked, for logs. */
export interface GameSwitchSource {
  readonly source: "main_menu";
}

export interface GameSwitchControls {
  /** Create a new D97 game and switch this tab to it. */
  startD97Run: (source: GameSwitchSource) => void;
  /** Switch this tab to the stored D97 game `gameId`. */
  continueD97Run: (source: GameSwitchSource, gameId: GameId) => void;
  /** The most recently played stored D97 game, or null when there is none. */
  findRecentD97Run: () => Promise<GameId | null>;
}

export const GameSwitchContext = createContext<GameSwitchControls | null>(null);

/** The open game's switch controls, or null outside a game. */
export function useGameSwitch(): GameSwitchControls | null {
  return useContext(GameSwitchContext);
}

/**
 * The most recently played stored game of `mode`, or null when there is none.
 * A game whose records do not decode is skipped.
 */
export async function findRecentGameOfMode(
  repository: GameRepository,
  mode: GameMode,
): Promise<GameId | null> {
  for (const summary of await repository.listGames()) {
    let stored;
    try {
      stored = await repository.readGame(summary.gameId);
    } catch (error) {
      if (error instanceof UnreadableLocalGameError) continue;
      throw error;
    }
    if (stored !== null && genesisMode(stored.genesis) === mode) {
      return summary.gameId;
    }
  }
  return null;
}

/**
 * The switch controls of the open game `gameId`. `requestGame` asks the game
 * selection to create or open the requested game in place of this one.
 */
export function createGameSwitchControls(
  gameId: GameId,
  repository: GameRepository,
  requestGame: (request: LocalGameRequest) => void,
): GameSwitchControls {
  return {
    startD97Run(source) {
      logEvent("d97_new_run_requested", { ...source, fromGameId: gameId });
      requestGame({ kind: "create", mode: "d97" });
    },
    continueD97Run(source, runGameId) {
      logEvent("d97_continue_requested", {
        ...source,
        fromGameId: gameId,
        runGameId,
      });
      requestGame({ kind: "open", gameId: runGameId });
    },
    findRecentD97Run: () => findRecentGameOfMode(repository, "d97"),
  };
}
