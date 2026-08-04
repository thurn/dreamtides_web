// Helper for assembling the {@link ReplayDeps} the draft engine needs whenever
// it computes a replay offer. The engine throws on a `mode:"replay"` state if
// these deps are missing, so every replay-capable call site funnels through
// here. Pool-mode call sites pass `undefined` and the engine ignores it.

import { DEFAULT_DRAFT_CONFIG, type ReplayDeps } from "../draft-engine";
import type { FitModel } from "./fit-model";
import type { DeckEntry } from "../../types/journey";

/**
 * Build the {@link ReplayDeps} for the given deck and fit model, or `undefined`
 * when there is no fit model (pool mode, or replay content that failed to load
 * a model). The full deck is passed straight through: Dreamtides starter/Nightmare
 * cards are absent from the records corpus, so they carry ~0 fit weight, and
 * including them keeps the deck representation honest.
 */
export function replayDepsFor(
  deck: readonly DeckEntry[],
  fitModel: FitModel | undefined,
): ReplayDeps | undefined {
  if (fitModel === undefined) return undefined;
  return {
    deckCardNumbers: deck.map((entry) => entry.cardNumber),
    fitModel,
    offerSize: DEFAULT_DRAFT_CONFIG.packSize,
  };
}
