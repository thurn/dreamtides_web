import { supportingReserveSlots } from "../../engine/support";
import { DEPLOY_SLOT_IDS } from "../../types";
import type { ForwardModel, AiCard } from "../forward-model";
import type { StarterCardModel } from "./index";
import { characterCanPlay, playCharacterToReserve } from "./helpers";

/**
 * #515 Wildflower Colossus (Character, 6●, 6✦) — "This character has +2✦ for
 * each supporting ally." (`battle_ai.md` §"The AI Deck"). A finisher/payoff:
 * the buff scales with how many occupied reserve slots support the deploy slot
 * it stands in.
 */
export const wildflowerColossus: StarterCardModel = {
  cardNumber: 515,
  canPlay(model: ForwardModel, self: AiCard): boolean {
    return characterCanPlay(model, self);
  },
  chooseTargets(): null {
    return null;
  },
  play(model: ForwardModel, self: AiCard): void {
    playCharacterToReserve(model, self);
  },
  selfStaticSpark(model: ForwardModel, self: AiCard): number {
    const deploySlot = DEPLOY_SLOT_IDS.find(
      (slot) => model.aiDeployed[slot]?.battleCardId === self.battleCardId,
    );
    if (deploySlot === undefined) {
      return 0;
    }
    const supporters = supportingReserveSlots(deploySlot).filter(
      (reserveSlot) => model.aiReserve[reserveSlot] !== null,
    ).length;
    return 2 * supporters;
  },
};
