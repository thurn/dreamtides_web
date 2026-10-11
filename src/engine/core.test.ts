import { describe, expect, it, vi } from "vitest";
import { cardIdOf } from "./testing/board";
import { xCost } from "./dsl/energy";
import { createEngine } from "./engine";
import { battleSeed, type CardId } from "./state/ids";
import type { BattleInit } from "./state/types";
import { drawRandom } from "./state/rng";
import { NO_PROMPTS } from "./steps/sources";
import { PolicyRandom } from "./policy/random";
import { syntheticId } from "./testing/synthetic-cards";
import {
  DECK_SIZE,
  fuzzCatalogCards,
  fuzzEngineCatalog,
  fuzzInit,
  randomDeck,
  playFuzzGame,
  replayFinalHash,
  replayInteractively,
  type FuzzPool,
  SYNTHETIC_FUZZ_POOL,
  withFuzzCardWeights,
} from "./testing/fuzz";

import { parseAvatarId, parseDreamsignId, parseDreamwellCardId } from "../types/identifiers";
import { parseFigmentId, BACK_RANK_SIZE, type AvatarId, type DreamwellCardId, type FigmentId } from "./state/ids";
import { atStartOfFirstTurn, triggered } from "./dsl/triggers";
import { gainPoints, materializeFigments } from "./effects/primitives";
import { ZONE_FIGMENT } from "./testing/zone-cards";
import { DREAMWELL_RULES } from "../content/dreamwell-rules";

const pool = SYNTHETIC_FUZZ_POOL;
const engine = createEngine(fuzzEngineCatalog(pool));

describe("targeted fuzz input", () => {
  const target = pool.cards[pool.cards.length - 1];
  if (target === undefined) throw new Error("missing synthetic target");

  it("reserves a requested card even when random picks select other cards, retaining the full pool", () => {
    const targeted = withFuzzCardWeights(pool, `${target.id}, ${target.id}`);
    const random = new PolicyRandom(battleSeed("targeted-picks"));
    const pick = vi.spyOn(random, "pick").mockImplementation((values) => values[0]);
    try {
      const deck = randomDeck(random, targeted);
      expect(deck.filter((entry) => entry.cardId === target.id)).toHaveLength(1);
      expect(deck.some((entry) => entry.cardId !== target.id)).toBe(true);
      expect(fuzzCatalogCards(targeted)).toEqual(fuzzCatalogCards(pool));
    } finally {
      pick.mockRestore();
    }
  });

  it("targets both decks deterministically and keeps empty target input equivalent to omission", () => {
    const seed = battleSeed("targeted-init");
    const targeted = withFuzzCardWeights(pool, target.id);
    const init = fuzzInit(seed, targeted);
    expect(fuzzInit(seed, targeted)).toEqual(init);
    for (const side of ["player", "enemy"] as const) {
      expect(init.decks[side].some((entry) => entry.cardId === target.id)).toBe(true);
    }
    expect(fuzzInit(seed, { ...pool, weightedCardIds: [] })).toEqual(fuzzInit(seed, withFuzzCardWeights(pool, undefined)));
  });

  it("rejects empty, malformed, unavailable, and oversized target lists", () => {
    for (const input of ["", " ", "--games", "not-a-uuid", syntheticId(0xff01)]) {
      expect(() => withFuzzCardWeights(pool, input)).toThrow();
    }
    const cards = Array.from({ length: DECK_SIZE + 1 }, (_, index) => ({ ...target, id: syntheticId(0xf100 + index) }));
    expect(() => withFuzzCardWeights({ ...pool, cards }, cards.map((card) => card.id).join(","))).toThrow();
  });
});

describe("mixed entity fuzz targets", () => {
  const id = (index: number) => `5e5e5e5e-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
  const avatars = Array.from({ length: 3 }, (_, index) => ({
    id: parseAvatarId(id(0xf300 + index)), status: "authored" as const,
    abilities: () => [triggered(atStartOfFirstTurn(), gainPoints(1))],
  }));
  const sign = {
    id: parseDreamsignId(id(0xf310)), status: "authored" as const,
    abilities: () => [triggered(atStartOfFirstTurn(), gainPoints(1))],
  };
  const dreamwell = Array.from({ length: DREAMWELL_RULES.cardsPerRecurringOrder + 1 }, (_, index) => ({
    id: parseDreamwellCardId(id(0xf320 + index)), order: DREAMWELL_RULES.recurringOrders[0], energyAdded: 1, status: "vanilla" as const,
  }));
  const figments = Array.from({ length: BACK_RANK_SIZE + 1 }, (_, index) => ({ ...ZONE_FIGMENT.warrior, id: parseFigmentId(id(0xf400 + index)) }));
  const mixed: FuzzPool = { ...pool, emblems: { avatars, dreamsigns: [sign] }, dreamwell, figments };

  it("puts requested emblems in battle state and resolves their actual abilities", () => {
    const targeted = withFuzzCardWeights(mixed, [avatars[0].id, sign.id].join(","));
    const init = fuzzInit(battleSeed("target-emblems"), targeted);
    const created = createEngine(fuzzEngineCatalog(targeted)).createBattle(init, NO_PROMPTS);
    for (const side of ["player", "enemy"] as const) {
      expect(created.state.sides[side].avatar?.id).toBe(avatars[0].id);
      expect(created.state.sides[side].dreamsigns.some((entry) => entry.id === sign.id)).toBe(true);
    }
    const game = playFuzzGame(createEngine(fuzzEngineCatalog(targeted)), init.seed, targeted);
    for (const entry of game.targetCoverage) {
      expect(entry.included).toBe(2);
      expect(entry.exercised).toBeGreaterThan(0);
    }
    expect(game.failure).toBeNull();
  });

  it("builds targeted Dreamwell cards into the shared deck and counts actual draws", () => {
    const target = dreamwell[dreamwell.length - 1];
    const targeted = withFuzzCardWeights(mixed, target.id);
    const init = fuzzInit(battleSeed("target-dreamwell"), targeted);
    expect(init.dreamwell).toContain(target.id);
    expect(init.dreamwell).toHaveLength(DREAMWELL_RULES.cardsPerRecurringOrder);
    expect(fuzzInit(init.seed, mixed).dreamwell).toHaveLength(dreamwell.length);
    const targetedEngine = createEngine(fuzzEngineCatalog(targeted));
    const created = targetedEngine.createBattle(init, NO_PROMPTS);
    expect(created.state.dreamwell.deck).toContain(target.id);
    const game = playFuzzGame(targetedEngine, init.seed, targeted);
    expect(game.targetCoverage[0].included).toBe(created.state.dreamwell.deck.filter((card) => card === target.id).length);
    expect(game.targetCoverage[0].exercised).toBeGreaterThan(0);
    expect(game.failure).toBeNull();
  });

  it("materializes requested figments through synthetic support and reproduces mixed games", () => {
    const input = [mixed.cards[0].id, avatars[0].id, sign.id, dreamwell[0].id, figments[0].id].join(",");
    const targeted = withFuzzCardWeights(mixed, input);
    const targetedEngine = createEngine(fuzzEngineCatalog(targeted));
    const seed = battleSeed("target-mixed");
    const created = targetedEngine.createBattle(fuzzInit(seed, targeted), NO_PROMPTS);
    expect(Object.values(created.state.instances).some((entry) => entry.zone === "play" && entry.printing.kind === "figment" && entry.printing.figment === figments[0].id)).toBe(true);
    const unweighted = createEngine(fuzzEngineCatalog(mixed)).createBattle(fuzzInit(seed, mixed), NO_PROMPTS);
    expect(Object.values(unweighted.state.instances).some((entry) => entry.printing.kind === "figment" && entry.printing.figment === figments[0].id)).toBe(false);
    const game = playFuzzGame(targetedEngine, seed, targeted, 2);
    expect(game).toEqual(playFuzzGame(targetedEngine, seed, targeted, 2));
    expect(game.failure).toBeNull();
    expect(game.targetCoverage.find((entry) => entry.target.kind === "figment")).toMatchObject({ included: 1, exercised: 1 });
    expect(replayFinalHash(targetedEngine, game)).toBe(game.finalHash);
    expect(replayInteractively(targetedEngine, game, () => 0).failure).toBeNull();
  });

  it("rotates limited avatar, Dreamwell and figment slots across absolute ordinals", () => {
    const targeted = withFuzzCardWeights(mixed, [...avatars, ...dreamwell, ...figments].map((entry) => entry.id).join(","));
    const selectedAvatars = new Set<AvatarId | undefined>();
    const builtCards = new Set<DreamwellCardId>();
    const materializedFigments = new Set<FigmentId>();
    const targetedEngine = createEngine(fuzzEngineCatalog(targeted));
    for (let ordinal = 0; ordinal < 2; ordinal++) {
      const init = fuzzInit(battleSeed("target-rotation"), targeted, ordinal);
      expect(fuzzInit(init.seed, targeted, ordinal)).toEqual(init);
      const created = targetedEngine.createBattle(init, NO_PROMPTS);
      for (const side of ["player", "enemy"] as const) selectedAvatars.add(created.state.sides[side].avatar?.id);
      for (const card of created.state.dreamwell.deck) builtCards.add(card);
      for (const instance of Object.values(created.state.instances)) {
        if (instance.zone === "play" && instance.printing.kind === "figment") materializedFigments.add(instance.printing.figment);
      }
    }
    for (const avatar of avatars) expect(selectedAvatars.has(avatar.id)).toBe(true);
    for (const card of dreamwell) expect(builtCards.has(card.id)).toBe(true);
    for (const figment of figments) expect(materializedFigments.has(figment.id)).toBe(true);
    const avatarOnly = withFuzzCardWeights(mixed, avatars.map((entry) => entry.id).join(","));
    const seed = battleSeed("large-target-ordinal");
    expect(fuzzInit(seed, avatarOnly, Number.MAX_SAFE_INTEGER)).toEqual(fuzzInit(seed, avatarOnly, Number.MAX_SAFE_INTEGER % avatars.length));
  });

  it("reports zero figment coverage when competing first-turn effects fill capacity", () => {
    const blocker = { ...sign, abilities: () => [triggered(atStartOfFirstTurn(), materializeFigments(ZONE_FIGMENT.warrior.id, BACK_RANK_SIZE))] };
    const targeted = withFuzzCardWeights({ ...mixed, emblems: { dreamsigns: [blocker] } }, [blocker.id, figments[0].id].join(","));
    const game = playFuzzGame(createEngine(fuzzEngineCatalog(targeted)), battleSeed("target-capacity"), targeted);
    expect(game.failure).toBeNull();
    expect(game.targetCoverage.find((entry) => entry.target.kind === "figment")).toMatchObject({ included: 0, exercised: 0 });
  });

  it("retains rotated init, actual coverage and the failing action after a mid-game error", () => {
    const targeted = withFuzzCardWeights(mixed, [...avatars, figments[0]].map((entry) => entry.id).join(","));
    const targetedEngine = createEngine(fuzzEngineCatalog(targeted));
    const apply = vi.spyOn(targetedEngine, "apply").mockImplementation(() => { throw new Error("synthetic action failure"); });
    try {
      const seed = battleSeed("target-failure");
      const game = playFuzzGame(targetedEngine, seed, targeted, 3);
      expect(game.failure).toContain("synthetic action failure");
      expect(game.failedAction).not.toBeNull();
      expect(game.init).toEqual(fuzzInit(seed, targeted, 3));
      expect(game.targetCoverage.find((entry) => entry.target.kind === "figment")).toMatchObject({ included: 1, exercised: 1 });
    } finally {
      apply.mockRestore();
    }
  });

  it("rejects unsupported journey entities, ambiguous IDs, stale pools and invalid ordinals", () => {
    expect(() => withFuzzCardWeights({ ...mixed, emblems: { dreamsigns: [{ ...sign, id: parseDreamsignId(avatars[0].id) }], avatars } }, avatars[0].id)).toThrow();
    expect(() => withFuzzCardWeights({ ...mixed, dreamwell: [{ ...dreamwell[0], order: -1 }] }, dreamwell[0].id)).toThrow();
    for (const status of ["pending", "vanilla", "authored"] as const) {
      expect(() => withFuzzCardWeights({ ...mixed, emblems: { dreamsigns: [{ ...sign, status, abilities: () => [] }] } }, sign.id)).toThrow();
    }
    const targeted = withFuzzCardWeights(mixed, figments[0].id);
    const collision = { ...targeted, emblems: { dreamsigns: [{ ...sign, id: parseDreamsignId(id(0xf00)) }] } };
    expect(() => fuzzEngineCatalog(collision)).toThrow();
    expect(() => fuzzInit(battleSeed("stale"), { ...targeted, figments: [] })).toThrow();
    for (const ordinal of [-1, 0.5, Number.NaN]) expect(() => fuzzInit(battleSeed("bad-ordinal"), mixed, ordinal)).toThrow();
  });
});

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
