// Dreamtides 97 collection rules (README § "Collection and deck"). Pure
// functions over the stored collection: an active deck and a reserve, a
// minimum deck size, a collection floor, and no per-card copy cap. The limits
// arrive as arguments from the `src/content/d97/` catalog.

import { sha256 } from "js-sha256";
import type { CardId } from "../../types/card-identity";
import {
  parseD97OwnedCopyId,
  type D97OwnedCopyId,
  type D97RunSeed,
} from "../../types/identifiers";
import type {
  D97Collection,
  D97CopyProvenance,
  D97CopyZone,
  D97OwnedCopy,
} from "./types";

/** A collection with no copies. */
export function emptyCollection(): D97Collection {
  return { copies: [], nextCopyOrdinal: 0 };
}

/**
 * The owned-copy UUID for one acquisition: derived from the run seed and the
 * collection's acquisition ordinal, so every fold of the log mints the same id.
 */
export function ownedCopyId(
  runSeed: D97RunSeed,
  ordinal: number,
): D97OwnedCopyId {
  const hex = sha256(`${runSeed}|owned-copy|${String(ordinal)}`);
  const variant = ((Number.parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8)
    .toString(16);
  return parseD97OwnedCopyId(
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-` +
      `${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`,
  );
}

/** The copies in one zone, in acquisition order. */
export function copiesInZone(
  collection: D97Collection,
  zone: D97CopyZone,
): D97OwnedCopy[] {
  return collection.copies.filter((copy) => copy.zone === zone);
}

/** The number of copies in the active deck. */
export function deckSize(collection: D97Collection): number {
  return copiesInZone(collection, "deck").length;
}

/** The owned copy with `copyId`, or null. */
export function findCopy(
  collection: D97Collection,
  copyId: D97OwnedCopyId,
): D97OwnedCopy | null {
  return collection.copies.find((copy) => copy.copyId === copyId) ?? null;
}

/**
 * Add one newly acquired copy of `cardId` in `zone`: new copies enter the
 * reserve, except the starting collection, which starts in the deck.
 */
export function acquireCopy(
  collection: D97Collection,
  args: {
    runSeed: D97RunSeed;
    cardId: CardId;
    provenance: D97CopyProvenance;
    zone: D97CopyZone;
  },
): { collection: D97Collection; copy: D97OwnedCopy } {
  const copy: D97OwnedCopy = {
    copyId: ownedCopyId(args.runSeed, collection.nextCopyOrdinal),
    cardId: args.cardId,
    zone: args.zone,
    modifications: [],
    provenance: args.provenance,
  };
  return {
    collection: {
      copies: [...collection.copies, copy],
      nextCopyOrdinal: collection.nextCopyOrdinal + 1,
    },
    copy,
  };
}

function moveCopy(
  collection: D97Collection,
  copyId: D97OwnedCopyId,
  zone: D97CopyZone,
): D97Collection {
  return {
    ...collection,
    copies: collection.copies.map((copy) =>
      copy.copyId === copyId ? { ...copy, zone } : copy,
    ),
  };
}

/** Move a reserve copy into the deck, or null for an unknown or deck copy. */
export function equipCopy(
  collection: D97Collection,
  copyId: D97OwnedCopyId,
): D97Collection | null {
  if (findCopy(collection, copyId)?.zone !== "reserve") return null;
  return moveCopy(collection, copyId, "deck");
}

/** Whether one more copy may leave the deck without breaking its minimum. */
export function canUnequip(
  collection: D97Collection,
  minimumDeckSize: number,
): boolean {
  return deckSize(collection) > minimumDeckSize;
}

/**
 * Move a deck copy into the reserve, or null for an unknown or reserve copy,
 * or when the deck would drop below `minimumDeckSize`.
 */
export function unequipCopy(
  collection: D97Collection,
  copyId: D97OwnedCopyId,
  minimumDeckSize: number,
): D97Collection | null {
  if (findCopy(collection, copyId)?.zone !== "deck") return null;
  if (!canUnequip(collection, minimumDeckSize)) return null;
  return moveCopy(collection, copyId, "reserve");
}

/**
 * Remove owned copies (selling, delivering, a purge cost), or null when any
 * id is unknown or repeated, or when the collection would drop below
 * `collectionFloor`.
 */
export function removeCopies(
  collection: D97Collection,
  copyIds: readonly D97OwnedCopyId[],
  collectionFloor: number,
): D97Collection | null {
  const removing = new Set(copyIds);
  if (removing.size !== copyIds.length) return null;
  if (copyIds.some((copyId) => findCopy(collection, copyId) === null)) {
    return null;
  }
  if (collection.copies.length - removing.size < collectionFloor) return null;
  return {
    ...collection,
    copies: collection.copies.filter((copy) => !removing.has(copy.copyId)),
  };
}
