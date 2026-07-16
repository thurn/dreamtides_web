import { supportedDeploySlots } from "../../engine/support";
import { rankSlotIds } from "../../types";
import type { ForwardModel } from "../forward-model";
import { starterCardModels } from "./index";

/**
 * Computes every card-keyed +✦ bonus currently active on the AI's board.
 *
 * Returns a map from a front-rank card's `battleCardId` to the total flat spark
 * bonus it receives from Support: for each occupied back-rank card whose
 *   model returns a `supportSpark` value `V`, add `V` to every occupied
 *   front-rank card sitting in a slot that back-rank card supports (per
 *   `supportedDeploySlots`).
 *
 * Each on-board card's behavior is looked up by `cardNumber` in
 * {@link starterCardModels}; cards without a registered model contribute
 * nothing. Cards that receive no bonus are simply absent from the map.
 *
 * The same map is consumed by the unified Challenge resolver's
 * `supportContribution` (`engine/challenge.ts`) and by board evaluation, so
 * support math stays in one place.
 */
export function buildSupportContribution(model: ForwardModel): Map<string, number> {
  const contribution = new Map<string, number>();
  const add = (battleCardId: string, amount: number): void => {
    if (amount === 0) {
      return;
    }
    contribution.set(battleCardId, (contribution.get(battleCardId) ?? 0) + amount);
  };

  // Support: back-rank cards buffing the front allies they cover.
  for (const backRankSlot of rankSlotIds(model.aiBackRank)) {
    const backRankCard = model.aiBackRank[backRankSlot];
    if (backRankCard === null) {
      continue;
    }
    const backRankModel = starterCardModels.get(backRankCard.cardNumber);
    const bonus = backRankModel?.supportSpark?.(model, backRankCard);
    if (bonus === undefined || bonus === null || bonus === 0) {
      continue;
    }
    for (const frontRankSlot of supportedDeploySlots(backRankSlot)) {
      const frontRankCard = model.aiFrontRank[frontRankSlot] ?? null;
      if (frontRankCard !== null) {
        add(frontRankCard.battleCardId, bonus);
      }
    }
  }

  return contribution;
}
