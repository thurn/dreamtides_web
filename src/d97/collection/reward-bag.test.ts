// Reward bag v0 contract: copy targets equal the dealt counts; `w` falls with
// every acquisition from any channel and never goes negative; draws remove
// copies without replacement and never exceed the targets; offers sample
// without removing and never show a card more than `w(c)` times.

import { describe, expect, it } from "vitest";
import { makeRng } from "../../draft/pool/rng";
import type { CardId } from "../../types/card-identity";
import { testAvatarId, testCardId } from "../../types/test-identities";
import {
  bagSize,
  bagWeight,
  createRewardBag,
  drawFromBag,
  recordAcquisition,
  sampleBagOffer,
  takeFromBag,
} from "./reward-bag";
import type { D97RewardBag } from "./types";

const A = testCardId("bag-a");
const B = testCardId("bag-b");
const C = testCardId("bag-c");
const OUTSIDE = testCardId("bag-outside");

function smallBag(): D97RewardBag {
  return createRewardBag({
    avatarId: testAvatarId("bag-avatar"),
    dealSeed: 7,
    joinedTideIds: [],
    dealt: [
      { cardId: A, copies: 2 },
      { cardId: B, copies: 1 },
      { cardId: C, copies: 2 },
    ],
  });
}

describe("copy targets", () => {
  it("sets each target to the dealt count", () => {
    const bag = smallBag();
    expect(bagWeight(bag, A)).toBe(2);
    expect(bagWeight(bag, B)).toBe(1);
    expect(bagWeight(bag, C)).toBe(2);
    expect(bagWeight(bag, OUTSIDE)).toBe(0);
    expect(bagSize(bag)).toBe(5);
  });

  it("counts every acquisition, from any channel, and never goes negative", () => {
    let bag = smallBag();
    bag = recordAcquisition(bag, A);
    expect(bagWeight(bag, A)).toBe(1);
    bag = recordAcquisition(bag, A);
    bag = recordAcquisition(bag, A);
    expect(bagWeight(bag, A)).toBe(0);
    expect(bagSize(bag)).toBe(3);
    expect(takeFromBag(bag, A)).toBeNull();
    expect(recordAcquisition(bag, OUTSIDE)).toBe(bag);
  });
});

describe("drawFromBag", () => {
  it("draws without replacement until the bag is empty", () => {
    let bag = smallBag();
    const drawn = new Map<CardId, number>();
    const random = makeRng(11);
    for (let draw = 0; draw < 5; draw += 1) {
      const result = drawFromBag(bag, random);
      if (result === null) throw new Error("bag emptied early");
      bag = result.bag;
      drawn.set(result.cardId, (drawn.get(result.cardId) ?? 0) + 1);
      expect(result.remaining).toBe(bagWeight(bag, result.cardId));
      expect(result.bagSize).toBe(4 - draw);
    }
    expect(Object.fromEntries(drawn)).toEqual({ [A]: 2, [B]: 1, [C]: 2 });
    expect(drawFromBag(bag, random)).toBeNull();
  });

  it("never draws a card whose acquisitions already met its target", () => {
    let bag = recordAcquisition(smallBag(), B);
    const random = makeRng(3);
    for (let draw = 0; draw < 4; draw += 1) {
      const result = drawFromBag(bag, random);
      expect(result?.cardId).not.toBe(B);
      if (result === null) break;
      bag = result.bag;
    }
    expect(drawFromBag(bag, random)).toBeNull();
  });
});

describe("sampleBagOffer", () => {
  it("never shows a card more than w(c) times and removes nothing", () => {
    const bag = recordAcquisition(smallBag(), A);
    for (let seed = 0; seed < 20; seed += 1) {
      const offer = sampleBagOffer(bag, 10, makeRng(seed));
      expect(offer).toHaveLength(bagSize(bag));
      for (const cardId of [A, B, C]) {
        expect(offer.filter((id) => id === cardId).length).toBeLessThanOrEqual(
          bagWeight(bag, cardId),
        );
      }
    }
    expect(bagSize(bag)).toBe(4);
  });

  it("offers at most the requested count", () => {
    expect(sampleBagOffer(smallBag(), 2, makeRng(1))).toHaveLength(2);
  });
});
