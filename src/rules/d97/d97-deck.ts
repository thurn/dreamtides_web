// The D97 deck-editing cases: equipping a reserve copy into the active deck
// and unequipping a deck copy into the reserve. Equipping is free and changes
// no ownership; unequipping never takes the deck below its minimum.

import { D97_COLLECTION } from "../../content/d97/collection";
import {
  deckSize,
  equipCopy as equipInCollection,
  findCopy,
  unequipCopy as unequipInCollection,
} from "../../d97/collection/collection";
import type { D97Collection } from "../../d97/collection/types";
import type { D97OwnedCopyId } from "../../types/identifiers";
import type { D97Transition } from "./d97-run";
import type { D97RunInput } from "./events/spec";

/** A deck edit's payload: the copy it moves. */
type CopyPayload = { readonly copyId: D97OwnedCopyId };

function editDeck(
  { d97, run }: D97RunInput,
  { copyId }: CopyPayload,
  event: "d97_copy_equipped" | "d97_copy_unequipped",
  edit: (
    collection: D97Collection,
    copyId: D97OwnedCopyId,
  ) => D97Collection | null,
): D97Transition | null {
  const collection = edit(run.collection, copyId);
  const copy = collection === null ? null : findCopy(collection, copyId);
  if (collection === null || copy === null) return null;
  return {
    d97: { ...d97, run: { ...run, collection } },
    logRecords: [
      {
        event,
        fields: {
          runId: run.runId,
          copyId,
          cardId: copy.cardId,
          deckSize: deckSize(collection),
          collectionSize: collection.copies.length,
        },
      },
    ],
  };
}

/** `D97_EQUIP_COPY { copyId }`: move a reserve copy into the deck. */
export function equipCopy(input: D97RunInput, payload: CopyPayload): D97Transition | null {
  return editDeck(input, payload, "d97_copy_equipped", equipInCollection);
}

/**
 * `D97_UNEQUIP_COPY { copyId }`: move a deck copy into the reserve, refused
 * when the deck is at its minimum size.
 */
export function unequipCopy(input: D97RunInput, payload: CopyPayload): D97Transition | null {
  return editDeck(input, payload, "d97_copy_unequipped", (collection, copyId) =>
    unequipInCollection(collection, copyId, D97_COLLECTION.minimumDeckSize),
  );
}
