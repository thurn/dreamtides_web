import type { ForwardModel, AiCard } from "../forward-model";
import type { StarterCardModel } from "./index";
import { characterCanPlay, playCharacterToBackRank } from "./helpers";

/**
 * #513 Runebound Champion (Character, 5●, 3✦) — "▸Dawn: Gain 1⍟."
 * (`battle_ai.md` §"The AI Deck"). An inevitability engine: each Dawn it
 * scores a point, so its value rises the longer the game runs.
 */
export const runeboundChampion: StarterCardModel = {
  cardNumber: 513,
  canPlay(model: ForwardModel, self: AiCard): boolean {
    return characterCanPlay(model, self);
  },
  chooseTargets(): null {
    return null;
  },
  play(model: ForwardModel, self: AiCard): void {
    playCharacterToBackRank(model, self);
  },
  onDawn(model: ForwardModel): void {
    model.aiScore += 1;
  },
};
