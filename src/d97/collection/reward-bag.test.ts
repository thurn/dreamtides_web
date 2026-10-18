// Reward bag v0 contract: copy targets equal the dealt counts; `w` falls with
// every acquisition from any channel and never goes negative; draw picks never
// pick a card the bag no longer holds; offers sample without removing and
// never show a card more than `w(c)` times.

import { describe, expect, it } from "vitest";
import { makeRng } from "../../draft/pool/rng";
import type { CardId } from "../../types/card-identity";
import { testAvatarId, testCardId } from "../../types/test-identities";
import { acquireForRun } from "./acquisition";
import { testAcquiringRun } from "./collection.fixtures";
import {
  bagSize,
  bagWeight,
  createRewardBag,
  pickFromBag,
  sampleBagOffer,
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

/** `bag` after acquiring one copy of `cardId` through a named channel. */
function afterAcquiring(bag: D97RewardBag, cardId: CardId): D97RewardBag {
  return acquireForRun(
    { ...testAcquiringRun(), bag },
    { cardId, channel: "ante", zone: "reserve", source: "named" },
  ).run.bag;
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
    bag = afterAcquiring(bag, A);
    expect(bagWeight(bag, A)).toBe(1);
    bag = afterAcquiring(bag, A);
    bag = afterAcquiring(bag, A);
    expect(bagWeight(bag, A)).toBe(0);
    expect(bagSize(bag)).toBe(3);
    expect(afterAcquiring(bag, OUTSIDE)).toBe(bag);
  });
});

describe("pickFromBag", () => {
  it("picks only cards the bag still holds and removes nothing", () => {
    const bag = afterAcquiring(smallBag(), B);
    for (let seed = 0; seed < 20; seed += 1) {
      expect(pickFromBag(bag, makeRng(seed))).not.toBe(B);
    }
    expect(bagSize(bag)).toBe(4);
  });

  it("picks nothing from an empty bag", () => {
    let bag = smallBag();
    for (const cardId of [A, A, B, C, C]) bag = afterAcquiring(bag, cardId);
    expect(pickFromBag(bag, makeRng(1))).toBeNull();
  });
});

describe("sampleBagOffer", () => {
  it("never shows a card more than w(c) times and removes nothing", () => {
    const bag = afterAcquiring(smallBag(), A);
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
