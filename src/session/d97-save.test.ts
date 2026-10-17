// D97 versioned saves through a local game: a D97 game writes its snapshot
// after every applied event and reopens from it in the same build; a game
// whose stored content configuration, protocol or build differs is rebased and
// opens into the same run under this build's genesis, never re-folding its old
// events; and a journey game writes no snapshot.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { D97_SLICE_DREAM } from "../content/d97/dreams";
import { SAVE_AVATAR, registerSaveContent } from "../d97/save/save.fixtures";
import type { D97SaveBuild } from "../d97/save/snapshot";
import type { Genesis, PinnedContentConfig } from "../eventlog/types";
import { registerD97ContentProvider } from "../rules/d97/d97-content";
import type { FoldState } from "../rules/fold-state";
import { GAME_ENGINE_CONFIG } from "../rules/replay/replay";
import { parseClientId, parseGameId } from "../types/identifiers";
import { testFoldHash, testJourneySeed } from "../types/test-identities";
import { D97_SAVE_BUILD, d97SnapshotCodec, needsD97Rebase, rebaseD97Game } from "./d97-save";
import { createGameRepository, type GameRepository } from "./game-repository";
import { createMemoryKeyValueStore } from "./key-value-store";
import { createLocalGame, openLocalGame, type LocalGameOptions } from "./local-game";

const HASH = testFoldHash("d97-save");
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
const CHANGED: PinnedContentConfig = { ...CONTENT, economyFoldHash: testFoldHash("d97-save-changed") };
const GENESIS: Genesis = {
  seed: testJourneySeed("d97-save-seed"),
  reducerVersion: D97_SAVE_BUILD.reducerVersion,
  createdAt: 0,
  mode: "d97",
  contentConfig: CONTENT,
};
const GAME = parseGameId("d97-save-game");
const OPTIONS: LocalGameOptions<FoldState> = {
  eventClock: () => "2026-01-01T00:00:00.000Z",
  now: () => 0,
  snapshots: d97SnapshotCodec(),
};

async function playedGame(repository: GameRepository, genesis: Genesis = GENESIS): Promise<FoldState> {
  const game = await createLocalGame<FoldState>(repository, GAME_ENGINE_CONFIG, { gameId: GAME, genesis, localPlayerId: parseClientId("p1") }, OPTIONS);
  game.log.append({ type: "D97_START_RUN", payload: { avatarId: SAVE_AVATAR } });
  game.log.append({ type: "D97_OPEN_SHOP", payload: { anchorId: D97_SLICE_DREAM.shopAnchorId } });
  game.log.append({ type: "D97_ACTIVATE_WAYPOINT", payload: { anchorId: D97_SLICE_DREAM.waypointAnchorId } });
  // A bounced intent after the last applied one.
  game.log.append({ type: "D97_STEP_THROUGH_DOOR", payload: { anchorId: D97_SLICE_DREAM.exitDoorAnchorId } });
  const state = game.log.state();
  await game.close();
  return state;
}

async function reopen(repository: GameRepository) {
  const game = await openLocalGame<FoldState>(repository, GAME_ENGINE_CONFIG, GAME, OPTIONS);
  if (game === null) throw new Error("game not stored");
  return game;
}

beforeEach(registerSaveContent);
afterEach(() => registerD97ContentProvider(null));

describe("D97 saves", () => {
  it("write a snapshot after every applied event and reopen from it within a build", async () => {
    const repository = createGameRepository(createMemoryKeyValueStore());
    const state = await playedGame(repository);
    const stored = (await repository.readGame(GAME))!;
    expect(stored.snapshot).not.toBeNull();
    expect(needsD97Rebase(stored, CONTENT)).toBe(false);
    const game = await reopen(repository);
    expect(game.opened.openedFrom).toBe("snapshot");
    expect(game.opened.checkpointSeq).toBe(3);
    expect(game.log.state()).toEqual(state);
    await game.close();
  });

  it("open a D97 game with a different content configuration into the same run", async () => {
    const repository = createGameRepository(createMemoryKeyValueStore());
    const state = await playedGame(repository);
    const stored = (await repository.readGame(GAME))!;
    expect(needsD97Rebase(stored, CHANGED)).toBe(true);
    await rebaseD97Game(repository, stored, CHANGED, { now: () => 1 });
    const rebased = (await repository.readGame(GAME))!;
    expect(rebased.genesis.contentConfig).toEqual(CHANGED);
    expect(rebased.checkpoint).toBeNull();
    expect(needsD97Rebase(rebased, CHANGED)).toBe(false);
    const logged = (await repository.readLogLines(GAME)).map((line) => JSON.parse(line) as { event: string });
    expect(logged.map((line) => line.event)).toContain("d97_save_rebased");
    const game = await reopen(repository);
    expect(game.opened.openedFrom).toBe("snapshot");
    expect(game.opened.replayedEvents).toBe(0);
    expect(game.log.state().d97).toEqual(state.d97);
    expect(game.log.head()).toBe(4);
    // The rebased game keeps playing from its old head.
    game.log.append({ type: "D97_OPEN_SHOP", payload: { anchorId: D97_SLICE_DREAM.shopAnchorId } });
    expect(game.log.head()).toBe(5);
    await game.close();
  });

  it("rebase a game written by another build", async () => {
    const repository = createGameRepository(createMemoryKeyValueStore());
    await playedGame(repository);
    const stored = (await repository.readGame(GAME))!;
    const other = { ...D97_SAVE_BUILD, gitRevision: "0123456789abcdef0123456789abcdef01234567" } as D97SaveBuild;
    expect(needsD97Rebase(stored, CONTENT, other)).toBe(true);
    await rebaseD97Game(repository, stored, CONTENT, { now: () => 1, build: other });
    expect(needsD97Rebase((await repository.readGame(GAME))!, CONTENT, other)).toBe(false);
  });

  it("write no snapshot for a journey game", async () => {
    const repository = createGameRepository(createMemoryKeyValueStore());
    const journey: Genesis = { ...GENESIS, mode: "journey" };
    const game = await createLocalGame<FoldState>(repository, GAME_ENGINE_CONFIG, { gameId: GAME, genesis: journey, localPlayerId: parseClientId("p1") }, OPTIONS);
    game.log.append({ type: "D97_START_RUN", payload: { avatarId: SAVE_AVATAR } });
    await game.close();
    expect((await repository.readGame(GAME))!.snapshot).toBeNull();
  });
});
