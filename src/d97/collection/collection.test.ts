// Collection rules contract: new copies get deterministic UUIDs and land in
// the requested zone; equip and unequip move copies between zones; the
// minimum deck size refuses an unequip at the minimum; the collection floor
// refuses any removal that would cross it; there is no per-card copy cap.

import { describe, expect, it } from "vitest";
import { parseD97RunSeed } from "../../types/identifiers";
import { testCardId } from "../../types/test-identities";
import {
  acquireCopy,
  canUnequip,
  deckSize,
  emptyCollection,
  equipCopy,
  ownedCopyId,
  removeCopies,
  unequipCopy,
} from "./collection";
import type { D97Collection, D97CopyZone } from "./types";

const SEED = parseD97RunSeed("collection-seed");
const CARD = testCardId("collection-card");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function collectionOf(deck: number, reserve: number): D97Collection {
  let collection = emptyCollection();
  const zones: D97CopyZone[] = [
    ...Array<D97CopyZone>(deck).fill("deck"),
    ...Array<D97CopyZone>(reserve).fill("reserve"),
  ];
  for (const zone of zones) {
    collection = acquireCopy(collection, {
      runSeed: SEED,
      cardId: CARD,
      provenance: { channel: "bag", battleCount: 0 },
      zone,
    }).collection;
  }
  return collection;
}

describe("owned copies", () => {
  it("mints a distinct, deterministic UUID per acquisition", () => {
    expect(ownedCopyId(SEED, 0)).toMatch(UUID);
    expect(ownedCopyId(SEED, 0)).toBe(ownedCopyId(SEED, 0));
    expect(ownedCopyId(SEED, 1)).not.toBe(ownedCopyId(SEED, 0));
    const collection = collectionOf(3, 2);
    expect(new Set(collection.copies.map((copy) => copy.copyId)).size).toBe(5);
    expect(collection.nextCopyOrdinal).toBe(5);
  });

  it("holds any number of copies of one card", () => {
    const collection = collectionOf(40, 0);
    expect(deckSize(collection)).toBe(40);
    expect(collection.copies.every((copy) => copy.cardId === CARD)).toBe(true);
  });

  it("records provenance with a price for a bought copy", () => {
    const { copy } = acquireCopy(emptyCollection(), {
      runSeed: SEED,
      cardId: CARD,
      provenance: { channel: "bag", battleCount: 3, price: 120 },
      zone: "reserve",
    });
    expect(copy.provenance).toEqual({ channel: "bag", battleCount: 3, price: 120 });
    expect(copy.modifications).toEqual([]);
  });
});

describe("equip and unequip", () => {
  it("moves reserve copies into the deck and deck copies into the reserve", () => {
    const collection = collectionOf(26, 1);
    const reserveCopy = collection.copies[26];
    const deckCopy = collection.copies[0];
    if (reserveCopy === undefined || deckCopy === undefined) throw new Error();
    const equipped = equipCopy(collection, reserveCopy.copyId);
    expect(equipped === null ? null : deckSize(equipped)).toBe(27);
    const unequipped = unequipCopy(collection, deckCopy.copyId, 25);
    expect(unequipped === null ? null : deckSize(unequipped)).toBe(25);
    expect(equipCopy(collection, deckCopy.copyId)).toBeNull();
    expect(unequipCopy(collection, reserveCopy.copyId, 25)).toBeNull();
    expect(equipCopy(collection, ownedCopyId(SEED, 999))).toBeNull();
  });

  it("refuses to unequip at the minimum deck size", () => {
    const collection = collectionOf(25, 3);
    expect(canUnequip(collection, 25)).toBe(false);
    const deckCopy = collection.copies[0];
    if (deckCopy === undefined) throw new Error();
    expect(unequipCopy(collection, deckCopy.copyId, 25)).toBeNull();
    expect(canUnequip(collectionOf(26, 0), 25)).toBe(true);
  });
});

describe("removeCopies (the collection floor)", () => {
  it("refuses a removal that would take the collection below the floor", () => {
    const atFloor = collectionOf(25, 0);
    const first = atFloor.copies[0];
    if (first === undefined) throw new Error();
    expect(removeCopies(atFloor, [first.copyId], 25)).toBeNull();
    const above = collectionOf(25, 2);
    const [one, two, three] = above.copies;
    if (one === undefined || two === undefined || three === undefined) {
      throw new Error();
    }
    expect(removeCopies(above, [one.copyId, two.copyId], 25)?.copies).toHaveLength(25);
    expect(removeCopies(above, [one.copyId, two.copyId, three.copyId], 25)).toBeNull();
  });

  it("refuses unknown and repeated copies", () => {
    const collection = collectionOf(27, 0);
    const first = collection.copies[0];
    if (first === undefined) throw new Error();
    expect(removeCopies(collection, [ownedCopyId(SEED, 999)], 25)).toBeNull();
    expect(removeCopies(collection, [first.copyId, first.copyId], 25)).toBeNull();
  });
});
