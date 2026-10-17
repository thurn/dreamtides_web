// @vitest-environment jsdom
// The D97 game-switch contract: from an open journey game, starting a D97 run
// creates and opens a D97 game; its started run survives closing and
// reopening the game by id (a reload); the most recent D97 game is found among
// stored games of both modes; Continue switches an open journey game back
// to it; and Main Menu switches a D97 game to a new journey game on the main
// menu.

import { act, StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PinnedContentConfig } from "../eventlog/types";
import { registerD97ContentProvider } from "../rules/d97/d97-content";
import { syntheticD97Content } from "../rules/d97/d97-content.fixtures";
import { parseFoldHash } from "../types/content-hash";
import { parseClientId, parseGameId, type GameId } from "../types/identifiers";
import { testAvatarId } from "../types/test-identities";
import { makeActions } from "./actions";
import { findRecentGameOfMode } from "./game-switch";
import { createGameRepository, type GameRepository } from "./game-repository";
import { createFreshGenesis } from "./genesis";
import type { GameLockManager } from "./game-lock";
import { createMemoryKeyValueStore } from "./key-value-store";
import { useLocalGame, type LocalGameStatus } from "./use-local-game";

const HASH = parseFoldHash("b".repeat(64));
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
const AVATAR = testAvatarId("d97-switch-avatar");

function createFakeLockManager(): GameLockManager {
  const held = new Set<string>();
  return {
    request(name, _options, callback) {
      if (held.has(name)) return callback(null);
      held.add(name);
      return callback({ name }).finally(() => {
        held.delete(name);
      });
    },
  };
}

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

async function openTab(
  repository: GameRepository,
  locks: GameLockManager,
  gameId: GameId | null,
  frontDoorEntry: "main" | undefined = "main",
): Promise<{ status: () => LocalGameStatus; close: () => Promise<void> }> {
  let latest: LocalGameStatus = { kind: "opening" };
  const loadRepository = () => Promise.resolve(repository);
  const lockManager = () => locks;
  function Probe(): ReactNode {
    latest = useLocalGame({
      gameId,
      contentConfig: CONTENT,
      frontDoorEntry,
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

function ready(status: LocalGameStatus) {
  if (status.kind !== "ready") throw new Error(`expected ready, got ${status.kind}`);
  return status;
}

async function storeGame(
  repository: GameRepository,
  gameId: GameId,
  updatedAt: number,
  mode: "journey" | "d97",
): Promise<void> {
  await repository.createGame(
    {
      gameId,
      localPlayerId: parseClientId("p1"),
      createdAt: updatedAt,
      updatedAt,
      head: 0,
    },
    createFreshGenesis(CONTENT, "main", null, mode),
  );
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  window.history.replaceState(null, "", "/main");
  registerD97ContentProvider(syntheticD97Content({ avatarIds: [AVATAR] }));
});

afterEach(() => {
  registerD97ContentProvider(null);
  vi.restoreAllMocks();
});

describe("D97 game switching", () => {
  it("starts a D97 run from a journey game and reopens the started run by id", async () => {
    const repository = createGameRepository(createMemoryKeyValueStore());
    const locks = createFakeLockManager();
    const tab = await openTab(repository, locks, null);
    const journey = ready(tab.status());
    expect(journey.game.log.state().d97).toBeUndefined();

    act(() => journey.gameSwitch.startD97Run({ source: "main_menu" }));
    await settle();
    const d97 = ready(tab.status());
    expect(d97.game.gameId).not.toBe(journey.game.gameId);
    expect(d97.game.genesis.mode).toBe("d97");
    expect(new URL(window.location.href).searchParams.get("game")).toBe(
      d97.game.gameId,
    );
    expect(d97.game.log.state().d97?.screen.type).toBe("avatarSelect");

    await makeActions((draft) => Promise.resolve(d97.game.log.append(draft)))
      .d97StartRun(AVATAR);
    const run = d97.game.log.state().d97?.run;
    expect(run?.avatarId).toBe(AVATAR);
    await tab.close();

    const reloaded = await openTab(repository, locks, d97.game.gameId);
    const reopened = ready(reloaded.status()).game.log.state().d97;
    expect(reopened?.screen.type).toBe("overworld");
    expect(reopened?.run).toEqual(run);
    await reloaded.close();
  });

  it("finds the most recent D97 game among games of both modes", async () => {
    const repository = createGameRepository(createMemoryKeyValueStore());
    expect(await findRecentGameOfMode(repository, "d97")).toBeNull();
    await storeGame(repository, parseGameId("d97old"), 1_000, "d97");
    await storeGame(repository, parseGameId("d97new"), 2_000, "d97");
    await storeGame(repository, parseGameId("journey1"), 3_000, "journey");
    expect(await findRecentGameOfMode(repository, "d97")).toBe("d97new");
    expect(await findRecentGameOfMode(repository, "journey")).toBe("journey1");
  });

  it("continues the stored D97 run from an open journey game", async () => {
    const repository = createGameRepository(createMemoryKeyValueStore());
    const locks = createFakeLockManager();
    const runGameId = parseGameId("d97run");
    await storeGame(repository, runGameId, 1_000, "d97");
    const tab = await openTab(repository, locks, null);
    const journey = ready(tab.status());
    expect(await journey.gameSwitch.findRecentD97Run()).toBe(runGameId);

    act(() => journey.gameSwitch.continueD97Run({ source: "main_menu" }, runGameId));
    await settle();
    const continued = ready(tab.status());
    expect(continued.game.gameId).toBe(runGameId);
    expect(continued.game.log.state().d97).toBeDefined();
    expect(new URL(window.location.href).searchParams.get("game")).toBe(runGameId);
    await tab.close();
  });

  it("opens the main menu from a D97 game as a new journey game", async () => {
    const repository = createGameRepository(createMemoryKeyValueStore());
    const locks = createFakeLockManager();
    const runGameId = parseGameId("d97unavailable");
    await storeGame(repository, runGameId, 1_000, "d97");
    // The tab's own entry would open a journey on its journey phase.
    const tab = await openTab(repository, locks, runGameId, undefined);
    const d97 = ready(tab.status());
    expect(d97.game.genesis.mode).toBe("d97");

    act(() => d97.gameSwitch.openMainMenu({ source: "d97_dream_unavailable" }));
    await settle();
    const menu = ready(tab.status());
    expect(menu.game.gameId).not.toBe(runGameId);
    expect(menu.mode).toBe("journey");
    expect(menu.game.log.state().frontDoor?.phase).toBe("main");
    expect(await d97.gameSwitch.findRecentD97Run()).toBe(runGameId);
    await tab.close();
  });
});
