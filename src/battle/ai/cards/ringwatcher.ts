import type { ForwardModel, AiCard } from "../forward-model";
import type { StarterCardModel } from "./index";
import { characterCanPlay, playCharacterToBackRank } from "./helpers";

/**
 * Starter character #511. Its rules text is resolved manually; the AI model
 * handles only playing and positioning the body.
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
};
