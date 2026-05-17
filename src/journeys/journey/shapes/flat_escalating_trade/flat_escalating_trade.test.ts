import { describe, expect, it } from "vitest";

import {
  narrowSharedCostPayload,
  narrowSharedRewardPayload,
} from "../../../apply/payloads";
import { buildFixtureContext, FIXTURE_DRAW_CONTEXT } from "../__shared__/fixture";
import { flatEscalatingTradePlugin } from "./index";

describe("flat_escalating_trade shape", () => {
  it("produces a structurally valid filled journey on a populated fixture", () => {
    const ctx = buildFixtureContext();
    const filled = flatEscalatingTradePlugin.fill({
      context: ctx,
      drawContext: FIXTURE_DRAW_CONTEXT,
      stage: "mid",
    });

    const bounds = flatEscalatingTradePlugin.definition.rootOptionCount;
    expect(filled.options.length).toBeGreaterThanOrEqual(bounds.min);
    expect(filled.options.length).toBeLessThanOrEqual(bounds.max);

    for (const option of filled.options) {
      expect(option.text.length).toBeGreaterThan(0);
      expect(typeof option.locked).toBe("boolean");
    }
  });

  it("emits dispatchable shared envelopes for visible trade costs and rewards", () => {
    const ctx = buildFixtureContext();
    const filled = flatEscalatingTradePlugin.fill({
      context: ctx,
      drawContext: FIXTURE_DRAW_CONTEXT,
      stage: "mid",
    });

    for (const option of filled.options) {
      const cost = narrowSharedCostPayload(option.costs[0]);
      expect(cost?.templateId).toBe("pay_essence");
      expect(cost?.params).toEqual({ x: option.costConvertedEssence });
      expect(cost?.text).toContain("essence");
      expect(cost?.convertedEssence).toBe(option.costConvertedEssence);

      const reward = narrowSharedRewardPayload(option.effects[0]);
      expect(option.rewardTemplateIds ?? []).toContain(reward?.templateId);
      expect(reward?.text.length).toBeGreaterThan(0);
      expect(reward?.convertedEssence).toBe(option.effectConvertedEssence);
    }
  });
});
