// Milestone saves (decision P25): every milestone fixture under
// `src/d97/save/fixtures/milestones/` is a real exported D97 snapshot from
// the milestone's playthrough. Each one, stored as a D97 game, opens in this
// build through the real load path (migration, reconciliation against the
// current catalog and rebase) into a playable run. Only that property is
// asserted, never the run's contents: a failure means a migration or a
// reconciliation is missing, never that the fixture needs regenerating.

import { readdirSync, readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { d97DreamById } from "../content/d97/dreams";
import { loadJourneyContent } from "../data/journey-content";
import type { Genesis, PinnedContentConfig } from "../eventlog/types";
import type { FoldState } from "../rules/fold-state";
import { GAME_ENGINE_CONFIG } from "../rules/replay/replay";
import { parseClientId, parseGameId } from "../types/identifiers";
import { testFoldHash, testJourneySeed } from "../types/test-identities";
import { D97_SAVE_BUILD, d97SnapshotCodec, needsD97Rebase, rebaseD97Game } from "./d97-save";
import { createGameRepository } from "./game-repository";
import { createMemoryKeyValueStore } from "./key-value-store";
import { createLocalGame, openLocalGame, type LocalGameOptions } from "./local-game";
import { clearGameProviders, registerGameProviders } from "./providers/register-game-providers";

const MILESTONES = new URL("../d97/save/fixtures/milestones/", import.meta.url);
const FIXTURES = readdirSync(MILESTONES).filter((name) => name.endsWith(".json")).sort();

const HASH = testFoldHash("d97-milestone");
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
const GENESIS: Genesis = {
  seed: testJourneySeed("d97-milestone-seed"),
  reducerVersion: D97_SAVE_BUILD.reducerVersion,
  createdAt: 0,
  mode: "d97",
  contentConfig: CONTENT,
};
const GAME = parseGameId("d97-milestone-game");
const OPTIONS: LocalGameOptions<FoldState> = {
  eventClock: () => "2026-01-01T00:00:00.000Z",
  now: () => 0,
  snapshots: d97SnapshotCodec(),
};

beforeAll(() => registerGameProviders(loadJourneyContent()));
afterAll(clearGameProviders);

describe("D97 milestone saves", () => {
  it("include the M1 milestone", () => {
    expect(FIXTURES).toContain("m1.json");
  });

  it.each(FIXTURES)("%s opens into a playable run", async (name) => {
    const raw = readFileSync(new URL(name, MILESTONES), "utf8");
    const repository = createGameRepository(createMemoryKeyValueStore());
    const created = await createLocalGame<FoldState>(repository, GAME_ENGINE_CONFIG, { gameId: GAME, genesis: GENESIS, localPlayerId: parseClientId("p1") }, OPTIONS);
    await created.close();
    // Store the milestone as the game's saved snapshot, as the build that wrote it left it.
    const fresh = (await repository.readGame(GAME))!;
    await repository.rebaseGame(GAME, { summary: fresh.summary, genesis: GENESIS, snapshot: raw });
    const stored = (await repository.readGame(GAME))!;
    if (needsD97Rebase(stored, CONTENT)) await rebaseD97Game(repository, stored, CONTENT, { now: () => 1 });

    const game = await openLocalGame<FoldState>(repository, GAME_ENGINE_CONFIG, GAME, OPTIONS);
    expect(game).not.toBeNull();
    expect(game!.opened.openedFrom).toBe("snapshot");
    const d97 = game!.log.state().d97;
    expect(d97?.run).not.toBeNull();
    expect(d97!.screen.type).not.toBe("avatarSelect");
    expect(d97DreamById(d97!.run!.dreamId)).not.toBeNull();
    await game!.close();
  });
});
