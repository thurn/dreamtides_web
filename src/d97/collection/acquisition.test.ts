// Acquisition contract (decision P29, Appendix A §A2): every channel adds one
// owned copy to the collection; a draw, or an offered card the active bag
// still holds, counts one copy in that Avatar's `drawn(c)` and logs one
// `d97_bag_draw` record; named cards (antes, Starter cards) never change `w`;
// a draw the bag cannot supply changes nothing; only the active Avatar's bag
// counts.

import { describe, expect, it } from "vitest";
import { makeRng } from "../../draft/pool/rng";
import { testAvatarId, testCardId } from "../../types/test-identities";
import {
  acquireForRun,
  type D97AcquiringRun,
  type D97AcquisitionRequest,
  type D97AcquisitionSource,
} from "./acquisition";
import { FIXTURE_AVATAR, testAcquiringRun, testBagContent, testPool } from "./collection.fixtures";
import { ownedCopyId } from "./collection";
import { activeRewardBag, bagSize, bagWeight, pickFromBag, rewardBagOf } from "./reward-bag";

const A = testCardId("acquire-a");
const B = testCardId("acquire-b");
const FACET = testCardId("acquire-facet");
const OUTSIDE = testCardId("acquire-outside");
const OTHER_AVATAR = testAvatarId("acquire-other-avatar");

// Synthetic stage 1: ring-1 capacity 2, ring-2 capacity 0.
const CONTENT = testBagContent([testPool(FIXTURE_AVATAR, [A, B], [FACET]), testPool(OTHER_AVATAR, [A, B], [FACET])]);

function smallRun(): D97AcquiringRun {
  return { ...testAcquiringRun(), battlesFought: 3 };
}

function weight(run: D97AcquiringRun, cardId: typeof A): number {
  return bagWeight(activeRewardBag(CONTENT, run), cardId);
}

const BAG_CHANNELS: readonly D97AcquisitionRequest<D97AcquisitionSource>[] = [
  { cardId: A, channel: "starting", zone: "deck", source: "draw" },
  { cardId: A, channel: "bundle", zone: "reserve", source: "draw" },
  { cardId: A, channel: "bag", zone: "reserve", source: "offer" },
  { cardId: A, channel: "shop", price: 120, zone: "reserve", source: "offer" },
];

describe("acquireForRun", () => {
  it.each(BAG_CHANNELS)("adds the copy and counts it against the active bag: $channel ($source)", (request) => {
    const run = smallRun();
    const acquired = acquireForRun(run, request, CONTENT);
    if (acquired === null) throw new Error("the bag held the card");
    const { collection, bags } = acquired.run;
    expect(collection.copies).toEqual([acquired.copy]);
    expect(collection.nextCopyOrdinal).toBe(1);
    expect(acquired.copy).toEqual({
      copyId: ownedCopyId(run.runSeed, 0),
      cardId: A,
      zone: request.zone,
      modifications: [],
      provenance: { channel: request.channel, battleCount: 3, ...(request.channel === "shop" ? { price: request.price } : {}) },
    });
    expect(bags.drawn).toEqual({ [FIXTURE_AVATAR]: { [A]: 1 } });
    expect(weight(acquired.run, A)).toBe(1);
    expect(acquired.logRecords).toEqual([
      {
        event: "d97_bag_draw",
        fields: { runId: run.runId, avatarId: FIXTURE_AVATAR, cardId: A, source: request.source, ring: 1, stage: 1, remaining: 1, bagSize: 3 },
      },
    ]);
  });

  it("never counts a named card, in the bag or not", () => {
    const run = smallRun();
    for (const cardId of [A, OUTSIDE]) {
      const acquired = acquireForRun(run, { cardId, channel: "ante", zone: "reserve", source: "named" }, CONTENT);
      expect(acquired.run.collection.copies).toHaveLength(1);
      expect(acquired.run.bags).toBe(run.bags);
      expect(acquired.logRecords).toEqual([]);
    }
  });

  it("acquires an offered card the bag no longer holds without counting it", () => {
    let run = smallRun();
    for (let copy = 0; copy < 2; copy += 1) run = acquireForRun(run, { cardId: B, channel: "bag", zone: "reserve", source: "offer" }, CONTENT).run;
    expect(weight(run, B)).toBe(0);
    const third = acquireForRun(run, { cardId: B, channel: "shop", price: 50, zone: "reserve", source: "offer" }, CONTENT);
    expect(third.run.collection.copies).toHaveLength(3);
    expect(third.run.bags).toBe(run.bags);
    expect(third.logRecords).toEqual([]);
  });

  it("refuses a draw the bag cannot supply: an exhausted card, a closed ring, a card outside the tide set", () => {
    let run = smallRun();
    for (let copy = 0; copy < 2; copy += 1) run = acquireForRun(run, { cardId: B, channel: "bag", zone: "reserve", source: "offer" }, CONTENT).run;
    for (const cardId of [B, FACET, OUTSIDE]) {
      expect(acquireForRun(run, { cardId, channel: "bundle", zone: "reserve", source: "draw" }, CONTENT)).toBeNull();
    }
  });

  it("counts only the active Avatar's bag; another Avatar's bag keeps its contents", () => {
    const run = acquireForRun(smallRun(), { cardId: A, channel: "bundle", zone: "reserve", source: "draw" }, CONTENT)!.run;
    expect(bagWeight(rewardBagOf(CONTENT, run.bags, FIXTURE_AVATAR), A)).toBe(1);
    expect(bagWeight(rewardBagOf(CONTENT, run.bags, OTHER_AVATAR), A)).toBe(2);
    const switched = acquireForRun({ ...run, avatarId: OTHER_AVATAR }, { cardId: A, channel: "bundle", zone: "reserve", source: "draw" }, CONTENT)!.run;
    expect(switched.bags.drawn).toEqual({ [FIXTURE_AVATAR]: { [A]: 1 }, [OTHER_AVATAR]: { [A]: 1 } });
    expect(bagWeight(rewardBagOf(CONTENT, switched.bags, FIXTURE_AVATAR), A)).toBe(1);
  });

  it("draws bundle copies without replacement until the bag is empty", () => {
    let run = smallRun();
    const random = makeRng(11);
    for (let draw = 0; draw < 4; draw += 1) {
      const cardId = pickFromBag(activeRewardBag(CONTENT, run), random);
      if (cardId === null) throw new Error("bag emptied early");
      const acquired = acquireForRun(run, { cardId, channel: "bundle", zone: "reserve", source: "draw" }, CONTENT);
      if (acquired === null) throw new Error("picked a card the bag lacks");
      run = acquired.run;
      expect(bagSize(activeRewardBag(CONTENT, run))).toBe(3 - draw);
    }
    expect(run.collection.copies.map((copy) => copy.cardId).sort()).toEqual([A, A, B, B].sort());
    expect(pickFromBag(activeRewardBag(CONTENT, run), random)).toBeNull();
  });
});
