import { supportedDeploySlots } from "../../engine/support";
import { DEPLOY_SLOT_IDS, RESERVE_SLOT_IDS } from "../../types";
import type { ForwardModel } from "../forward-model";
import { starterCardModels } from "./index";

/**
 * Computes every card-keyed +✦ bonus currently active on the AI's board.
 *
 * Returns a map from a deployed card's `battleCardId` to the total flat spark
 * bonus it receives, combining the two static sources in the Starter pool
 * (see `battle_ai.md` §"Per-Card Knowledge"):
 *
 * - **Support** (e.g. Nocturne Strummer): for each occupied reserve card whose
 *   model returns a `supportSpark` value `V`, add `V` to every occupied
 *   deployed card sitting in a slot that reserve supports (per
 *   `supportedDeploySlots`).
 * - **Self-static** (e.g. Wildflower Colossus): for each occupied deployed
 *   card whose model returns a `selfStaticSpark` value `V`, add `V` to that
 *   card's own id.
 *
 * Each on-board card's behavior is looked up by `cardNumber` in
 * {@link starterCardModels}; cards without a registered model contribute
 * nothing. Cards that receive no bonus are simply absent from the map.
 *
 * The same map is consumed by the judgment resolver's `supportContribution`
 * and by board evaluation, so support math stays in one place.
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
  for (const reserveSlot of RESERVE_SLOT_IDS) {
    const reserveCard = model.aiReserve[reserveSlot];
    if (reserveCard === null) {
      continue;
    }
    const reserveModel = starterCardModels.get(reserveCard.cardNumber);
    const bonus = reserveModel?.supportSpark?.(model, reserveCard);
    if (bonus === undefined || bonus === null || bonus === 0) {
      continue;
    }
    for (const deploySlot of supportedDeploySlots(reserveSlot)) {
      const deployedCard = model.aiDeployed[deploySlot];
      if (deployedCard !== null) {
        add(deployedCard.battleCardId, bonus);
      }
    }
  }

  // Self-static: front-rank cards buffing themselves.
  for (const deploySlot of DEPLOY_SLOT_IDS) {
    const deployedCard = model.aiDeployed[deploySlot];
    if (deployedCard === null) {
      continue;
    }
    const deployedModel = starterCardModels.get(deployedCard.cardNumber);
    const selfBonus = deployedModel?.selfStaticSpark?.(model, deployedCard);
    if (selfBonus !== undefined && selfBonus !== 0) {
      add(deployedCard.battleCardId, selfBonus);
    }
  }

  return contribution;
}
