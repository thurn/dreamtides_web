import { describe, expect, it } from "vitest";
import { cardIdOf } from "./testing/board";
import { xCost } from "./dsl/energy";
import { createEngine } from "./engine";
import { battleSeed, type CardId } from "./state/ids";
import type { BattleInit } from "./state/types";
import { drawRandom } from "./state/rng";
import { NO_PROMPTS } from "./steps/sources";
import {
  DECK_SIZE,
  fuzzCatalogCards,
  fuzzEngineCatalog,
  fuzzInit,
  playFuzzGame,
  replayFinalHash,
  SYNTHETIC_FUZZ_POOL,
} from "./testing/fuzz";

const pool = SYNTHETIC_FUZZ_POOL;
const engine = createEngine(fuzzEngineCatalog(pool));

describe("random streams", () => {
  it("is deterministic per seed and stream, and independent across streams", () => {
    const a = engine.createBattle(fuzzInit(battleSeed("rng"), pool), NO_PROMPTS).state;
    const b = engine.createBattle(fuzzInit(battleSeed("rng"), pool), NO_PROMPTS).state;
    const shuffleA = drawRandom(a, "shuffle:player");
    expect(drawRandom(b, "shuffle:player")).toBe(shuffleA);
    // Drawing from another stream first does not change this stream's next value.
    const c = engine.createBattle(fuzzInit(battleSeed("rng"), pool), NO_PROMPTS).state;
    drawRandom(c, "random:test");
    drawRandom(c, "random:test");
    expect(drawRandom(c, "shuffle:player")).toBe(shuffleA);
  });

  it("deals hands and deck order from the seed", () => {
    // Every card is distinct, so the card sequence is exactly the deal.
    const cards = fuzzCatalogCards(pool).filter((card) => xCost(card.costs) === null).slice(0, DECK_SIZE);
    expect(new Set(cards.map((card) => card.id)).size).toBe(DECK_SIZE);
    const deck = cards.map((card) => ({ cardId: card.id }));
    const deal = (seed: string): CardId[] => {
      const init: BattleInit = { ...fuzzInit(battleSeed("x"), pool), seed: battleSeed(seed), decks: { player: deck, enemy: deck } };
      const { state } = engine.createBattle(init, NO_PROMPTS);
      const player = state.sides.player;
      return [...player.hand, ...player.deck].map((id) => cardIdOf(state, id));
    };
    expect(deal("one")).toHaveLength(DECK_SIZE);
    expect(deal("one")).toEqual(deal("one"));
    expect(deal("one")).not.toEqual(deal("two"));
  });
});

describe("replay", () => {
  it("plays seeded random games with no invariant violation, and replays each to its final hash", () => {
    for (let index = 0; index < 8; index++) {
      const game = playFuzzGame(engine, battleSeed(`core-test-${String(index)}`), pool);
      expect(game.failure).toBeNull();
      expect(game.result).not.toBeNull();
      expect(replayFinalHash(engine, game)).toBe(game.finalHash);
    }
  });
});
