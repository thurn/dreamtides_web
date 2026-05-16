import { describe, expect, it } from "vitest";

import {
  collectCostEntries,
  collectRewardEntries,
} from "../../../apply/applyShared";
import { buildFixtureContext, FIXTURE_DRAW_CONTEXT } from "../__shared__/fixture";
import { sameRewardDifferentCostsPlugin } from "./index";

function withoutLockedPrefix(text: string): string {
  return text.replace(/\[LOCKED\]\s*/gu, "");
}

function normalizeDreamsignTerm(text: string): string {
  return text.replace(/\bdreamsigns?\b/giu, (match) =>
    match.toLowerCase().endsWith("s") ? "Dreamsigns" : "Dreamsign"
  );
}

function sentence(text: string): string {
  return text.endsWith(".") ? text : `${text}.`;
}

describe("same_reward_different_costs shape", () => {
  it("produces a structurally valid filled journey on a populated fixture", () => {
    const ctx = buildFixtureContext();
    const filled = sameRewardDifferentCostsPlugin.fill({
      context: ctx,
      drawContext: FIXTURE_DRAW_CONTEXT,
      stage: "mid",
    });

    const bounds = sameRewardDifferentCostsPlugin.definition.rootOptionCount;
    expect(filled.options.length).toBeGreaterThanOrEqual(bounds.min);
    expect(filled.options.length).toBeLessThanOrEqual(bounds.max);

    for (const option of filled.options) {
      expect(option.text.length).toBeGreaterThan(0);
      expect(typeof option.locked).toBe("boolean");
    }
  });

  it("fills every option with the rendered shared cost and shared reward envelopes", () => {
    const ctx = buildFixtureContext();
    const filled = sameRewardDifferentCostsPlugin.fill({
      context: ctx,
      drawContext: FIXTURE_DRAW_CONTEXT,
      stage: "mid",
    });

    for (const option of filled.options) {
      expect(option.costs).toHaveLength(1);
      expect(option.effects).toHaveLength(1);

      const costEntries = collectCostEntries(option.costs);
      const rewardEntries = collectRewardEntries(option.effects);
      expect(costEntries).toHaveLength(1);
      expect(rewardEntries).toHaveLength(1);

      const costEntry = costEntries[0];
      const rewardEntry = rewardEntries[0];
      if (!costEntry || !rewardEntry) {
        throw new Error("expected same_reward_different_costs envelopes to resolve");
      }

      expect(costEntry.payload.convertedEssence).toBe(option.costConvertedEssence);
      expect(rewardEntry.payload.convertedEssence).toBe(option.effectConvertedEssence);
      expect(option.netConvertedEssence).toBe(
        rewardEntry.payload.convertedEssence - costEntry.payload.convertedEssence,
      );
      expect(option.rewardTemplateIds).toEqual([rewardEntry.payload.templateId]);

      expect(option.text).toContain(
        sentence(normalizeDreamsignTerm(withoutLockedPrefix(costEntry.payload.text))),
      );
      expect(option.text).toContain(
        sentence(normalizeDreamsignTerm(withoutLockedPrefix(rewardEntry.payload.text))),
      );
    }
  });
});
