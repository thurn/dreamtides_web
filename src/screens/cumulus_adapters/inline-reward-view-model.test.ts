import { describe, expect, it } from "vitest";
import type {
  SiteState,
  RewardSiteRuntime,
} from "../../types/journey";
import { parseSiteId } from "../../types/identifiers";
import { testJourneyState } from "../../testing/journey-genesis";
import { makeTestAtlasNode } from "../../testing/atlas-fixtures";
import { parseAtlasNodeId } from "../../types/identifiers";
import { testDreamsignId } from "../../types/test-identities";
import { createJourneyModifierRegistry } from "../../rules/journey/modifier-registry";
import { journeyEssence } from "../../rules/journey/journey-essence";
import { buildInlineRewardCompletionLog, resolveInlineReward, resolveRewardReplacement, resolveRewardDecline } from "./inline-reward-view-model";

describe("inline-reward-view-model", () => {
  const STATE = { essence: 90, dreamsigns: [] };

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


it("projects live Essence holdings and reuses single Reward collection/cap choices for a marked Essence site", () => {
  const source = testDreamsignId("synthetic-source");
  const incoming = testDreamsignId("synthetic-incoming");
  const held = { id: source, name: "Same name", effectDescription: "Synthetic" };
  const site: SiteState = { id: parseSiteId("essence"), type: "Essence", isEnhanced: false, isVisited: false };
  const state = { ...testJourneyState(), essence: 11, dreamsigns: [held], maxDreamsigns: 1 };
  const registry = createJourneyModifierRegistry([journeyEssence(source, { kind: "multiplyEssenceSiteGain", factor: 3 })]);
  const amount = buildInlineRewardCompletionLog(site, { kind: "essence", amount: 7, accepted: false }, state, registry);
  expect(amount?.fields).toMatchObject({ rewardAmount: 21, essenceBefore: 11, essenceAfter: 32 });
  const runtime: RewardSiteRuntime = { kind: "reward", reward: { rewardType: "dreamsign", dreamsign: { ...held, id: incoming } }, accepted: false, remainingDreamsignPoolIds: [], journeyEssenceSource: source };
  state.siteRuntime[site.id] = runtime;
  expect(resolveInlineReward(site, runtime, state)).toEqual({ kind: "replacement" });
  expect(resolveInlineReward(site, runtime, { ...state, maxDreamsigns: 2 })).toMatchObject({ kind: "reward", fields: { siteType: "Essence", dreamsignId: incoming } });
  const node = makeTestAtlasNode(parseAtlasNodeId("inline-node"), [site]);
  expect(resolveRewardReplacement(node, state, site.id, source)).toMatchObject({ purgeIndex: 0, fields: { siteType: "Essence", dreamsignId: incoming, replacedDreamsignId: source } });
  expect(resolveRewardDecline(node, state, site.id)).toMatchObject({ fields: { dreamsignId: incoming } });
  expect(buildInlineRewardCompletionLog(site, { ...runtime, journeyEssenceSource: undefined }, state)).toBeNull();
});
