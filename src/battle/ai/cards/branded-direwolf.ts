import type { ForwardModel, AiCard } from "../forward-model";
import type { StarterCardModel } from "./index";
import { characterCanPlay, playCharacterToReserve } from "./helpers";

/**
 * #512 Branded Direwolf (Character, 4●, 4✦) — vanilla (`battle_ai.md`
 * §"The AI Deck"). An efficient beater with no triggers or statics; the
 * cleanest challenger in the pool.
 */
export const brandedDirewolf: StarterCardModel = {
  cardNumber: 512,
  canPlay(model: ForwardModel, self: AiCard): boolean {
    return characterCanPlay(model, self);
  },
  chooseTargets(): null {
    return null;
  },
  play(model: ForwardModel, self: AiCard): void {
    playCharacterToReserve(model, self);
  },
};
