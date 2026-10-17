// The D97 shop contract over synthetic content: the first open rolls one
// distinct card per slot within its rarity ceiling, with fixed quotes, and a
// later open keeps the stock; buying pays the quote once, records the price
// and enters the reserve; selling pays the guarded sale quote and is refused
// at the collection floor; one paid restock per visit re-rolls every slot.
// The full contract runs at the default synthetic dream's shop; a run in
// each registered dream opens its own dream's shop.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { D97_COLLECTION } from "../../content/d97/collection";
import { D97_ENCOUNTERS } from "../../content/d97/encounters";
import { D97_SHOP } from "../../content/d97/shop";
import { findCopy } from "../../d97/collection/collection";
import { restockPrice, shopSlotCount, slotCeiling } from "../../d97/shop/pricing";
import { eventRng } from "../../eventlog/rng";
import type { Genesis } from "../../eventlog/types";
import { testAvatarId } from "../../types/test-identities";
import { genesisFoldState, type FoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import { ctx, event, GENESIS } from "../reducer-fixtures";
import { d97ContentProvider, registerD97ContentProvider } from "./d97-content";
import { syntheticD97Content } from "./d97-content.fixtures";
import { SYNTHETIC_DREAM_A, SYNTHETIC_DREAM_B } from "./d97-dreams.fixtures";
import { shopSaleQuote } from "./d97-shop";
import type { D97Run, D97Shop } from "./d97-state";

const D97_GENESIS: Genesis = { ...GENESIS, mode: "d97" };
const AVATAR = testAvatarId("d97-shop-avatar");
const SHOP = SYNTHETIC_DREAM_A.topology.shopAnchorId;
let seq = 0;

function apply(state: FoldState, type: string, payload: Record<string, unknown>) {
  seq += 1;
  return reduceGameEvent(state, event(type as never, payload), ctx({ seq, rng: eventRng(D97_GENESIS.seed, seq) }));
}

function applied(state: FoldState, type: string, payload: Record<string, unknown>) {
  const result = apply(state, type, payload);
  expect(result.outcome).toBe("applied");
  return result;
}

function runOf(state: FoldState): D97Run {
  const run = state.d97?.run;
  if (run === undefined || run === null) throw new Error("no D97 run");
  return run;
}

function shopOf(state: FoldState): D97Shop {
  const shop = runOf(state).shops[SHOP];
  if (shop === undefined) throw new Error("no shop");
  return shop;
}

function withRun(state: FoldState, edit: (run: D97Run) => D97Run): FoldState {
  return { ...state, d97: { ...state.d97!, run: edit(runOf(state)) } };
}

function opened(): FoldState {
  const started = apply(genesisFoldState(D97_GENESIS), "D97_START_RUN", { avatarId: AVATAR }).state;
  return applied(withRun(started, (run) => ({ ...run, essence: 5000 })), "D97_OPEN_SHOP", { anchorId: SHOP }).state;
}

beforeEach(() => {
  seq = 0;
  registerD97ContentProvider(syntheticD97Content({ avatarIds: [AVATAR], poolSize: 40 }));
});

afterEach(() => {
  registerD97ContentProvider(null);
});

describe("D97_OPEN_SHOP", () => {
  it("rolls one distinct card per slot within its ceiling, and keeps the stock on later opens", () => {
    const state = opened();
    const shop = shopOf(state);
    const content = d97ContentProvider()!;
    expect(shop.slots).toHaveLength(shopSlotCount(D97_SHOP.priceBand, D97_SHOP));
    expect(new Set(shop.slots.map((slot) => slot.cardId)).size).toBe(shop.slots.length);
    shop.slots.forEach((slot, index) => {
      const rarity = content.cardPriceFacts(slot.cardId)!.rarity;
      expect(D97_ENCOUNTERS.rarityCost[rarity]).toBeLessThanOrEqual(slotCeiling(index, D97_SHOP));
      expect(slot.price).toBeGreaterThanOrEqual(D97_SHOP.minQuote);
      expect(slot.purchased).toBe(false);
    });
    const again = applied(state, "D97_OPEN_SHOP", { anchorId: SHOP });
    expect(shopOf(again.state)).toEqual(shop);
    expect(again.logRecords?.[0]).toMatchObject({ event: "d97_shop_opened", fields: { firstOpen: false } });
  });

  it("bounces for an anchor that is not the dream's shop", () => {
    const started = apply(genesisFoldState(D97_GENESIS), "D97_START_RUN", { avatarId: AVATAR }).state;
    expect(apply(started, "D97_OPEN_SHOP", { anchorId: SYNTHETIC_DREAM_A.topology.waypointAnchorId }).outcome).toBe("bounced");
  });

  it.each([SYNTHETIC_DREAM_A, SYNTHETIC_DREAM_B].map((dream) => [dream.id, dream] as const))("opens dream %s's shop for a run there, and no other anchor of its topology", (_id, dream) => {
    const started = apply(genesisFoldState(D97_GENESIS), "D97_START_RUN", { avatarId: AVATAR, dreamId: dream.id }).state;
    const result = applied(started, "D97_OPEN_SHOP", { anchorId: dream.topology.shopAnchorId });
    expect(runOf(result.state).shops[dream.topology.shopAnchorId]?.slots.length).toBeGreaterThan(0);
    expect(apply(started, "D97_OPEN_SHOP", { anchorId: dream.topology.exitDoorAnchorId }).outcome).toBe("bounced");
  });
});

describe("D97_BUY_SHOP_CARD", () => {
  it("pays the quote once and adds a reserve copy with its price", () => {
    const state = opened();
    const slot = shopOf(state).slots[0];
    const before = runOf(state);
    const bought = applied(state, "D97_BUY_SHOP_CARD", { anchorId: SHOP, slotIndex: 0 });
    const run = runOf(bought.state);
    const copy = run.collection.copies[run.collection.copies.length - 1];
    expect(copy).toMatchObject({ cardId: slot.cardId, zone: "reserve", provenance: { channel: "shop", price: slot.price } });
    expect(run.essence).toBe(before.essence - slot.price);
    expect(shopOf(bought.state).slots[0]?.purchased).toBe(true);
    expect(apply(bought.state, "D97_BUY_SHOP_CARD", { anchorId: SHOP, slotIndex: 0 }).outcome).toBe("bounced");
  });

  it("refuses an unaffordable slot", () => {
    const poor = withRun(opened(), (run) => ({ ...run, essence: 0 }));
    expect(apply(poor, "D97_BUY_SHOP_CARD", { anchorId: SHOP, slotIndex: 0 }).outcome).toBe("bounced");
  });
});

describe("D97_SELL_COPY", () => {
  it("sells a bought copy for no more than it cost (the resale guard)", () => {
    const state = applied(opened(), "D97_BUY_SHOP_CARD", { anchorId: SHOP, slotIndex: 0 }).state;
    const run = runOf(state);
    const copy = run.collection.copies[run.collection.copies.length - 1];
    const price = shopSaleQuote(run, copy.copyId, d97ContentProvider()!)!;
    expect(price).toBeLessThanOrEqual(copy.provenance.price!);
    const sold = applied(state, "D97_SELL_COPY", { anchorId: SHOP, copyId: copy.copyId });
    expect(findCopy(runOf(sold.state).collection, copy.copyId)).toBeNull();
    expect(runOf(sold.state).essence).toBe(run.essence + price);
    expect(sold.logRecords?.[0]).toMatchObject({ event: "d97_shop_copy_sold", fields: { copyId: copy.copyId, price, channel: "shop" } });
  });

  it("refuses a sale that would cross the collection floor", () => {
    const atFloor = withRun(opened(), (run) => ({
      ...run,
      collection: { ...run.collection, copies: run.collection.copies.slice(0, D97_COLLECTION.collectionFloor) },
    }));
    const copyId = runOf(atFloor).collection.copies[0].copyId;
    expect(apply(atFloor, "D97_SELL_COPY", { anchorId: SHOP, copyId }).outcome).toBe("bounced");
    const above = withRun(opened(), (run) => run);
    expect(runOf(above).collection.copies.length).toBeGreaterThan(D97_COLLECTION.collectionFloor);
    expect(apply(above, "D97_SELL_COPY", { anchorId: SHOP, copyId: runOf(above).collection.copies[0].copyId }).outcome).toBe("applied");
  });

  it("refuses to sell a deck copy at the minimum deck size, and sells reserve copies", () => {
    const atMinimum = withRun(opened(), (run) => {
      let deck = 0;
      const copies = run.collection.copies.map((copy) =>
        copy.zone === "deck" && (deck += 1) > D97_COLLECTION.minimumDeckSize ? { ...copy, zone: "reserve" as const } : copy,
      );
      return { ...run, collection: { ...run.collection, copies } };
    });
    const copies = runOf(atMinimum).collection.copies;
    expect(copies.filter((copy) => copy.zone === "deck")).toHaveLength(D97_COLLECTION.minimumDeckSize);
    const deckCopy = copies.find((copy) => copy.zone === "deck")!;
    expect(apply(atMinimum, "D97_SELL_COPY", { anchorId: SHOP, copyId: deckCopy.copyId }).outcome).toBe("bounced");
    const reserveCopy = copies.find((copy) => copy.zone === "reserve")!;
    expect(apply(atMinimum, "D97_SELL_COPY", { anchorId: SHOP, copyId: reserveCopy.copyId }).outcome).toBe("applied");
  });
});

describe("D97_RESTOCK_SHOP", () => {
  it("re-rolls every slot for its price once per visit", () => {
    const state = applied(opened(), "D97_BUY_SHOP_CARD", { anchorId: SHOP, slotIndex: 1 }).state;
    const before = runOf(state);
    const restocked = applied(state, "D97_RESTOCK_SHOP", { anchorId: SHOP });
    const shop = shopOf(restocked.state);
    expect(runOf(restocked.state).essence).toBe(before.essence - restockPrice(D97_SHOP.priceBand, D97_SHOP));
    expect(shop.restockedThisVisit).toBe(true);
    expect(shop.rolls).toBe(2);
    expect(shop.slots.every((slot) => !slot.purchased)).toBe(true);
    expect(apply(restocked.state, "D97_RESTOCK_SHOP", { anchorId: SHOP }).outcome).toBe("bounced");
  });

  it("refuses a restock the player cannot afford", () => {
    const poor = withRun(opened(), (run) => ({ ...run, essence: 0 }));
    expect(apply(poor, "D97_RESTOCK_SHOP", { anchorId: SHOP }).outcome).toBe("bounced");
  });
});
