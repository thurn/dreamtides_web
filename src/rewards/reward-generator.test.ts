import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DreamsignTemplate } from "../types/content";
import {
  generateRewardSiteData as generateRewardSiteDataRaw,
  type RewardGenerationOptions,
} from "./reward-generator";
import { testDreamsignId } from "../types/test-identities";

const ECONOMY = { fallbackEssence: { min: 17, max: 29 } };
function generateRewardSiteData(
  options: Omit<RewardGenerationOptions, "economy">,
) {
  return generateRewardSiteDataRaw({ ...options, economy: ECONOMY });
}

const DREAMSIGN_TEMPLATES: DreamsignTemplate[] = [
  {
    id: testDreamsignId("dreamsign-1"),
    name: "Dreamsign One",
    effectDescription: "First effect.",
    imageName: "dreamsign_one.png",
    imageAlt: "Dreamsign One art",
  },
  {
    id: testDreamsignId("dreamsign-2"),
    name: "Dreamsign Two",
    effectDescription: "Second effect.",
  },
];

const DREAMSIGN_IDS = DREAMSIGN_TEMPLATES.map((t) => t.id);

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("generateRewardSiteData", () => {
  it("returns a dreamsign reward drawn uniformly from the pool", () => {
    const result = generateRewardSiteData({
      dreamsignTemplates: DREAMSIGN_TEMPLATES,
      remainingDreamsignPoolIds: DREAMSIGN_IDS,
    });

    expect(result.reward.rewardType).toBe("dreamsign");
    if (result.reward.rewardType === "dreamsign") {
      expect(DREAMSIGN_IDS).toContain(result.reward.dreamsign.id);
    }
    expect(result.spentDreamsignPoolIds).toHaveLength(1);
    expect(result.remainingDreamsignPoolIds).toHaveLength(
      DREAMSIGN_IDS.length - 1,
    );
  });

  it("picks different dreamsigns depending on Math.random result", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const resultFirst = generateRewardSiteData({
      dreamsignTemplates: DREAMSIGN_TEMPLATES,
      remainingDreamsignPoolIds: DREAMSIGN_IDS,
    });

    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const resultLast = generateRewardSiteData({
      dreamsignTemplates: DREAMSIGN_TEMPLATES,
      remainingDreamsignPoolIds: DREAMSIGN_IDS,
    });

    expect(resultFirst.reward.rewardType).toBe("dreamsign");
    expect(resultLast.reward.rewardType).toBe("dreamsign");
    if (
      resultFirst.reward.rewardType === "dreamsign" &&
      resultLast.reward.rewardType === "dreamsign"
    ) {
      expect(resultFirst.reward.dreamsign.id).not.toBe(
        resultLast.reward.dreamsign.id,
      );
    }
  });

  it("regenerates from regenerationPoolIds when the remaining pool is empty and still returns a dreamsign", () => {
    const result = generateRewardSiteData({
      dreamsignTemplates: DREAMSIGN_TEMPLATES,
      remainingDreamsignPoolIds: [],
      regenerationPoolIds: DREAMSIGN_IDS,
    });

    expect(result.reward.rewardType).toBe("dreamsign");
    if (result.reward.rewardType === "dreamsign") {
      expect(DREAMSIGN_IDS).toContain(result.reward.dreamsign.id);
    }
    expect(result.spentDreamsignPoolIds).toHaveLength(1);
  });

  it("falls back to essence only when no Dreamsign is available at all", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    const result = generateRewardSiteData({
      dreamsignTemplates: DREAMSIGN_TEMPLATES,
      remainingDreamsignPoolIds: [],
    });

    expect(result.reward.rewardType).toBe("essence");
    expect(result.spentDreamsignPoolIds).toEqual([]);
    expect(result.remainingDreamsignPoolIds).toEqual([]);
  });
});
