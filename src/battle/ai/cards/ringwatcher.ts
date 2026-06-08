import type { ForwardModel, AiCard } from "../forward-model";
import type { StarterCardModel } from "./index";
import { characterCanPlay, foresee, playCharacterToBackRank } from "./helpers";

/**
 * #511 Ringwatcher (Character, 3●, 1✦) — "▸Materialized: Foresee 1."
 * (`battle_ai.md` §"The AI Deck"). A filtering body: when it enters play the
 * AI foresees the top card, binning a poor fit to the bottom of the deck (see
 * {@link foresee} for the deterministic heuristic).
 */
export const ringwatcher: StarterCardModel = {
  cardNumber: 511,
  canPlay(model: ForwardModel, self: AiCard): boolean {
    return characterCanPlay(model, self);
  },
  chooseTargets(): null {
    return null;
  },
  play(model: ForwardModel, self: AiCard): void {
    playCharacterToBackRank(model, self);
  },
  onMaterialized(model: ForwardModel): void {
    foresee(model, 1);
  },
};
