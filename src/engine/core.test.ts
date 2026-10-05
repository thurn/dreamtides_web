import { describe, expect, it } from "vitest";
import { createEngine } from "./engine";
import { deserializeState, serializeState, stateHash } from "./state/hash";
import { battleSeed } from "./state/ids";
import { drawRandom } from "./state/rng";
import { NO_PROMPTS } from "./steps/sources";
import { fuzzInit, playFuzzGame, replayFinalHash } from "./testing/fuzz";
import { testCatalog } from "./testing/synthetic-cards";

const engine = createEngine(testCatalog());

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

  it("deals different hands for different seeds", () => {
    const one = engine.createBattle({ ...fuzzInit(battleSeed("x")), seed: battleSeed("one") }, NO_PROMPTS).state;
    const two = engine.createBattle({ ...fuzzInit(battleSeed("x")), seed: battleSeed("two") }, NO_PROMPTS).state;
    expect(stateHash(one)).not.toBe(stateHash(two));
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
      expect(replayFinalHash(engine, game.init, game.actions)).toBe(game.finalHash);
    }
  });
});
