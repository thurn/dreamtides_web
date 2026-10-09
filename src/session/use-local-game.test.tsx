// @vitest-environment jsdom
// The game selection contract: without `?game=` exactly one game is created
// (StrictMode included) and the URL gains its id in place; the front door
// resumes the most recent playable game instead; with `?game=` that stored
// game resumes and its journey log is captured; unknown ids and games pinned
// to other content are gated; a game another tab holds is not opened; the open
// game's New Journey control switches to a created game and leaves the previous
// one resumable by its id. A game created from a `?seed=<n>` URL takes the seed
// derived from `n` under a fresh game id; a New Journey game draws a fresh seed.

import { act, StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PinnedContentConfig } from "../eventlog/types";
import { parseFoldHash } from "../types/content-hash";
import { parseClientId, parseGameId, type GameId } from "../types/identifiers";
import { createGameRepository, type GameRepository } from "./game-repository";
import { createFreshGenesis, journeySeedFromSeedOverride } from "./genesis";
import type { GameLockManager } from "./game-lock";
import { createMemoryKeyValueStore } from "./key-value-store";
import {
  useLocalGame,
  type LocalGameStatus,
} from "./use-local-game";

const HASH = parseFoldHash("a".repeat(64));
const CONTENT: PinnedContentConfig = {
  poolVariant: "tides4",
  atlasFoldHash: HASH,
  sitesFoldHash: HASH,
  draftFoldHash: HASH,
  cardRolesFoldHash: HASH,
  economyFoldHash: HASH,
  gambleFoldHash: HASH,
  transfigurationFoldHash: HASH,
  rewardSelectionFoldHash: HASH,
  auguryFoldHash: HASH,
  explorationFoldHash: HASH,
  tutorialFoldHash: HASH,
  opponentsFoldHash: HASH,
  defaultStartingEssence: 200,
  dreamsignCap: 12,
};

/** Exclusive `ifAvailable` locks shared by every "tab" in a test. */
function createFakeLockManager(): GameLockManager {
  const held = new Set<string>();
  return {
    request(name, _options, callback) {
      if (held.has(name)) return callback(null);
      held.add(name);
      return callback({ name }).finally(() => held.delete(name));
    },
  };
}

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

/** Mounts one "tab" selecting `gameId`; unmounting it closes the tab. */
async function openTab(
  repository: GameRepository,
  gameId: GameId | null,
  contentConfig: PinnedContentConfig = CONTENT,
  locks?: GameLockManager,
  resumeRecent = false,
  seedOverride: number | null = null,
): Promise<{ status: () => LocalGameStatus; close: () => Promise<void> }> {
  let latest: LocalGameStatus = { kind: "opening" };
  const loadRepository = () => Promise.resolve(repository);
  const lockManager = () => locks;
  function Probe(): ReactNode {
    latest = useLocalGame({
      gameId,
      resumeRecent,
      contentConfig,
      seedOverride,
      repository: loadRepository,
      locks: lockManager,
    }).status;
    return null;
  }
  const root = createRoot(document.createElement("div"));
  act(() => {
    root.render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );
  });
  await settle();
  return {
    status: () => latest,
    close: async () => {
      act(() => root.unmount());
      await settle();
    },
  };
}

async function selectGame(
  repository: GameRepository,
  gameId: GameId | null,
  contentConfig: PinnedContentConfig = CONTENT,
  resumeRecent = false,
): Promise<LocalGameStatus> {
  const tab = await openTab(
    repository,
    gameId,
    contentConfig,
    undefined,
    resumeRecent,
  );
  await tab.close();
  return tab.status();
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Store a game last written at `updatedAt`, pinned to `contentConfig`. */
async function storeGame(
  repository: GameRepository,
  gameId: GameId,
  updatedAt: number,
  contentConfig: PinnedContentConfig = CONTENT,
): Promise<GameId> {
  await repository.createGame(
    {
      gameId,
      localPlayerId: parseClientId("p1"),
      createdAt: updatedAt,
      updatedAt,
      head: 0,
    },
    createFreshGenesis(contentConfig, "main"),
  );
  return gameId;
}

const urlGameId = (): string | null =>
  new URL(window.location.href).searchParams.get("game");

const selections = async (
  repository: GameRepository,
  gameId: GameId,
): Promise<unknown[]> =>
  (await repository.readLogLines(gameId))
    .map((line) => JSON.parse(line) as { event: string; selection?: string })
    .filter((entry) => entry.event === "local_game_opened")
    .map((entry) => entry.selection);

describe("useLocalGame", () => {
  it("records a created game's id in the URL without a history entry", async () => {
    window.history.replaceState({ marker: 1 }, "", "/main?tutorialSpeed=2");
    const entries = window.history.length;
    const repository = createGameRepository(createMemoryKeyValueStore());
    const created = await selectGame(repository, null);
    expect(created.kind).toBe("ready");
    expect(window.history.length).toBe(entries);
    expect(window.history.state).toEqual({ marker: 1 });
    const url = new URL(window.location.href);
    expect(url.pathname).toBe("/main");
    expect(url.searchParams.get("tutorialSpeed")).toBe("2");
    expect(url.searchParams.get("game")).toBe(
      created.kind === "ready" ? created.game.gameId : null,
    );
  });

  it("resumes the most recent game at the front door instead of creating one", async () => {
    const repository = createGameRepository(createMemoryKeyValueStore());
    const older = await storeGame(repository, parseGameId("older1"), 1_000);
    const recent = await storeGame(repository, parseGameId("recent1"), 2_000);
    const entries = window.history.length;

    const resumed = await selectGame(repository, null, CONTENT, true);
    expect(resumed.kind === "ready" && resumed.game.gameId).toBe(recent);
    expect(urlGameId()).toBe(recent);
    expect(window.history.length).toBe(entries);
    expect((await repository.listGames()).map((g) => g.gameId).sort()).toEqual(
      [older, recent].sort(),
    );
    expect(await selections(repository, recent)).toEqual(["resumed"]);
  });

  it("creates a game at the front door when there is none to resume", async () => {
    const repository = createGameRepository(createMemoryKeyValueStore());
    const created = await selectGame(repository, null, CONTENT, true);
    expect(created.kind).toBe("ready");
    const games = await repository.listGames();
    expect(games).toHaveLength(1);
    expect(urlGameId()).toBe(games[0].gameId);
    expect(await selections(repository, games[0].gameId)).toEqual(["created"]);
  });

  it("creates a game at the front door when the recent game cannot be played here", async () => {
    const repository = createGameRepository(createMemoryKeyValueStore());
    const otherContent = {
      ...CONTENT,
      draftFoldHash: parseFoldHash("b".repeat(64)),
    };
    const pinned = await storeGame(
      repository,
      parseGameId("pinned1"),
      2_000,
      otherContent,
    );
    const created = await selectGame(repository, null, CONTENT, true);
    expect(created.kind).toBe("ready");
    expect(created.kind === "ready" && created.game.gameId).not.toBe(pinned);
    expect(await repository.listGames()).toHaveLength(2);

    const locks = createFakeLockManager();
    const holder = await openTab(repository, null, CONTENT, locks, true);
    const held = holder.status();
    const second = await openTab(repository, null, CONTENT, locks, true);
    const fresh = second.status();
    expect(fresh.kind).toBe("ready");
    expect(
      fresh.kind === "ready" && held.kind === "ready" && fresh.game.gameId,
    ).not.toBe(held.kind === "ready" ? held.game.gameId : null);
    await second.close();
    await holder.close();
  });

  it("creates one game, puts its id in the URL, and resumes it by id", async () => {
    const repository = createGameRepository(createMemoryKeyValueStore());
    const created = await selectGame(repository, null);
    expect(created.kind).toBe("ready");
    const games = await repository.listGames();
    expect(games).toHaveLength(1);
    const gameId = games[0].gameId;
    expect(new URL(window.location.href).searchParams.get("game")).toBe(gameId);

    const resumed = await selectGame(repository, gameId);
    expect(resumed.kind === "ready" && resumed.game.gameId).toBe(gameId);
    expect(resumed.kind === "ready" && resumed.game.localPlayerId).toBe(
      games[0].localPlayerId,
    );
    const logged = (await repository.readLogLines(gameId)).map(
      (line) => JSON.parse(line) as { event: string; gameId?: GameId },
    );
    expect(
      logged.filter((entry) => entry.event === "local_game_opened"),
    ).toEqual([
      expect.objectContaining({ gameId }),
      expect.objectContaining({ gameId }),
    ]);
  });

  it("opens a game in one tab at a time", async () => {
    const repository = createGameRepository(createMemoryKeyValueStore());
    const locks = createFakeLockManager();
    const creator = await openTab(repository, null, CONTENT, locks);
    expect(creator.status().kind).toBe("ready");
    const [{ gameId }] = await repository.listGames();

    const second = await openTab(repository, gameId, CONTENT, locks);
    expect(second.status()).toEqual({ kind: "openElsewhere", gameId });
    await second.close();

    await creator.close();
    const reopened = await openTab(repository, gameId, CONTENT, locks);
    expect(reopened.status().kind).toBe("ready");
    await reopened.close();
  });

  it("starts a new game from the open game's controls and keeps the old one resumable", async () => {
    const repository = createGameRepository(createMemoryKeyValueStore());
    const locks = createFakeLockManager();
    const previous = await storeGame(repository, parseGameId("previous1"), 1_000);
    window.history.replaceState(null, "", `/?game=${previous}`);
    const entries = window.history.length;

    const tab = await openTab(repository, previous, CONTENT, locks);
    const opened = tab.status();
    if (opened.kind !== "ready") throw new Error("expected a ready game");
    expect(opened.game.gameId).toBe(previous);

    act(() => opened.controls.startNewGame({ source: "game_menu" }));
    await settle();

    const switched = tab.status();
    if (switched.kind !== "ready") throw new Error("expected a ready game");
    const created = switched.game.gameId;
    expect(created).not.toBe(previous);
    expect(urlGameId()).toBe(created);
    expect(window.history.length).toBe(entries);
    expect((await repository.listGames()).map((g) => g.gameId).sort()).toEqual(
      [previous, created].sort(),
    );
    expect(await selections(repository, created)).toEqual(["created"]);

    const resumed = await openTab(repository, previous, CONTENT, locks);
    const reopened = resumed.status();
    expect(reopened.kind === "ready" && reopened.game.gameId).toBe(previous);
    await resumed.close();
    await tab.close();

    const previousLog = (await repository.readLogLines(previous)).map(
      (line) => JSON.parse(line) as { event: string; source?: string },
    );
    expect(previousLog).toContainEqual(
      expect.objectContaining({
        event: "local_game_new_requested",
        source: "game_menu",
        gameId: previous,
      }),
    );
  });

  it("derives a URL-created game's seed from the URL seed under a fresh game id", async () => {
    const repository = createGameRepository(createMemoryKeyValueStore());
    const locks = createFakeLockManager();
    const first = await openTab(repository, null, CONTENT, locks, false, 7);
    const firstStatus = first.status();
    await first.close();
    const second = await openTab(repository, null, CONTENT, locks, false, 7);
    const secondStatus = second.status();
    if (firstStatus.kind !== "ready" || secondStatus.kind !== "ready") {
      throw new Error("expected ready games");
    }
    expect(firstStatus.game.genesis.seed).toBe(journeySeedFromSeedOverride(7));
    expect(secondStatus.game.genesis.seed).toBe(
      journeySeedFromSeedOverride(7),
    );
    expect(secondStatus.game.gameId).not.toBe(firstStatus.game.gameId);

    act(() => secondStatus.controls.startNewGame({ source: "game_menu" }));
    await settle();
    const fresh = second.status();
    if (fresh.kind !== "ready") throw new Error("expected a ready game");
    expect(fresh.game.gameId).not.toBe(secondStatus.game.gameId);
    expect(fresh.game.genesis.seed).not.toBe(journeySeedFromSeedOverride(7));
    await second.close();
  });

  it("gates unknown games and games pinned to other content", async () => {
    const repository = createGameRepository(createMemoryKeyValueStore());
    expect(await selectGame(repository, parseGameId("nosuch"))).toEqual({
      kind: "notFound",
      gameId: "nosuch",
    });

    await selectGame(repository, null);
    const [{ gameId }] = await repository.listGames();
    const otherContent = { ...CONTENT, draftFoldHash: parseFoldHash("b".repeat(64)) };
    const gated = await selectGame(repository, gameId, otherContent);
    expect(gated.kind).toBe("configGate");
  });
});
