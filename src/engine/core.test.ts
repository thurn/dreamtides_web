import { describe, expect, it } from "vitest";
import { xCost } from "./dsl/energy";
import { createEngine } from "./engine";
import { deserializeState, serializeState, stateHash } from "./state/hash";
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
} from "./testing/fuzz";

const engine = createEngine(fuzzEngineCatalog());

describe("random streams", () => {
  it("is deterministic per seed and stream, and independent across streams", () => {
    const a = engine.createBattle(fuzzInit(battleSeed("rng")), NO_PROMPTS).state;
    const b = engine.createBattle(fuzzInit(battleSeed("rng")), NO_PROMPTS).state;
    const shuffleA = drawRandom(a, "shuffle:player");
    expect(drawRandom(b, "shuffle:player")).toBe(shuffleA);
    // Drawing from another stream first does not change this stream's next value.
    const c = engine.createBattle(fuzzInit(battleSeed("rng")), NO_PROMPTS).state;
    drawRandom(c, "random:test");
    drawRandom(c, "random:test");
    expect(drawRandom(c, "shuffle:player")).toBe(shuffleA);
  });

  it("deals hands and deck order from the seed", () => {
    // Every card is distinct, so the card sequence is exactly the deal.
    const cards = fuzzCatalogCards().filter((card) => xCost(card.costs) === null).slice(0, DECK_SIZE);
    expect(new Set(cards.map((card) => card.id)).size).toBe(DECK_SIZE);
    const deck = cards.map((card) => ({ cardId: card.id }));
    const deal = (seed: string): CardId[] => {
      const init: BattleInit = { ...fuzzInit(battleSeed("x")), seed: battleSeed(seed), decks: { player: deck, enemy: deck } };
      const { state } = engine.createBattle(init, NO_PROMPTS);
      const player = state.sides.player;
      return [...player.hand, ...player.deck].map((id) => state.instances[id].cardId);
    };
    expect(deal("one")).toHaveLength(DECK_SIZE);
    expect(deal("one")).toEqual(deal("one"));
    expect(deal("one")).not.toEqual(deal("two"));
  });
});

/** A deep copy whose objects list their keys in reverse insertion order. */
function reversedKeys<T>(value: T): T {
  if (Array.isArray(value)) return value.map(reversedKeys) as T;
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([key, entry]) => [key, reversedKeys(entry)]),
  ) as T;
}

describe("state hash", () => {
  it("hashes states that are equal as data equally, whatever their key order", () => {
    const state = engine.createBattle(fuzzInit(battleSeed("hash-order")), NO_PROMPTS).state;
    state.rng["random:a"] = 1;
    state.rng["random:b"] = 2;
    const reordered = reversedKeys(state);
    expect(Object.keys(reordered.rng)).not.toEqual(Object.keys(state.rng));
    expect(Object.keys(reordered.instances)).not.toEqual(Object.keys(state.instances));
    expect(reordered).toEqual(state);
    expect(stateHash(reordered)).toBe(stateHash(state));
  });

  it("hashes states that differ as data differently", () => {
    const state = engine.createBattle(fuzzInit(battleSeed("hash-differ")), NO_PROMPTS).state;
    const changed = deserializeState(serializeState(state));
    changed.rng["random:a"] = 1;
    expect(stateHash(changed)).not.toBe(stateHash(state));
  });
});

describe("serialization and replay", () => {
  it("round-trips a state through serialization with an identical hash", () => {
    const state = engine.createBattle(fuzzInit(battleSeed("serialize")), NO_PROMPTS).state;
    const copy = deserializeState(serializeState(state));
    expect(copy).toEqual(state);
    expect(stateHash(copy)).toBe(stateHash(state));
  });

  it("plays seeded random games with no invariant violation, and replays each to its final hash", () => {
    for (let index = 0; index < 8; index++) {
      const game = playFuzzGame(engine, battleSeed(`core-test-${String(index)}`));
      expect(game.failure).toBeNull();
      expect(game.result).not.toBeNull();
      expect(replayFinalHash(engine, game)).toBe(game.finalHash);
    }
  });
});
