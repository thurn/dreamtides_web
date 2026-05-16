import { describe, expect, it } from "vitest";

import { collectRewardEntries } from "../../../apply/applyShared";
import { buildFixtureContext, FIXTURE_DRAW_CONTEXT } from "../__shared__/fixture";
import { heterogeneousPairPlugin } from "./index";

describe("heterogeneous_pair shape", () => {
  it("produces a structurally valid filled journey on a populated fixture", () => {
    const ctx = buildFixtureContext();
    const filled = heterogeneousPairPlugin.fill({
      context: ctx,
      drawContext: FIXTURE_DRAW_CONTEXT,
      stage: "mid",
    });

    const bounds = heterogeneousPairPlugin.definition.rootOptionCount;
    expect(filled.options.length).toBeGreaterThanOrEqual(bounds.min);
    expect(filled.options.length).toBeLessThanOrEqual(bounds.max);

    for (const option of filled.options) {
      expect(option.text.length).toBeGreaterThan(0);
      expect(typeof option.locked).toBe("boolean");
    }
  });

  it("fills no-cost reward options with visible shared reward envelopes", () => {
    const ctx = buildFixtureContext();
    const filled = heterogeneousPairPlugin.fill({
      context: ctx,
      drawContext: FIXTURE_DRAW_CONTEXT,
      stage: "mid",
    });

    for (const option of filled.options) {
      const rewardEntries = collectRewardEntries(option.effects);

      expect(option.costs).toHaveLength(0);
      expect(rewardEntries).toHaveLength(1);

      const rewardEntry = rewardEntries[0];
      if (!rewardEntry) {
        throw new Error("expected heterogeneous_pair reward envelope to resolve");
      }

      expect(rewardEntry.payload.convertedEssence).toBe(option.effectConvertedEssence);
      expect(option.netConvertedEssence).toBe(option.effectConvertedEssence);
      expect(option.rewardTemplateIds).toEqual([rewardEntry.payload.templateId]);
      expect(option.text).toContain(rewardEntry.payload.text);
    }
  });
});
