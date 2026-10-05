// Selects the local game the app plays. `?game=<id>` resumes that game from
// storage; without it, or on request, a new game is created and the URL gains
// its `?game=` id so a reload resumes it.

import { useCallback, useEffect, useRef, useState } from "react";
import { generateRoomId, mintClientId } from "../eventlog/game-id";
import type { ContentConfig, PinnedContentConfig } from "../eventlog/types";
import { logEvent } from "../logging";
import type { FoldState } from "../rules/fold-state";
import { GAME_ENGINE_CONFIG } from "../rules/replay/replay";
import type { RoomId } from "../types/identifiers";
import { browserGameRepository } from "./browser-repository";
import { attachGameLog } from "./game-log";
import {
  UnreadableLocalGameError,
  type GameRepository,
} from "./game-repository";
import {
  createFreshGenesis,
  genesisCompatibility,
  type FrontDoorEntry,
} from "./genesis";
import {
  createLocalGame,
  openLocalGame,
  type LocalGame,
  type LocalGameOptions,
} from "./local-game";

export type LocalGameStatus =
  | { kind: "opening" }
  | { kind: "creating" }
  | { kind: "ready"; game: LocalGame<FoldState> }
  | { kind: "notFound"; gameId: RoomId }
  | { kind: "unreadable"; gameId: RoomId }
  | { kind: "versionGate" }
  | { kind: "configGate"; gameContentConfig: ContentConfig | undefined }
  | { kind: "error"; message: string };

export interface UseLocalGameInput {
  /** The `?game=` id, or null to create a new game. */
  gameId: RoomId | null;
  /** This build's fold-relevant content configuration. */
  contentConfig: PinnedContentConfig;
  /** Front-door scene for a newly created game. */
  frontDoorEntry?: FrontDoorEntry;
  /** Defaults to this browser's repository. */
  repository?: () => Promise<GameRepository>;
}

/** Attempts at drawing an unused game id before giving up. */
const CREATE_GAME_MAX_ATTEMPTS = 3;

function persistOptions(gameId: RoomId): LocalGameOptions {
  return {
    onPersistError: (error) => {
      logEvent("local_game_persist_failed", {
        gameId,
        message: error instanceof Error ? error.message : String(error),
      });
    },
  };
}

async function openGame(
  repository: GameRepository,
  gameId: RoomId,
  contentConfig: PinnedContentConfig,
): Promise<LocalGameStatus> {
  try {
    const stored = await repository.readGame(gameId);
    if (stored === null) return { kind: "notFound", gameId };
    const compatibility = genesisCompatibility(stored.genesis, contentConfig);
    if (compatibility === "versionGate") return { kind: "versionGate" };
    if (compatibility === "configGate") {
      return {
        kind: "configGate",
        gameContentConfig: stored.genesis.contentConfig,
      };
    }
    const game = await openLocalGame(
      repository,
      GAME_ENGINE_CONFIG,
      gameId,
      persistOptions(gameId),
    );
    return game === null ? { kind: "notFound", gameId } : { kind: "ready", game };
  } catch (error) {
    if (error instanceof UnreadableLocalGameError) {
      logEvent("local_game_unreadable", { gameId, message: error.message });
      return { kind: "unreadable", gameId };
    }
    throw error;
  }
}

async function createGame(
  repository: GameRepository,
  contentConfig: PinnedContentConfig,
  frontDoorEntry: FrontDoorEntry | undefined,
): Promise<LocalGameStatus> {
  for (let attempt = 0; attempt < CREATE_GAME_MAX_ATTEMPTS; attempt += 1) {
    const gameId = generateRoomId();
    if ((await repository.readGame(gameId)) !== null) continue;
    const genesis = createFreshGenesis(contentConfig, frontDoorEntry);
    const game = await createLocalGame<FoldState>(
      repository,
      GAME_ENGINE_CONFIG,
      { gameId, genesis, localPlayerId: mintClientId() },
      persistOptions(gameId),
    );
    navigateToGame(gameId);
    return { kind: "ready", game };
  }
  throw new Error("Could not draw an unused game id.");
}

function navigateToGame(gameId: RoomId): void {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("game", gameId);
  window.history.pushState(
    null,
    "",
    `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`,
  );
}

/**
 * Opens or creates the local game and reports its status. The ready game is
 * logged (see `attachGameLog`) from before it first renders until another game
 * replaces it.
 */
export function useLocalGame({
  gameId,
  contentConfig,
  frontDoorEntry,
  repository = browserGameRepository,
}: UseLocalGameInput): {
  status: LocalGameStatus;
  createNewGame: () => void;
} {
  const [createRequests, setCreateRequests] = useState(0);
  const create = gameId === null || createRequests > 0;
  const requestKey = create ? `create:${createRequests}` : `open:${gameId}`;
  const [status, setStatus] = useState<LocalGameStatus>({
    kind: create ? "creating" : "opening",
  });
  // One request per key, shared by StrictMode's repeated effects so a game is
  // created or opened once.
  const requestRef = useRef<{
    key: string;
    status: Promise<LocalGameStatus>;
  } | null>(null);
  const activeRef = useRef<{
    game: LocalGame<FoldState>;
    detachLog: () => void;
  } | null>(null);

  useEffect(() => {
    if (requestRef.current?.key !== requestKey) {
      setStatus({ kind: create ? "creating" : "opening" });
      requestRef.current = {
        key: requestKey,
        status: repository().then((loaded) =>
          create || gameId === null
            ? createGame(loaded, contentConfig, frontDoorEntry)
            : openGame(loaded, gameId, contentConfig),
        ),
      };
    }
    let cancelled = false;
    requestRef.current.status.then(
      (next) => {
        if (cancelled) return;
        if (next.kind === "ready" && activeRef.current?.game !== next.game) {
          const previous = activeRef.current;
          if (previous !== null) {
            previous.detachLog();
            void previous.game.close();
          }
          activeRef.current = {
            game: next.game,
            detachLog: attachGameLog(next.game),
          };
        }
        setStatus(next);
      },
      (error: unknown) => {
        if (cancelled) return;
        setStatus({
          kind: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [contentConfig, create, frontDoorEntry, gameId, repository, requestKey]);

  const createNewGame = useCallback(() => {
    setCreateRequests((count) => count + 1);
  }, []);

  return { status, createNewGame };
}
