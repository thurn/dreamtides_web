import type { ForwardModel, AiCard } from "../forward-model";
import type { StarterCardModel } from "./index";
import { characterCanPlay, playCharacterToBackRank } from "./helpers";

/**
 * Starter character #514. Its rules text is resolved manually; the AI model
 * handles only playing and positioning the body.
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
};
