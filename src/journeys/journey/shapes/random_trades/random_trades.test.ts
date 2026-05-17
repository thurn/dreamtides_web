import { describe, expect, it } from "vitest";

import {
  collectCostEntries,
  collectRewardEntries,
} from "../../../apply/applyShared";
import { buildFixtureContext, FIXTURE_DRAW_CONTEXT } from "../__shared__/fixture";
import { randomTradesPlugin } from "./index";

function withoutLockedPrefix(text: string): string {
  return text.replace(/\[LOCKED\]\s*/gu, "");
}

describe("random_trades shape", () => {
  it("produces a structurally valid filled journey on a populated fixture", () => {
    const ctx = buildFixtureContext();
    const filled = randomTradesPlugin.fill({
      context: ctx,
      drawContext: FIXTURE_DRAW_CONTEXT,
      stage: "mid",
    });

    const bounds = randomTradesPlugin.definition.rootOptionCount;
    expect(filled.options.length).toBeGreaterThanOrEqual(bounds.min);
    expect(filled.options.length).toBeLessThanOrEqual(bounds.max);

    for (const option of filled.options) {
      expect(option.text.length).toBeGreaterThan(0);
      expect(typeof option.locked).toBe("boolean");
    }
  });

  it("fills generated trades with visible shared cost and reward envelopes", () => {
    const ctx = buildFixtureContext();
    const filled = randomTradesPlugin.fill({
      context: ctx,
      drawContext: FIXTURE_DRAW_CONTEXT,
      stage: "mid",
    });

    for (const option of filled.options) {
      const costEntries = collectCostEntries(option.costs);
      const rewardEntries = collectRewardEntries(option.effects);

      expect(rewardEntries).toHaveLength(1);

      const rewardEntry = rewardEntries[0];
      if (!rewardEntry) {
        throw new Error("expected random_trades reward envelope to resolve");
      }

      expect(rewardEntry.payload.convertedEssence).toBe(option.effectConvertedEssence);
      expect(option.rewardTemplateIds).toEqual([rewardEntry.payload.templateId]);
      expect(option.text).toContain(rewardEntry.payload.text);

      if (option.symbols.includes("cost")) {
        expect(costEntries).toHaveLength(1);
        const costEntry = costEntries[0];
        if (!costEntry) {
          throw new Error("expected random_trades cost envelope to resolve");
        }
        expect(costEntry.payload.convertedEssence).toBe(option.costConvertedEssence);
        expect(option.text).toContain(withoutLockedPrefix(costEntry.payload.text));
        expect(option.netConvertedEssence).toBe(
          rewardEntry.payload.convertedEssence - costEntry.payload.convertedEssence,
        );
      } else {
        expect(costEntries).toHaveLength(0);
        expect(option.costConvertedEssence).toBe(0);
        expect(option.netConvertedEssence).toBe(rewardEntry.payload.convertedEssence);
      }
    }
  });
});
