// Selects the local game the app plays. `?game=<id>` opens that game from
// storage. Without it, the front door resumes this browser's most recently
// played game when asked to (`resumeRecent`), and otherwise creates a new game;
// "create game" requests always create one. A created or resumed game's id
// replaces the URL's `?game=` in place, without a new history entry, so a
// reload reopens it and Back and Forward never disagree with the game shown.
// A game opens only in the tab that holds its lock (see `game-lock.ts`);
// another tab on it reports `openElsewhere`, and a front-door resume of it
// creates a new game instead. The open game's journey log is captured into
// storage; closing the game writes its last events and log lines before the
// lock is released.

import { useCallback, useEffect, useRef, useState } from "react";
import { GAME_LOGS } from "../content/game-logs";
import { generateGameId, mintClientId } from "../eventlog/game-id";
import {
  genesisMode,
  type GameMode,
  type PinnedContentConfig,
  type StoredContentConfig,
} from "../eventlog/types";
import { logEvent } from "../logging";
import type { FoldState } from "../rules/fold-state";
import { GAME_ENGINE_CONFIG } from "../rules/replay/replay";
import type { GameId } from "../types/identifiers";
import { browserGameRepository } from "./browser-repository";
import { d97SnapshotCodec, needsD97Rebase, rebaseD97Game } from "./d97-save";
import {
  createLocalGameControls,
  type LocalGameControls,
} from "./game-controls";
import { attachGameLog, type LocalGameSelection } from "./game-log";
import {
  createGameSwitchControls,
  type GameSwitchControls,
  type LocalGameRequest,
} from "./game-switch";
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
      /** The game's mode, from its genesis. */
      mode: GameMode;
      controls: LocalGameControls;
      gameSwitch: GameSwitchControls;
    }
  | { kind: "notFound"; gameId: GameId }
  | { kind: "openElsewhere"; gameId: GameId }
  | { kind: "unreadable"; gameId: GameId }
  | { kind: "versionGate" }
  | {
      kind: "configGate";
      gameContentConfig: StoredContentConfig | undefined;
    }
  | { kind: "error"; message: string };

export interface UseLocalGameInput {
  /** The `?game=` id, or null to resume or create a game. */
  gameId: GameId | null;
  /**
   * Without a `gameId`, resume the most recently played stored game this build
   * can play, creating a new game only when there is none.
   */
  resumeRecent?: boolean;
  /** This build's fold-relevant content configuration. */
  contentConfig: PinnedContentConfig;
  /** Front-door scene for a newly created game. */
  frontDoorEntry?: FrontDoorEntry;
  /** Mode of a game this hook creates without an explicit request. */
  newGameMode?: GameMode;
  /**
   * The URL's `?seed=<n>`: the game this hook creates on load takes a seed
   * derived from it (see `createFreshGenesis`). A game created through
   * `createNewGame` always draws a fresh seed.
   */
  seedOverride?: number | null;
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

/** Callbacks an opened game's controls use to switch this tab's game. */
interface GameSwitch {
  readonly requestNewGame: () => void;
  readonly requestGame: (request: LocalGameRequest) => void;
}

/** Attempts at drawing an unused game id before giving up. */
const CREATE_GAME_MAX_ATTEMPTS = 3;

function persistOptions(gameId: GameId, mode: GameMode): LocalGameOptions<FoldState> {
  return {
    // D97 games write a versioned snapshot after every applied event (P5).
    ...(mode === "d97" ? { snapshots: d97SnapshotCodec() } : {}),
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
  gameSwitch: GameSwitch,
): OpenedGame {
  const logCapture = createGameLogCapture(repository, game.gameId, GAME_LOGS);
  return {
    kind: "ready",
    game,
    status: {
      kind: "ready",
      game,
      mode: genesisMode(game.genesis),
      controls: createLocalGameControls(
        game,
        repository,
        logCapture,
        gameSwitch.requestNewGame,
      ),
      gameSwitch: createGameSwitchControls(
        game.gameId,
        repository,
        gameSwitch.requestGame,
      ),
    },
    lock,
    logCapture,
    selection,
  };
}

async function openGame(
  repository: GameRepository,
  locks: GameLockManager | undefined,
  gameId: GameId,
  contentConfig: PinnedContentConfig,
  gameSwitch: GameSwitch,
  selection: Exclude<LocalGameSelection, "created"> = "opened",
): Promise<OpenResult> {
  try {
    const stored = await repository.readGame(gameId);
    if (stored === null) return { kind: "notFound", gameId };
    const mode = genesisMode(stored.genesis);
    // D97 games never meet the content gate: a changed build rebases them (P5).
    const compatibility = mode === "d97" ? "ready" : genesisCompatibility(stored.genesis, contentConfig);
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
      if (mode === "d97" && needsD97Rebase(stored, contentConfig)) {
        await rebaseD97Game(repository, stored, contentConfig);
      }
      const game = await openLocalGame(
        repository,
        GAME_ENGINE_CONFIG,
        gameId,
        persistOptions(gameId, mode),
      );
      if (game !== null) {
        return opened(repository, game, lock, selection, gameSwitch);
      }
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
  gameSwitch: GameSwitch,
  seedOverride: number | null,
  mode: GameMode,
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
      const genesis = createFreshGenesis(
        contentConfig,
        frontDoorEntry,
        seedOverride,
        mode,
      );
      const game = await createLocalGame<FoldState>(
        repository,
        GAME_ENGINE_CONFIG,
        { gameId, genesis, localPlayerId: mintClientId() },
        persistOptions(gameId, mode),
      );
      replaceGameInUrl(gameId);
      return opened(repository, game, lock, "created", gameSwitch);
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
  gameSwitch: GameSwitch,
  seedOverride: number | null,
  mode: GameMode,
): Promise<OpenResult> {
  const [recent] = await repository.listGames();
  if (recent !== undefined) {
    const result = await openGame(
      repository,
      locks,
      recent.gameId,
      contentConfig,
      gameSwitch,
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
  return createGame(
    repository,
    locks,
    contentConfig,
    frontDoorEntry,
    gameSwitch,
    seedOverride,
    mode,
  );
}

/** Point the current history entry's `?game=` at `gameId`. */
function replaceGameInUrl(gameId: GameId): void {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("game", gameId);
  window.history.replaceState(
    window.history.state,
    "",
    `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`,
  );
}

/**
 * Stop writing `opened`, flushing its events and then its journey log, and
 * give up its lock once both are done, so the next tab to open the game is
 * its only writer.
 */
function closeOpened(opened: OpenedGame): void {
  void opened.game
    .close()
    .finally(() => opened.logCapture.close())
    .finally(() => opened.lock.release());
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
  newGameMode = "journey",
  seedOverride = null,
  repository = browserGameRepository,
  locks = browserGameLockManager,
}: UseLocalGameInput): {
  status: LocalGameStatus;
  createNewGame: () => void;
} {
  // The newest player request to switch games, numbered so a repeated request
  // is a new key; null while the tab plays the game its URL selects.
  const [switchRequest, setSwitchRequest] = useState<
    (LocalGameRequest & { readonly serial: number }) | null
  >(null);
  const openRequestId =
    switchRequest?.kind === "open" ? switchRequest.gameId : null;
  const create =
    switchRequest?.kind === "create" ||
    (switchRequest === null && gameId === null && !resumeRecent);
  const createMode =
    switchRequest?.kind === "create" ? switchRequest.mode : newGameMode;
  const createFrontDoorEntry =
    switchRequest?.kind === "create" && switchRequest.frontDoorEntry !== undefined
      ? switchRequest.frontDoorEntry
      : frontDoorEntry;
  const requestKey =
    switchRequest !== null
      ? `${switchRequest.kind}:${String(switchRequest.serial)}`
      : create
        ? "create:0"
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

  const requestGame = useCallback((request: LocalGameRequest) => {
    setSwitchRequest((previous) => ({
      ...request,
      serial: (previous?.serial ?? 0) + 1,
    }));
  }, []);
  const createNewGame = useCallback(() => {
    requestGame({ kind: "create", mode: newGameMode });
  }, [newGameMode, requestGame]);

  useEffect(() => {
    if (requestRef.current?.key !== requestKey) {
      setStatus({ kind: create ? "creating" : "opening" });
      // Only the game the URL itself creates takes the URL's seed.
      const genesisSeedOverride = switchRequest === null ? seedOverride : null;
      const gameSwitch: GameSwitch = { requestNewGame: createNewGame, requestGame };
      requestRef.current = {
        key: requestKey,
        result: repository().then((loaded) =>
          create
            ? createGame(
                loaded,
                locks(),
                contentConfig,
                createFrontDoorEntry,
                gameSwitch,
                genesisSeedOverride,
                createMode,
              )
            : openRequestId !== null
              ? openGame(
                  loaded,
                  locks(),
                  openRequestId,
                  contentConfig,
                  gameSwitch,
                ).then((result) => {
                  if (result.kind === "ready") replaceGameInUrl(openRequestId);
                  return result;
                })
              : gameId === null
                ? resumeOrCreateGame(
                    loaded,
                    locks(),
                    contentConfig,
                    frontDoorEntry,
                    gameSwitch,
                    genesisSeedOverride,
                    newGameMode,
                  )
                : openGame(
                    loaded,
                    locks(),
                    gameId,
                    contentConfig,
                    gameSwitch,
                  ),
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
    createFrontDoorEntry,
    createMode,
    createNewGame,
    frontDoorEntry,
    gameId,
    locks,
    newGameMode,
    openRequestId,
    repository,
    requestGame,
    requestKey,
    resumeRecent,
    seedOverride,
    switchRequest,
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

  return { status, createNewGame };
}
