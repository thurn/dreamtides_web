import type { ForwardModel, AiCard } from "../forward-model";
import type { StarterCardModel } from "./index";
import { characterCanPlay, playCharacterToReserve } from "./helpers";

/**
 * #510 Twilight Minstrel (Character, 2●, 1✦) — "Support – Supported characters
 * have +2✦." (`battle_ai.md` §"The AI Deck"). A back-rank anchor: it grants a
 * flat +2✦ to every front ally in the deploy slots its reserve slot supports,
 * resolved through {@link buildSupportContribution}.
 */
export const twilightMinstrel: StarterCardModel = {
  cardNumber: 510,
  canPlay(model: ForwardModel, self: AiCard): boolean {
    return characterCanPlay(model, self);
  },
  chooseTargets(): null {
    return null;
  },
  play(model: ForwardModel, self: AiCard): void {
    playCharacterToReserve(model, self);
  },
  supportSpark(): number {
    return 2;
  },
};
