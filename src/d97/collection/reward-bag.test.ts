// Reward bag contract (Appendix A §A2) over synthetic pools and synthetic
// capacity stages: the rings partition the tide set's eligible cards; a
// card's capacity is its ring's at the run's stage; `w(c) = capacity(c) −
// drawn(c)` over this Avatar's own draws only; every Avatar's bag exists from
// run start and is independent; opening a stage raises capacity and never
// lowers it; draws never pick a card the bag no longer holds; offers sample
// without removing and never show a card more than `w(c)` times; a filtered
// offer that finds the bag empty falls back to the tide set's eligible cards.

import { describe, expect, it } from "vitest";
import { makeRng } from "../../draft/pool/rng";
import type { CardId } from "../../types/card-identity";
import { testAvatarId, testCardId, testTideId } from "../../types/test-identities";
import { avatarPoolOf } from "./avatar-pool";
import { FIXTURE_BAG_TUNING, testBagContent, testPool } from "./collection.fixtures";
import {
  bagRing,
  bagSize,
  bagWeight,
  initialRewardBags,
  openBagStage,
  pickFromBag,
  recordBagDraw,
  rewardBagOf,
  sampleBagOffer,
  sampleFilteredOffer,
} from "./reward-bag";
import type { D97RewardBags } from "./types";
import { parseAvatarId } from "../../types/identifiers";

const A = testCardId("bag-a");
const B = testCardId("bag-b");
const F = testCardId("bag-facet-f");
const G = testCardId("bag-facet-g");
const OUTSIDE = testCardId("bag-outside");
const AVATAR = testAvatarId("bag-avatar");
const OTHER = testAvatarId("bag-other-avatar");
const CONTENT = testBagContent([testPool(AVATAR, [A, B], [F, G]), testPool(OTHER, [F], [A])]);
const START = initialRewardBags(FIXTURE_BAG_TUNING);
const ACT_2: D97RewardBags = openBagStage(START, { kind: "actEntered", act: 2 }, FIXTURE_BAG_TUNING).bags;

function drawing(bags: D97RewardBags, avatarId: typeof AVATAR, cardIds: readonly CardId[]): D97RewardBags {
  return cardIds.reduce((next, cardId) => recordBagDraw(next, avatarId, cardId), bags);
}

describe("avatarPoolOf", () => {
  const SIGNATURE = testTideId("pool-signature");
  const FACETS = [testTideId("pool-facet-1"), testTideId("pool-facet-2"), testTideId("pool-facet-3")] as const;
  const LEGENDARY = testCardId("pool-legendary");
  const tides = new Map([
    [SIGNATURE, [A, B, LEGENDARY]],
    [FACETS[0], [B, F]],
    [FACETS[1], [F, G, LEGENDARY]],
    [FACETS[2], [G]],
  ]);
  const pinned = {
    avatarId: AVATAR,
    signatureTideId: SIGNATURE,
    borrowedSignature: false,
    facetTideIds: FACETS,
    dealSeed: 3,
    dealt: [{ cardId: A, copies: 2 }, { cardId: OUTSIDE, copies: 1 }],
  };

  it("partitions the tide set's eligible cards into ring 1 (signature) and ring 2 (facets outside it)", () => {
    const pool = avatarPoolOf(pinned, (tideId) => tides.get(tideId) ?? null, (cardId) => cardId !== LEGENDARY, (cardId) => cardId !== OUTSIDE);
    expect(pool).toEqual({
      avatarId: AVATAR,
      tideIds: [SIGNATURE, ...FACETS],
      ring1: [A, B].sort(),
      ring2: [F, G].sort(),
      dealt: [{ cardId: A, copies: 2 }],
    });
  });

  it("is null when a tide of the set is unknown", () => {
    expect(avatarPoolOf(pinned, (tideId) => (tideId === FACETS[2] ? null : (tides.get(tideId) ?? null)), () => true, () => true)).toBeNull();
  });
});

describe("capacity and contents", () => {
  it("gives each ring its stage's capacity, and nothing outside the tide set", () => {
    const start = rewardBagOf(CONTENT, START, AVATAR);
    expect([bagWeight(start, A), bagWeight(start, F), bagWeight(start, OUTSIDE)]).toEqual([2, 0, 0]);
    expect([bagRing(start, A), bagRing(start, F), bagRing(start, OUTSIDE)]).toEqual([1, 2, null]);
    expect(bagSize(start)).toBe(4);
    const act2 = rewardBagOf(CONTENT, ACT_2, AVATAR);
    expect([bagWeight(act2, A), bagWeight(act2, F)]).toEqual([2, 1]);
    expect(bagSize(act2)).toBe(6);
  });

  it("subtracts this Avatar's draws, never going negative", () => {
    const bags = drawing(START, AVATAR, [A, A, A, B]);
    const bag = rewardBagOf(CONTENT, bags, AVATAR);
    expect([bagWeight(bag, A), bagWeight(bag, B)]).toEqual([0, 1]);
    expect(bagSize(bag)).toBe(1);
  });

  it("keeps every Avatar's bag independent from run start", () => {
    const bags = drawing(ACT_2, AVATAR, [A, F]);
    expect(bagWeight(rewardBagOf(CONTENT, bags, OTHER), A)).toBe(1);
    expect(bagWeight(rewardBagOf(CONTENT, bags, OTHER), F)).toBe(2);
    expect(bagWeight(rewardBagOf(CONTENT, bags, AVATAR), F)).toBe(0);
    const unknown = parseAvatarId("00000000-0000-4000-8000-0000000000ff");
    expect(rewardBagOf(CONTENT, bags, unknown).entries).toEqual([]);
  });

  it("writes draw counts in key order whatever the draw order", () => {
    expect(JSON.stringify(drawing(START, OTHER, [B, A]).drawn)).toBe(JSON.stringify(drawing(START, OTHER, [A, B]).drawn));
    expect(Object.keys(drawing(drawing(START, OTHER, [A]), AVATAR, [A]).drawn)).toEqual([AVATAR, OTHER].sort());
  });
});

describe("openBagStage", () => {
  it("opens the stage its trigger names, raising capacity; repeats and earlier stages change nothing", () => {
    expect(START.stage).toBe(1);
    const opened = openBagStage(START, { kind: "actEntered", act: 2 }, FIXTURE_BAG_TUNING);
    expect(opened.opened?.stage).toBe(2);
    expect(openBagStage(opened.bags, { kind: "actEntered", act: 2 }, FIXTURE_BAG_TUNING)).toEqual({ bags: opened.bags, opened: null });
    const apollyon = openBagStage(START, { kind: "apollyonFalls" }, FIXTURE_BAG_TUNING);
    expect(apollyon.bags.stage).toBe(3);
    expect(openBagStage(apollyon.bags, { kind: "actEntered", act: 2 }, FIXTURE_BAG_TUNING).opened).toBeNull();
    expect(openBagStage(START, { kind: "actEntered", act: 4 }, FIXTURE_BAG_TUNING).opened).toBeNull();
  });

  it("keeps draws across stages: w rises by the capacity step", () => {
    const bags = drawing(START, AVATAR, [A, A]);
    expect(bagWeight(rewardBagOf(CONTENT, bags, AVATAR), A)).toBe(0);
    const raised = openBagStage(bags, { kind: "apollyonFalls" }, FIXTURE_BAG_TUNING).bags;
    expect(bagWeight(rewardBagOf(CONTENT, raised, AVATAR), A)).toBe(1);
    expect(raised.drawn).toBe(bags.drawn);
  });
});

describe("draws and offers", () => {
  it("picks only cards the bag still holds, in proportion to w", () => {
    const bag = rewardBagOf(CONTENT, drawing(ACT_2, AVATAR, [B, B]), AVATAR);
    const picks = Array.from({ length: 40 }, (_, seed) => pickFromBag(bag, makeRng(seed)));
    expect(picks).not.toContain(B);
    expect(new Set(picks)).toEqual(new Set([A, F, G]));
  });

  it("picks nothing from an empty bag", () => {
    expect(pickFromBag(rewardBagOf(CONTENT, drawing(START, AVATAR, [A, A, B, B]), AVATAR), makeRng(1))).toBeNull();
  });

  it("never shows a card more than w(c) times in one offer", () => {
    const bag = rewardBagOf(CONTENT, drawing(ACT_2, AVATAR, [A]), AVATAR);
    for (let seed = 0; seed < 20; seed += 1) {
      const offer = sampleBagOffer(bag, 10, makeRng(seed));
      expect(offer).toHaveLength(bagSize(bag));
      for (const cardId of [A, B, F, G]) expect(offer.filter((id) => id === cardId).length).toBeLessThanOrEqual(bagWeight(bag, cardId));
    }
    expect(sampleBagOffer(bag, 2, makeRng(1))).toHaveLength(2);
  });

  it("falls back to the tide set's eligible cards when a filtered offer finds the bag empty", () => {
    const empty = rewardBagOf(CONTENT, drawing(START, AVATAR, [A, A, B, B]), AVATAR);
    const facetOnly = (cardId: CardId) => cardId === F || cardId === G;
    const offers = new Set(Array.from({ length: 20 }, (_, seed) => sampleFilteredOffer(empty, facetOnly, new Set(), makeRng(seed))));
    expect(offers).toEqual(new Set([F, G]));
    expect(sampleFilteredOffer(empty, facetOnly, new Set([F, G]), makeRng(1))).toBeNull();
    const held = rewardBagOf(CONTENT, drawing(START, AVATAR, [A, A]), AVATAR);
    expect(sampleFilteredOffer(held, () => true, new Set(), makeRng(4))).toBe(B);
  });
});
