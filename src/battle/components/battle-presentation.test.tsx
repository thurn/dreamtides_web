// @vitest-environment jsdom
// Published events follow the authoritative fold, including a legality
// fault after an answer and a feed mounted over a reloaded prompt.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEngine, type Engine } from "../../engine";
import type { EngineCardDefinition } from "../../engine/catalog";
import { energy } from "../../engine/dsl/builders";
import type { BattleSlice } from "../../engine/fold/slice";
import { DSL, DSL_CARDS } from "../../engine/testing/dsl-cards";
import { syntheticId, testCatalog } from "../../engine/testing/synthetic-cards";
import type { EventDraft } from "../../eventlog/local-log";
import { foldAdapterFor, pendingEnginePrompt } from "../../rules/battle/engine-battle";
import { journeyBattleOf } from "../../rules/battle/fold";
import { registerBattleInitProvider } from "../../rules/battle/journey-battle";
import {
  AVATAR_ID,
  BATTLE_SITE_ID,
  clearReplayFixtureProviders,
  fixtureBattleInitProvider,
  registerReplayFixtureProviders,
} from "../../rules/replay/fixture-providers";
import { GAME_ENGINE_CONFIG } from "../../rules/replay/replay";
import { createGameRepository } from "../../session/game-repository";
import { LocalGameProvider } from "../../session/hooks";
import { createMemoryKeyValueStore } from "../../session/key-value-store";
import { createLocalGame, openLocalGame, type LocalGame } from "../../session/local-game";
import type { FoldState } from "../../rules/fold-state";
import { TEST_CONTENT_CONFIG } from "../../testing/journey-genesis";
import { parseClientId, parseGameId } from "../../types/identifiers";
import { testJourneySeed } from "../../types/test-identities";
import { usePublishedEngineEvents, type PublishedBatch } from "./battle-presentation";
import { sliceKey } from "./presentation-items";

let faulting = false;
// The same fault as engine-battle.test.ts: completing the player's modal
// play hands priority to an interrupt whose legality search throws.
const faultyResponse: EngineCardDefinition = {
  id: syntheticId(0x4103),
  cardType: "event",
  costs: [energy(0)],
  spark: null,
  subtype: "",
  speed: "interrupt",
  status: "authored",
  abilities: () => [],
  synthetic: {
    play: () => {
      if (faulting) throw new Error("synthetic legality fault");
      return {};
    },
  },
};
let engine: Engine;
const roots: Root[] = [];
const games: LocalGame<FoldState>[] = [];

beforeEach(() => {
  faulting = false;
  engine = createEngine(testCatalog([...DSL_CARDS, faultyResponse]));
  registerReplayFixtureProviders();
  const base = fixtureBattleInitProvider();
  registerBattleInitProvider({
    engine,
    beginBattle: (input) => {
      const start = base.beginBattle(input);
      if (start === null) return null;
      const deck = (card: EngineCardDefinition) => Array.from({ length: 10 }, () => ({ cardId: card.id }));
      return {
        ...start,
        engineInit: { ...start.engineInit, decks: { player: deck(DSL.chooseDrawOrPoints), enemy: deck(faultyResponse) } },
      };
    },
  });
});

afterEach(async () => {
  act(() => roots.splice(0).forEach((root) => root.unmount()));
  await Promise.all(games.splice(0).map((game) => game.close()));
  clearReplayFixtureProviders();
});

function sliceOf(game: LocalGame<FoldState>): BattleSlice {
  const battle = journeyBattleOf(game.log.state().battle);
  if (battle === null) throw new Error("missing journey battle");
  return battle.engine.slice;
}

function promptOf(game: LocalGame<FoldState>) {
  const pending = pendingEnginePrompt(game.log.state().battle, engine);
  if (pending === null) throw new Error("missing engine prompt");
  return pending.prompt;
}

async function battleGame() {
  const repository = createGameRepository(createMemoryKeyValueStore());
  const game = await createLocalGame(repository, GAME_ENGINE_CONFIG, {
    gameId: parseGameId("presentation-recovery"),
    localPlayerId: parseClientId("p1"),
    genesis: { seed: testJourneySeed("fixture-battle"), reducerVersion: "test", createdAt: 0, contentConfig: TEST_CONTENT_CONFIG },
  });
  games.push(game);
  game.log.append({ type: "START_JOURNEY", payload: { avatarId: AVATAR_ID } });
  game.log.append({ type: "ENTER_SITE", payload: { siteId: BATTLE_SITE_ID } });
  game.log.append({ type: "BEGIN_BATTLE", payload: { siteId: BATTLE_SITE_ID } });
  return { game, repository };
}

function play(game: LocalGame<FoldState>): EventDraft {
  const card = sliceOf(game).committed.sides.player.hand[0];
  if (card === undefined) throw new Error("empty hand");
  return { type: "BATTLE_ACTION", payload: { side: "player", action: { kind: "play", card, from: "hand" } } };
}

function mountFeed(game: LocalGame<FoldState>): PublishedBatch[] {
  const batches: PublishedBatch[] = [];
  // Appends between renders must advance the feed from its own fold cursor.
  const slice = sliceOf(game);
  function Feed() {
    usePublishedEngineEvents(engine, slice, (batch) => batches.push(batch));
    return null;
  }
  const root = createRoot(document.createElement("div"));
  roots.push(root);
  act(() => root.render(<LocalGameProvider game={game}><Feed /></LocalGameProvider>));
  return batches;
}

describe("published engine event subscriber", () => {
  it("contains a failed answer, publishes no batch, and continues from the reducer's recovered slice", async () => {
    const { game } = await battleGame();
    const batches = mountFeed(game);
    act(() => {
      game.log.append(play(game));
      const prompt = promptOf(game);
      const before = sliceOf(game);
      expect(batches).toHaveLength(1);
      faulting = true;
      const answer: EventDraft = { type: "BATTLE_ANSWER", payload: { side: "player", promptId: prompt.id, value: 0 } };
      expect(() => game.log.append(answer)).not.toThrow();
      const recovered = sliceOf(game);
      expect(recovered).toEqual({ ...before, inFlight: null, publishedEvents: 0 });
      expect(batches).toHaveLength(1);
      faulting = false;
      game.log.append(answer);
      expect(sliceOf(game)).toEqual(recovered);
      expect(batches).toHaveLength(1);
      game.log.append(play(game));
      expect(batches).toHaveLength(2);
      // A feed retaining the failed in-flight step rejects this play. Its
      // public batch must instead describe precisely the authoritative fold.
      const retry = batches[1];
      const pending = foldAdapterFor(engine).pending(sliceOf(game));
      expect(retry?.before).toEqual(recovered.committed);
      expect(retry?.batch).toEqual({ key: sliceKey(sliceOf(game)), state: pending?.display });
      expect(retry?.seq).toBe(game.log.head());
    });
  });

  it("starts a reloaded prompt with no historical batches and publishes its answer", async () => {
    const { game, repository } = await battleGame();
    game.log.append(play(game));
    await game.close();
    const reopened = await openLocalGame(repository, GAME_ENGINE_CONFIG, game.gameId);
    if (reopened === null) throw new Error("missing stored game");
    games.push(reopened);
    expect(sliceOf(reopened)).toEqual(sliceOf(game));
    const batches = mountFeed(reopened);
    expect(batches).toEqual([]);
    act(() => {
      reopened.log.append({ type: "BATTLE_ANSWER", payload: { side: "player", promptId: promptOf(reopened).id, value: 0 } });
    });
    expect(batches).toHaveLength(1);
    expect(batches[0]?.batch).toEqual({ key: sliceKey(sliceOf(reopened)), state: sliceOf(reopened).committed });
    expect(batches[0]?.seq).toBe(reopened.log.head());
  });
});
