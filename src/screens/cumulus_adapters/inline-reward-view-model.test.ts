import { describe, expect, it } from "vitest";
import type {
  EssenceSiteRuntime,
  RewardSiteRuntime,
  SiteState,
} from "../../types/quest";
import { buildInlineRewardCompletionLog } from "./inline-reward-view-model";

const STATE = { essence: 90, essenceCap: 100 };

function site(type: SiteState["type"]): SiteState {
  return { id: "site-uuid", type, isEnhanced: false, isVisited: false };
}

describe("buildInlineRewardCompletionLog", () => {
  it("describes a capped Essence grant", () => {
    const runtime: EssenceSiteRuntime = {
      kind: "essence",
      amount: 25,
      accepted: false,
    };

    const result = buildInlineRewardCompletionLog(
      site("Essence"),
      runtime,
      STATE,
    );
    expect(result?.kind).toBe("essence");
    expect(result?.fields.siteId).toBe("site-uuid");
    expect(result?.fields.rewardAmount).toBe(25);
    expect(result?.fields.essenceBefore).toBe(90);
    expect(result?.fields.essenceAfter).toBe(100);
  });

  it("identifies a Dreamsign grant by UUID", () => {
    const runtime: RewardSiteRuntime = {
      kind: "reward",
      reward: {
        rewardType: "dreamsign",
        dreamsign: {
          id: "dreamsign-uuid",
          name: "Display name",
          effectDescription: "A test effect.",
          isBane: false,
        },
      },
      remainingDreamsignPoolIds: [],
      accepted: false,
    };

    const result = buildInlineRewardCompletionLog(
      site("Reward"),
      runtime,
      STATE,
    );
    expect(result?.kind).toBe("reward");
    expect(result?.fields.rewardType).toBe("dreamsign");
    expect(result?.fields.dreamsignId).toBe("dreamsign-uuid");
  });

  it("ignores an accepted runtime", () => {
    const runtime: EssenceSiteRuntime = {
      kind: "essence",
      amount: 25,
      accepted: true,
    };

    expect(
      buildInlineRewardCompletionLog(site("Essence"), runtime, STATE),
    ).toBeNull();
  });
});
