import { describe, expect, it } from "vitest";
import type {
  SiteState,
  RewardSiteRuntime,
} from "../../types/journey";
import { parseSiteId } from "../../types/identifiers";
import { testDreamsignId } from "../../types/test-identities";
import { buildInlineRewardCompletionLog } from "./inline-reward-view-model";

describe("inline-reward-view-model", () => {
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
  });
});
