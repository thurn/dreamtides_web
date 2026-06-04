import type { DreamsignTemplate } from "../types/content";
import type { Dreamsign } from "../types/quest";
import {
  readDreamsignPool,
  resolveDreamsignTemplates,
} from "../dreamsign/dreamsign-pool";

/**
 * A Dreamsign Reward Site always grants a known Dreamsign drawn from the run's
 * shared pool. The `essence` variant is a defensive fallback used only if the
 * pool somehow yields nothing even after regeneration.
 */
export type RewardSiteData =
  | {
      rewardType: "dreamsign";
      dreamsign: Dreamsign;
    }
  | {
      rewardType: "essence";
      essenceAmount: number;
    };

export interface RewardGenerationOptions {
  dreamsignTemplates: readonly DreamsignTemplate[];
  remainingDreamsignPoolIds: readonly string[];
  /**
   * The run's full Dreamsign pool. When the remaining pool is exhausted it is
   * recreated from this list so a Reward Site can still grant a Dreamsign.
   */
  regenerationPoolIds?: readonly string[];
}

export interface RewardGenerationResult {
  reward: RewardSiteData;
  remainingDreamsignPoolIds: string[];
  spentDreamsignPoolIds: string[];
}

export function generateRewardSiteData({
  dreamsignTemplates,
  remainingDreamsignPoolIds,
  regenerationPoolIds,
}: RewardGenerationOptions): RewardGenerationResult {
  let availableIds = readDreamsignPool(
    remainingDreamsignPoolIds,
    dreamsignTemplates,
  ).availableIds;

  // Recreate the shared pool when it has run out, mirroring the Dreamsign
  // Offering/Draft regeneration behaviour.
  if (availableIds.length === 0 && regenerationPoolIds !== undefined) {
    availableIds = readDreamsignPool(
      regenerationPoolIds,
      dreamsignTemplates,
    ).availableIds;
  }

  const candidates = resolveDreamsignTemplates(availableIds, dreamsignTemplates);
  const dreamsignTemplate =
    candidates.length === 0
      ? null
      : candidates[Math.floor(Math.random() * candidates.length)];

  if (dreamsignTemplate !== null) {
    return {
      reward: {
        rewardType: "dreamsign",
        dreamsign: {
          id: dreamsignTemplate.id,
          name: dreamsignTemplate.name,
          effectDescription: dreamsignTemplate.effectDescription,
          imageName: dreamsignTemplate.imageName,
          imageAlt: dreamsignTemplate.imageAlt,
          isBane: false,
        },
      },
      remainingDreamsignPoolIds: availableIds.filter(
        (id) => id !== dreamsignTemplate.id,
      ),
      spentDreamsignPoolIds: [dreamsignTemplate.id],
    };
  }

  return {
    reward: {
      rewardType: "essence",
      essenceAmount: randomInt(150, 350),
    },
    remainingDreamsignPoolIds: [...availableIds],
    spentDreamsignPoolIds: [],
  };
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
