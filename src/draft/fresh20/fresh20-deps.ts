// Helper for assembling the {@link Fresh20Deps} the draft engine needs whenever
// it rolls and ranks a fresh pack. The engine throws on a `mode:"fresh20"` state
// if these deps are missing, so every fresh20-capable call site funnels through
// here. Pool- and replay-mode call sites pass `undefined` and the engine ignores
// it. Returns `undefined` when there is no fit model (the run then falls back to
// the pool draft, mirroring how replay degrades without a model).

import { DEFAULT_DRAFT_CONFIG } from "../draft-engine";
import type { Fresh20Deps } from "./fresh20-offer";
import type { FitModel } from "../replay/fit-model";
import type { CardData } from "../../types/cards";
import type { DeckEntry } from "../../types/journey";

/**
 * Build the {@link Fresh20Deps} for the given deck, fit model, and card
 * database, or `undefined` when there is no fit model. The full deck is passed
 * straight through so the fit ranking reflects everything the player has
 * drafted; the random-pack universe is every card number in the database.
 */
export function fresh20DepsFor(
  deck: readonly DeckEntry[],
  fitModel: FitModel | undefined,
  cardDatabase: Map<number, CardData>,
): Fresh20Deps | undefined {
  if (fitModel === undefined) return undefined;
  return {
    deckCardNumbers: deck.map((entry) => entry.cardNumber),
    fitModel,
    offerSize: DEFAULT_DRAFT_CONFIG.packSize,
    allCardNumbers: [...cardDatabase.keys()],
  };
}
