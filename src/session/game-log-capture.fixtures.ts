// Game ids, limits, and capture helpers the game log capture tests share.

import { getLogEntries } from "../logging";
import { parseGameId, type GameId } from "../types/identifiers";
import {
  createGameLogCapture,
  type GameLogCapture,
  type GameLogLimits,
} from "./game-log-capture";
import type { GameRepository } from "./game-repository";

export const GAME_A = parseGameId("gamea1");
export const GAME_B = parseGameId("gameb2");
export const GAME_C = parseGameId("gamec3");
export const UNCAPPED = 1_000_000;
export const LIMITS: GameLogLimits = {
  maxStoredCharacters: UNCAPPED,
  trimRetainedFraction: 1,
  retryInitialDelayMs: 10,
  retryBackoffFactor: 2,
  retryMaxDelayMs: 40,
  maxRetries: 3,
};

export function record(index: number): Record<string, unknown> {
  return { event: "fixture_event", seq: index, gameId: GAME_A, index };
}

export function captureAt(
  repository: GameRepository,
  gameId: GameId,
  maxStoredCharacters: number,
  clock: { now: number },
  limits: Partial<GameLogLimits> = {},
): GameLogCapture {
  return createGameLogCapture(repository, gameId, {
    ...LIMITS,
    ...limits,
    maxStoredCharacters,
    now: () => clock.now,
  });
}

export const reported = (event: string): Array<Record<string, unknown>> =>
  getLogEntries().filter((entry) => entry.event === event);

