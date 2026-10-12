import { describe, expect, it } from "vitest";
import { testJourneyState } from "../../testing/journey-genesis";
import { testDreamsignId } from "../../types/test-identities";
import { makeAuguryTestDreamsignTemplate } from "../../journey_v2/testing/fixtures";
import { createSiteContentProvider } from "./site-provider";
import { makeJourneyContent, siteOf } from "./register-game-providers.fixtures";

const FIRST = testDreamsignId("essence-first");
const SECOND = testDreamsignId("essence-second");
const templates = [FIRST, SECOND].map((id) => makeAuguryTestDreamsignTemplate({ id, name: "Same synthetic display name" }));
const content = () => ({ ...makeJourneyContent(), dreamsignTemplates: templates });

describe("real Essence replacement provider with synthetic catalog", () => {
  it.each([false, true])("draws exactly one UUID deterministically for enhanced=%s, without mutating the source", (isEnhanced) => {
    const provider = createSiteContentProvider(content());
    const journey = { ...testJourneyState(), remainingDreamsignPool: [FIRST, SECOND] };
    const input = { journey, site: siteOf("essence", "Essence", isEnhanced), rng: () => 0, offerCount: 1 as const };
    const generated = provider.openEssenceDreamsignReward(input);
    expect(provider.openEssenceDreamsignReward(input)).toEqual(generated);
    if (generated?.runtime.kind !== "reward" || generated.runtime.reward.rewardType !== "dreamsign") throw new Error("expected single Dreamsign reward");
    const offered = generated.runtime.reward.dreamsign.id;
    expect([FIRST, SECOND]).toContain(offered);
    expect(generated.remainingDreamsignPool).toEqual([FIRST, SECOND].filter((id) => id !== offered));
    expect(generated.runtime.accepted).toBe(false);
    expect(journey.remainingDreamsignPool).toEqual([FIRST, SECOND]);
    expect(journey.dreamsigns).toEqual([]);
  });
  it("bounces empty/missing catalog alternatives without an Essence fallback", () => {
    const provider = createSiteContentProvider(content());
    for (const pool of [[], [testDreamsignId("unmatched")]]) {
      expect(provider.openEssenceDreamsignReward({ journey: { ...testJourneyState(), remainingDreamsignPool: pool }, site: siteOf("essence", "Essence"), rng: () => 0, offerCount: 1 })).toBeNull();
    }
  });
});
