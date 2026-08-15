import { describe, expect, it } from "vitest";
import type {
  EssenceSiteRuntime,
  RewardSiteRuntime,
  SiteState,
} from "../../types/journey";
import { buildInlineRewardCompletionLog } from "./inline-reward-view-model";
import { parseSiteId } from "../../types/identifiers";
import { testDreamsignId } from "../../types/test-identities";

const STATE = { essence: 90 };

function site(type: SiteState["type"]): SiteState {
  return {
    id: parseSiteId("site-uuid"),
    type,
    isEnhanced: false,
    isVisited: false,
  };
}

describe("buildInlineRewardCompletionLog", () => {
  it("describes an Essence grant", () => {
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
    expect(result?.fields.siteId).toBe(parseSiteId("site-uuid"));
    expect(result?.fields.rewardAmount).toBe(25);
    expect(result?.fields.essenceBefore).toBe(90);
    expect(result?.fields.essenceAfter).toBe(115);
  });

  it("identifies a Dreamsign grant by UUID", () => {
    const dreamsignId = testDreamsignId("dreamsign-uuid");
    const runtime: RewardSiteRuntime = {
      kind: "reward",
      reward: {
        rewardType: "dreamsign",
        dreamsign: {
          id: dreamsignId,
          name: "Display name",
          effectDescription: "A test effect.",
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
    expect(result?.fields.dreamsignId).toBe(dreamsignId);
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
