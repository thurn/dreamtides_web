import type { ForwardModel, AiCard } from "../forward-model";
import type { StarterCardModel } from "./index";
import { drawTopCard, foresee, playEvent } from "./helpers";

/**
 * #517 Glimpse of the Past (Event, 1●) — "Draw a card, then foresee 1."
 * (`battle_ai.md` §"The AI Deck"). A cantrip / dig: draws the top card, then
 * foresees the new top to bin a poor fit (see {@link foresee}).
 */
export const glimpseOfThePast: StarterCardModel = {
  cardNumber: 517,
  canPlay(model: ForwardModel, self: AiCard): boolean {
    return model.aiEnergy >= self.energyCost;
  },
  chooseTargets(): null {
    return null;
  },
  play(model: ForwardModel, self: AiCard): void {
    playEvent(model, self, () => {
      drawTopCard(model);
      foresee(model, 1);
    });
  },
};
