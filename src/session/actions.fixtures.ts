// The Augury decline request the game actions facade tests share.

import { parseOfferId } from "../types/identifiers";
import { parseStableDigest } from "../types/stable-digest";

export const AUGURY_DECLINE = {
  encounterSignature: parseStableDigest("a".repeat(64)),
  offerId: parseOfferId("offer-1"),
};
