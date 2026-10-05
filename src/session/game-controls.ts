// Player-invoked controls for the open local game: export its journey log,
// recover it from storage, and leave it for a new game. `LocalGameProvider`
// supplies them; the error fallback and the game menu read them with
// `useLocalGameControls`, which is null outside a game.

import { createContext, useContext } from "react";
import { downloadJsonl, logEvent } from "../logging";
import type { FoldState } from "../rules/fold-state";
import type { GameId } from "../types/identifiers";
import { readGameLog, type GameLogCapture } from "./game-log-capture";
import type { GameRepository } from "./game-repository";
import type { LocalGame } from "./local-game";

/** Where a control was invoked, for logs. */
export interface LocalGameControlSource {
  source: "error_boundary" | "game_menu";
  /** The error boundary's scope, when invoked from its fallback. */
  scope?: string;
}

export interface LocalGameControls {
  /** Download the game's stored journey log as JSONL; resolves its line count. */
  exportLog: (source: LocalGameControlSource) => Promise<number>;
  /**
   * Reload the game from storage: its latest valid checkpoint and the events
   * after it.
   */
  recover: (source: LocalGameControlSource) => Promise<void>;
  /**
   * Create a new local game and switch this tab to it. This game stays stored,
   * so its `?game=` URL reopens it.
   */
  startNewGame: (source: LocalGameControlSource) => void;
}

export const LocalGameControlsContext = createContext<LocalGameControls | null>(
  null,
);

/** The open game's controls, or null outside a game. */
export function useLocalGameControls(): LocalGameControls | null {
  return useContext(LocalGameControlsContext);
}

/** The export file name for `gameId`'s log written at `at`. */
export function gameLogFileName(gameId: GameId, at: Date): string {
  return `journey-log-${gameId}-${at.toISOString().replace(/[:.]/g, "-")}.jsonl`;
}

/**
 * The controls for `game`. `requestNewGame` asks the game selection to create
 * and open a new game in place of this one.
 */
export function createLocalGameControls(
  game: LocalGame<FoldState>,
  repository: GameRepository,
  logCapture: GameLogCapture,
  requestNewGame: () => void,
): LocalGameControls {
  const { gameId } = game;
  return {
    async exportLog(source) {
      logEvent("game_log_exported", { ...source, head: game.log.head() });
      const lines = await readGameLog(repository, logCapture);
      downloadJsonl(gameLogFileName(gameId, new Date()), lines);
      return lines.length;
    },
    async recover(source) {
      logEvent("local_game_recovery_requested", {
        ...source,
        head: game.log.head(),
      });
      await game.close();
      await logCapture.flush();
      const url = new URL(window.location.href);
      url.searchParams.set("game", gameId);
      window.location.assign(url.toString());
    },
    startNewGame(source) {
      logEvent("local_game_new_requested", {
        ...source,
        head: game.log.head(),
      });
      requestNewGame();
    },
  };
}
