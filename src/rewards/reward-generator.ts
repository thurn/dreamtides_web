import type { CardData } from "../types/cards";
import type { DreamsignTemplate, PackageTideId } from "../types/content";
import type { Dreamsign } from "../types/quest";
import { isStarterCard } from "../data/card-database";
import { pickPackageAdjacentItem } from "../data/tide-weights";
import {
  readDreamsignPool,
  resolveDreamsignTemplates,
} from "../dreamsign/dreamsign-pool";

export type RewardSiteData =
  | {
      rewardType: "card";
      cardNumber: number;
      cardName: string;
    }
  | {
      rewardType: "dreamsign";
      dreamsign: Dreamsign;
    }
  | {
      rewardType: "essence";
      essenceAmount: number;
    };

export interface RewardGenerationOptions {
  cardDatabase: ReadonlyMap<number, CardData>;
  dreamsignTemplates: readonly DreamsignTemplate[];
  remainingDreamsignPoolIds: readonly string[];
  selectedPackageTides: readonly PackageTideId[];
}

export interface RewardGenerationResult {
  reward: RewardSiteData;
  remainingDreamsignPoolIds: string[];
  spentDreamsignPoolIds: string[];
}

export function generateRewardSiteData({
  cardDatabase,
  dreamsignTemplates,
  remainingDreamsignPoolIds,
  selectedPackageTides,
}: RewardGenerationOptions): RewardGenerationResult {
  const card = pickPackageAdjacentItem(
    Array.from(cardDatabase.values()).filter((candidate) => !isStarterCard(candidate)),
    (candidate) => candidate.tides,
    selectedPackageTides,
  );
  const availableDreamsignPool = readDreamsignPool(remainingDreamsignPoolIds, dreamsignTemplates);
  const dreamsignTemplate = pickPackageAdjacentItem(
    resolveDreamsignTemplates(availableDreamsignPool.availableIds, dreamsignTemplates),
    (candidate) => candidate.packageTides,
    selectedPackageTides,
  );

  if (
    card !== null &&
    (dreamsignTemplate === null || Math.random() < 0.7)
  ) {
    return {
      reward: {
        rewardType: "card",
        cardNumber: card.cardNumber,
        cardName: card.name,
      },
      remainingDreamsignPoolIds: [...availableDreamsignPool.availableIds],
      spentDreamsignPoolIds: [],
    };
  }

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
      remainingDreamsignPoolIds: availableDreamsignPool.availableIds.filter(
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
    remainingDreamsignPoolIds: [...availableDreamsignPool.availableIds],
    spentDreamsignPoolIds: [],
  };
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
