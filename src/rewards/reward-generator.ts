import type { DreamsignTemplate } from "../types/content";
import type { Dreamsign } from "../types/journey";
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
  /**
   * Deterministic `[0, 1)` random source. Defaults to `Math.random` (the
   * legacy/UI path); the coop site provider passes a stream derived from
   * `ctx.rng` so two clients folding the same `OPEN_SITE` roll the same reward.
   */
  rng?: () => number;
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
  rng = Math.random,
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
      : candidates[Math.floor(rng() * candidates.length)];

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
          isNegative: false,
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
      essenceAmount: randomInt(rng, 150, 350),
    },
    remainingDreamsignPoolIds: [...availableIds],
    spentDreamsignPoolIds: [],
  };
}

function randomInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}
