import { describe, expect, it } from "vitest";

import {
  collectCostEntries,
  collectRewardEntries,
} from "../../../apply/applyShared";
import { buildFixtureContext, FIXTURE_DRAW_CONTEXT } from "../__shared__/fixture";
import { takeAnyNumberPlugin } from "./index";

function sentence(text: string): string {
  return text.endsWith(".") ? text : `${text}.`;
}

describe("take_any_number shape", () => {
  it("produces a structurally valid filled journey on a populated fixture", () => {
    const ctx = buildFixtureContext();
    const filled = takeAnyNumberPlugin.fill({
      context: ctx,
      drawContext: FIXTURE_DRAW_CONTEXT,
      stage: "mid",
    });

    const bounds = takeAnyNumberPlugin.definition.rootOptionCount;
    expect(filled.options.length).toBeGreaterThanOrEqual(bounds.min);
    expect(filled.options.length).toBeLessThanOrEqual(bounds.max);

    for (const option of filled.options) {
      expect(option.text.length).toBeGreaterThan(0);
      expect(typeof option.locked).toBe("boolean");
    }
  });

  it("caps rootOptionCount.max at 3 so the UI's 1-3 circles rendering holds", () => {
    expect(takeAnyNumberPlugin.definition.rootOptionCount.max).toBe(3);
  });

  it("fills every take row with visible shared cost and reward envelopes", () => {
    const ctx = buildFixtureContext();
    const filled = takeAnyNumberPlugin.fill({
      context: ctx,
      drawContext: FIXTURE_DRAW_CONTEXT,
      stage: "mid",
    });

    for (const option of filled.options) {
      const costEntries = collectCostEntries(option.costs);
      const rewardEntries = collectRewardEntries(option.effects);

      expect(costEntries).toHaveLength(1);
      expect(rewardEntries).toHaveLength(1);

      const costEntry = costEntries[0];
      const rewardEntry = rewardEntries[0];
      if (!costEntry || !rewardEntry) {
        throw new Error("expected take_any_number envelopes to resolve");
      }

      expect(costEntry.payload.convertedEssence).toBe(option.costConvertedEssence);
      expect(rewardEntry.payload.convertedEssence).toBe(option.effectConvertedEssence);
      expect(option.netConvertedEssence).toBe(
        rewardEntry.payload.convertedEssence - costEntry.payload.convertedEssence,
      );
      expect(option.rewardTemplateIds).toEqual([rewardEntry.payload.templateId]);
      expect(option.text).toContain(sentence(costEntry.payload.text));
      expect(option.text).toContain(sentence(rewardEntry.payload.text));
    }
  });
});
