// @vitest-environment jsdom
// The game selection contract: without `?game=` exactly one game is created
// (StrictMode included) and the URL gains its id; with `?game=` that stored
// game resumes; unknown ids and games pinned to other content are gated.

import { act, StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PinnedContentConfig } from "../eventlog/types";
import { parseFoldHash } from "../types/content-hash";
import { parseRoomId, type RoomId } from "../types/identifiers";
import { createGameRepository, type GameRepository } from "./game-repository";
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

async function selectGame(
  repository: GameRepository,
  gameId: RoomId | null,
  contentConfig: PinnedContentConfig = CONTENT,
): Promise<LocalGameStatus> {
  let latest: LocalGameStatus = { kind: "opening" };
  function Probe(): ReactNode {
    latest = useLocalGame({
      gameId,
      contentConfig,
      repository: () => Promise.resolve(repository),
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
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  act(() => root.unmount());
  return latest;
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
