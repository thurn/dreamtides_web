import type { ForwardModel, AiCard } from "../forward-model";
import type { StarterCardModel } from "./index";
import { characterCanPlay, drawTopCard, playCharacterToBackRank } from "./helpers";

/**
 * #514 Final Witness (Character, 3●, 2✦) — "▸Dissolved: Draw a card."
 * (`battle_ai.md` §"The AI Deck"). A value trader: when it dies the AI draws,
 * so the evaluation discounts losing it in combat.
 */
export const finalWitness: StarterCardModel = {
  cardNumber: 514,
  canPlay(model: ForwardModel, self: AiCard): boolean {
    return characterCanPlay(model, self);
  },
  chooseTargets(): null {
    return null;
  },
  play(model: ForwardModel, self: AiCard): void {
    playCharacterToBackRank(model, self);
  },
  onDissolved(model: ForwardModel): void {
    drawTopCard(model);
  },
};
