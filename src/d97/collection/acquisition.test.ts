// Acquisition contract (decision P29): every channel adds one owned copy to
// the collection and counts it against the reward bag; a copy the bag supplied
// logs one `d97_bag_draw` record; a bag draw the bag cannot supply changes
// nothing; a named card outside the bag is acquired and leaves the bag as is.

import { describe, expect, it } from "vitest";
import { makeRng } from "../../draft/pool/rng";
import type { CardId } from "../../types/card-identity";
import { testCardId } from "../../types/test-identities";
import {
  acquireForRun,
  type D97AcquiringRun,
  type D97AcquisitionRequest,
  type D97AcquisitionSource,
} from "./acquisition";
import { testAcquiringRun } from "./collection.fixtures";
import { ownedCopyId } from "./collection";
import { bagSize, bagWeight, pickFromBag } from "./reward-bag";
import type { D97RewardBag } from "./types";

const A = testCardId("acquire-a");
const B = testCardId("acquire-b");
const C = testCardId("acquire-c");
const OUTSIDE = testCardId("acquire-outside");

function smallRun(): D97AcquiringRun {
  return {
    ...testAcquiringRun([
      { cardId: A, copies: 2 },
      { cardId: B, copies: 1 },
      { cardId: C, copies: 2 },
    ]),
    battlesFought: 3,
  };
}

function acquiredCount(bag: D97RewardBag, cardId: CardId): number {
  return bag.entries.find((entry) => entry.cardId === cardId)?.acquired ?? 0;
}

const CHANNELS: readonly D97AcquisitionRequest<D97AcquisitionSource>[] = [
  { cardId: A, channel: "starting", zone: "deck", source: "draw" },
  { cardId: A, channel: "starting", zone: "deck", source: "named" },
  { cardId: A, channel: "bag", zone: "reserve", source: "named" },
  { cardId: A, channel: "ante", zone: "reserve", source: "named" },
  { cardId: A, channel: "bundle", zone: "reserve", source: "draw" },
  { cardId: A, channel: "shop", price: 120, zone: "reserve", source: "named" },
];

describe("acquireForRun", () => {
  it.each(CHANNELS)(
    "adds the copy and counts it against the bag: $channel ($source)",
    (request) => {
      const run = smallRun();
      const acquired = acquireForRun(run, request);
      if (acquired === null) throw new Error("the bag held the card");
      const { collection, bag } = acquired.run;
      expect(collection.copies).toEqual([acquired.copy]);
      expect(collection.nextCopyOrdinal).toBe(1);
      expect(acquired.copy).toEqual({
        copyId: ownedCopyId(run.runSeed, 0),
        cardId: A,
        zone: request.zone,
        modifications: [],
        provenance: {
          channel: request.channel,
          battleCount: 3,
          ...(request.channel === "shop" ? { price: request.price } : {}),
        },
      });
      expect(acquiredCount(bag, A)).toBe(1);
      expect(bagWeight(bag, A)).toBe(1);
      expect(acquired.logRecords).toEqual([
        {
          event: "d97_bag_draw",
          fields: {
            runId: run.runId,
            avatarId: run.bag.avatarId,
            cardId: A,
            remaining: 1,
            bagSize: 4,
          },
        },
      ]);
    },
  );

  it("acquires a named card the bag lacks without changing the bag or logging", () => {
    const run = smallRun();
    const acquired = acquireForRun(run, {
      cardId: OUTSIDE,
      channel: "ante",
      zone: "reserve",
      source: "named",
    });
    expect(acquired.run.collection.copies).toHaveLength(1);
    expect(acquired.run.bag).toBe(run.bag);
    expect(acquired.logRecords).toEqual([]);
  });

  it("keeps counting a named card past its target without logging", () => {
    let run = smallRun();
    for (let copy = 0; copy < 2; copy += 1) {
      run = acquireForRun(run, { cardId: B, channel: "bag", zone: "reserve", source: "named" }).run;
    }
    expect(acquiredCount(run.bag, B)).toBe(2);
    expect(bagWeight(run.bag, B)).toBe(0);
    expect(run.collection.copies).toHaveLength(2);
    const third = acquireForRun(run, { cardId: B, channel: "shop", price: 50, zone: "reserve", source: "named" });
    expect(acquiredCount(third.run.bag, B)).toBe(3);
    expect(third.logRecords).toEqual([]);
  });

  it("refuses a draw the bag cannot supply", () => {
    let run = smallRun();
    run = acquireForRun(run, { cardId: B, channel: "bag", zone: "reserve", source: "named" }).run;
    for (const cardId of [B, OUTSIDE]) {
      expect(acquireForRun(run, { cardId, channel: "bundle", zone: "reserve", source: "draw" })).toBeNull();
    }
  });

  it("draws bundle copies without replacement until the bag is empty", () => {
    let run = smallRun();
    const random = makeRng(11);
    for (let draw = 0; draw < 5; draw += 1) {
      const cardId = pickFromBag(run.bag, random);
      if (cardId === null) throw new Error("bag emptied early");
      const acquired = acquireForRun(run, { cardId, channel: "bundle", zone: "reserve", source: "draw" });
      if (acquired === null) throw new Error("picked a card the bag lacks");
      run = acquired.run;
      expect(bagSize(run.bag)).toBe(4 - draw);
    }
    expect(run.collection.copies.map((copy) => copy.cardId).sort()).toEqual([A, A, B, C, C].sort());
    expect(pickFromBag(run.bag, random)).toBeNull();
  });
});
