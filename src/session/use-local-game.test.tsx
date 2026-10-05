// @vitest-environment jsdom
// The game selection contract: without `?game=` exactly one game is created
// (StrictMode included) and the URL gains its id; with `?game=` that stored
// game resumes and its journey log is captured; unknown ids and games pinned
// to other content are gated; a game another tab holds is not opened.

import { act, StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PinnedContentConfig } from "../eventlog/types";
import { parseFoldHash } from "../types/content-hash";
import { parseRoomId, type RoomId } from "../types/identifiers";
import { createGameRepository, type GameRepository } from "./game-repository";
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
  gameId: RoomId | null,
  contentConfig: PinnedContentConfig = CONTENT,
  locks?: GameLockManager,
): Promise<{ status: () => LocalGameStatus; close: () => Promise<void> }> {
  let latest: LocalGameStatus = { kind: "opening" };
  const loadRepository = () => Promise.resolve(repository);
  const lockManager = () => locks;
  function Probe(): ReactNode {
    latest = useLocalGame({
      gameId,
      contentConfig,
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
  gameId: RoomId | null,
  contentConfig: PinnedContentConfig = CONTENT,
): Promise<LocalGameStatus> {
  const tab = await openTab(repository, gameId, contentConfig);
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

describe("useLocalGame", () => {
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
      (line) => JSON.parse(line) as { event: string; gameId?: RoomId },
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

  it("gates unknown games and games pinned to other content", async () => {
    const repository = createGameRepository(createMemoryKeyValueStore());
    expect(await selectGame(repository, parseRoomId("nosuch"))).toEqual({
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
