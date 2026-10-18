// The D97 deck-editing events (cases in ../d97-deck.ts). Unkeyed: equipping
// and unequipping the same copy may repeat any number of times.

import { d97OwnedCopyIdFromUnknown } from "../../../types/identifiers";
import { equipCopy, unequipCopy } from "../d97-deck";
import { d97Event, payloadOf } from "./spec";

const copyPayload = payloadOf({ copyId: d97OwnedCopyIdFromUnknown });

export const DECK_EVENTS = {
  D97_EQUIP_COPY: d97Event({ phase: "overworld", parse: copyPayload, fold: equipCopy }),
  D97_UNEQUIP_COPY: d97Event({ phase: "overworld", parse: copyPayload, fold: unequipCopy }),
};
