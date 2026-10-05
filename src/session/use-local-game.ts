// Selects the local game the app plays. `?game=<id>` opens that game from
// storage. Without it, the front door resumes this browser's most recently
// played game when asked to (`resumeRecent`), and otherwise creates a new game;
// "create game" requests always create one. A created or resumed game's id
// replaces the URL's `?game=` in place, without a new history entry, so a
// reload reopens it and Back and Forward never disagree with the game shown.
// A game opens only in the tab that holds its lock (see `game-lock.ts`);
// another tab on it reports `openElsewhere`, and a front-door resume of it
// creates a new game instead. The open game's journey log is captured into
// storage.

import { useCallback, useEffect, useRef, useState } from "react";
import { GAME_LOGS } from "../content/game-logs";
import { generateGameId, mintClientId } from "../eventlog/game-id";
import type { ContentConfig, PinnedContentConfig } from "../eventlog/types";
import { logEvent } from "../logging";
import type { FoldState } from "../rules/fold-state";
import { GAME_ENGINE_CONFIG } from "../rules/replay/replay";
import type { RoomId } from "../types/identifiers";
import { browserGameRepository } from "./browser-repository";
import {
  createLocalGameControls,
  type LocalGameControls,
} from "./game-controls";
import { attachGameLog, type LocalGameSelection } from "./game-log";
import { createGameLogCapture, type GameLogCapture } from "./game-log-capture";
import {
  acquireGameLock,
  browserGameLockManager,
  type GameLock,
  type GameLockManager,
} from "./game-lock";
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
  | {
      kind: "ready";
      game: LocalGame<FoldState>;
      controls: LocalGameControls;
    }
  | { kind: "notFound"; gameId: RoomId }
  | { kind: "openElsewhere"; gameId: RoomId }
  | { kind: "unreadable"; gameId: RoomId }
  | { kind: "versionGate" }
  | { kind: "configGate"; gameContentConfig: ContentConfig | undefined }
  | { kind: "error"; message: string };

export interface UseLocalGameInput {
  /** The `?game=` id, or null to resume or create a game. */
  gameId: RoomId | null;
  /**
   * Without a `gameId`, resume the most recently played stored game this build
   * can play, creating a new game only when there is none.
   */
  resumeRecent?: boolean;
  /** This build's fold-relevant content configuration. */
  contentConfig: PinnedContentConfig;
  /** Front-door scene for a newly created game. */
  frontDoorEntry?: FrontDoorEntry;
  /** Defaults to this browser's repository. */
  repository?: () => Promise<GameRepository>;
  /** Defaults to this browser's Web Locks, where available. */
  locks?: () => GameLockManager | undefined;
}

/** An opened game with what this tab holds for it until it closes. */
interface OpenedGame {
  kind: "ready";
  game: LocalGame<FoldState>;
  /** The game's one ready status, so re-reporting it is a no-op. */
  status: Extract<LocalGameStatus, { kind: "ready" }>;
  lock: GameLock;
  logCapture: GameLogCapture;
  selection: LocalGameSelection;
}

type OpenResult = Exclude<LocalGameStatus, { kind: "ready" }> | OpenedGame;

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

function opened(
  repository: GameRepository,
  game: LocalGame<FoldState>,
  lock: GameLock,
  selection: LocalGameSelection,
): OpenedGame {
  const logCapture = createGameLogCapture(repository, game.gameId, {
    maxStoredCharacters: GAME_LOGS.maxStoredCharacters,
  });
  return {
    kind: "ready",
    game,
    status: {
      kind: "ready",
      game,
      controls: createLocalGameControls(game, repository, logCapture),
    },
    lock,
    logCapture,
    selection,
  };
}

async function openGame(
  repository: GameRepository,
  locks: GameLockManager | undefined,
  gameId: RoomId,
  contentConfig: PinnedContentConfig,
  selection: Exclude<LocalGameSelection, "created"> = "opened",
): Promise<OpenResult> {
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
    const lock = await acquireGameLock(gameId, locks);
    if (lock === null) {
      logEvent("local_game_open_elsewhere", { gameId });
      return { kind: "openElsewhere", gameId };
    }
    try {
      const game = await openLocalGame(
        repository,
        GAME_ENGINE_CONFIG,
        gameId,
        persistOptions(gameId),
      );
      if (game !== null) return opened(repository, game, lock, selection);
      lock.release();
      return { kind: "notFound", gameId };
    } catch (error) {
      lock.release();
      throw error;
    }
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
  locks: GameLockManager | undefined,
  contentConfig: PinnedContentConfig,
  frontDoorEntry: FrontDoorEntry | undefined,
): Promise<OpenResult> {
  for (let attempt = 0; attempt < CREATE_GAME_MAX_ATTEMPTS; attempt += 1) {
    const gameId = generateGameId();
    const lock = await acquireGameLock(gameId, locks);
    if (lock === null) continue;
    try {
      if ((await repository.readGame(gameId)) !== null) {
        lock.release();
        continue;
      }
      const genesis = createFreshGenesis(contentConfig, frontDoorEntry);
      const game = await createLocalGame<FoldState>(
        repository,
        GAME_ENGINE_CONFIG,
        { gameId, genesis, localPlayerId: mintClientId() },
        persistOptions(gameId),
      );
      replaceGameInUrl(gameId);
      return opened(repository, game, lock, "created");
    } catch (error) {
      lock.release();
      throw error;
    }
  }
  throw new Error("Could not draw an unused game id.");
}

/**
 * Opens the most recently played stored game, or creates a new game when there
 * is none or it cannot be played here (unreadable, pinned to other content, or
 * open in another tab).
 */
async function resumeOrCreateGame(
  repository: GameRepository,
  locks: GameLockManager | undefined,
  contentConfig: PinnedContentConfig,
  frontDoorEntry: FrontDoorEntry | undefined,
): Promise<OpenResult> {
  const [recent] = await repository.listGames();
  if (recent !== undefined) {
    const result = await openGame(
      repository,
      locks,
      recent.gameId,
      contentConfig,
      "resumed",
    );
    if (result.kind === "ready") {
      replaceGameInUrl(recent.gameId);
      return result;
    }
    logEvent("local_game_resume_skipped", {
      gameId: recent.gameId,
      reason: result.kind,
    });
  }
  return createGame(repository, locks, contentConfig, frontDoorEntry);
}

/** Point the current history entry's `?game=` at `gameId`. */
function replaceGameInUrl(gameId: RoomId): void {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("game", gameId);
  window.history.replaceState(
    window.history.state,
    "",
    `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`,
  );
}

/** Stop writing `opened` and give up its lock. */
function closeOpened(opened: OpenedGame): void {
  void opened.game.close().finally(() => opened.lock.release());
}

/**
 * Opens, resumes, or creates the local game and reports its status. The ready game is
 * logged (see `attachGameLog`) and its journey log captured from before it
 * first renders until another game replaces it or the hook unmounts; until
 * then this tab holds its lock.
 */
export function useLocalGame({
  gameId,
  resumeRecent = false,
  contentConfig,
  frontDoorEntry,
  repository = browserGameRepository,
  locks = browserGameLockManager,
}: UseLocalGameInput): {
  status: LocalGameStatus;
  createNewGame: () => void;
} {
  const [createRequests, setCreateRequests] = useState(0);
  const create = createRequests > 0 || (gameId === null && !resumeRecent);
  const requestKey = create
    ? `create:${createRequests}`
    : gameId === null
      ? "resume"
      : `open:${gameId}`;
  const [status, setStatus] = useState<LocalGameStatus>({
    kind: create ? "creating" : "opening",
  });
  // One request per key, shared by StrictMode's repeated effects so a game is
  // created or opened once.
  const requestRef = useRef<{
    key: string;
    result: Promise<OpenResult>;
  } | null>(null);
  const activeRef = useRef<{
    opened: OpenedGame;
    detachLog: () => void;
  } | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (requestRef.current?.key !== requestKey) {
      setStatus({ kind: create ? "creating" : "opening" });
      requestRef.current = {
        key: requestKey,
        result: repository().then((loaded) =>
          create
            ? createGame(loaded, locks(), contentConfig, frontDoorEntry)
            : gameId === null
              ? resumeOrCreateGame(
                  loaded,
                  locks(),
                  contentConfig,
                  frontDoorEntry,
                )
              : openGame(loaded, locks(), gameId, contentConfig),
        ),
      };
    }
    const request = requestRef.current;
    let cancelled = false;
    request.result.then(
      (next) => {
        if (cancelled) {
          // A game opened for a superseded request, or after unmounting, is
          // never shown; release it.
          if (
            next.kind === "ready" &&
            (requestRef.current !== request || !mountedRef.current) &&
            activeRef.current?.opened !== next
          ) {
            closeOpened(next);
          }
          return;
        }
        if (next.kind !== "ready") {
          setStatus(next);
          return;
        }
        if (activeRef.current?.opened !== next) {
          const previous = activeRef.current;
          if (previous !== null) {
            previous.detachLog();
            closeOpened(previous.opened);
          }
          activeRef.current = {
            opened: next,
            detachLog: attachGameLog(next.game, {
              capture: next.logCapture.capture,
              selection: next.selection,
            }),
          };
        }
        setStatus(next.status);
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
  }, [
    contentConfig,
    create,
    frontDoorEntry,
    gameId,
    locks,
    repository,
    requestKey,
    resumeRecent,
  ]);

  // Unmounting closes the game and frees its lock for another tab.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const active = activeRef.current;
      if (active === null) return;
      activeRef.current = null;
      requestRef.current = null;
      active.detachLog();
      closeOpened(active.opened);
    };
  }, []);

  const createNewGame = useCallback(() => {
    setCreateRequests((count) => count + 1);
  }, []);

  return { status, createNewGame };
}
