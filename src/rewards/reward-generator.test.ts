import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DreamsignTemplate } from "../types/content";
import { generateRewardSiteData } from "./reward-generator";

const DREAMSIGN_TEMPLATES: DreamsignTemplate[] = [
  {
    id: "dreamsign-1",
    name: "Dreamsign One",
    packageTides: ["alpha"],
    effectDescription: "First effect.",
    imageName: "dreamsign_one.png",
    imageAlt: "Dreamsign One art",
  },
  {
    id: "dreamsign-2",
    name: "Dreamsign Two",
    packageTides: ["beta"],
    effectDescription: "Second effect.",
  },
];

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("generateRewardSiteData", () => {
  it("always grants a Dreamsign drawn from the shared pool", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const result = generateRewardSiteData({
      dreamsignTemplates: DREAMSIGN_TEMPLATES,
      remainingDreamsignPoolIds: ["dreamsign-1", "dreamsign-2"],
      selectedPackageTides: ["alpha"],
    });

    expect(result.reward).toEqual({
      rewardType: "dreamsign",
      dreamsign: {
        id: "dreamsign-1",
        name: "Dreamsign One",
        effectDescription: "First effect.",
        imageName: "dreamsign_one.png",
        imageAlt: "Dreamsign One art",
        isBane: false,
      },
    });
    expect(result.spentDreamsignPoolIds).toEqual(["dreamsign-1"]);
    expect(result.remainingDreamsignPoolIds).toEqual(["dreamsign-2"]);
  });

  it("falls back to broader Dreamsign pool entries when no adjacent ones remain", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const result = generateRewardSiteData({
      dreamsignTemplates: DREAMSIGN_TEMPLATES,
      remainingDreamsignPoolIds: ["dreamsign-2"],
      selectedPackageTides: ["alpha"],
    });

    expect(result.reward).toEqual({
      rewardType: "dreamsign",
      dreamsign: {
        id: "dreamsign-2",
        name: "Dreamsign Two",
        effectDescription: "Second effect.",
        imageName: undefined,
        imageAlt: undefined,
        isBane: false,
      },
    });
    expect(result.remainingDreamsignPoolIds).toEqual([]);
  });

  it("recreates the shared pool from the run pool when the remaining pool is empty", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const result = generateRewardSiteData({
      dreamsignTemplates: DREAMSIGN_TEMPLATES,
      remainingDreamsignPoolIds: [],
      selectedPackageTides: ["alpha"],
      regenerationPoolIds: ["dreamsign-1", "dreamsign-2"],
    });

    expect(result.reward.rewardType).toBe("dreamsign");
    expect(result.spentDreamsignPoolIds).toHaveLength(1);
  });

  it("falls back to essence only when no Dreamsign is available at all", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    const result = generateRewardSiteData({
      dreamsignTemplates: DREAMSIGN_TEMPLATES,
      remainingDreamsignPoolIds: [],
      selectedPackageTides: ["alpha"],
    });

    expect(result.reward.rewardType).toBe("essence");
    expect(result.spentDreamsignPoolIds).toEqual([]);
    expect(result.remainingDreamsignPoolIds).toEqual([]);
  });
});
