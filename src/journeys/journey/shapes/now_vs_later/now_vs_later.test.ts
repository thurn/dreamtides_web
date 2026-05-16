import { describe, expect, it } from "vitest";

import { narrowSharedRewardPayload } from "../../../apply/payloads";
import { buildFixtureContext, FIXTURE_DRAW_CONTEXT } from "../__shared__/fixture";
import { nowVsLaterPlugin } from "./index";

describe("now_vs_later shape", () => {
  it("produces a structurally valid filled journey on a populated fixture", () => {
    const ctx = buildFixtureContext();
    const filled = nowVsLaterPlugin.fill({
      context: ctx,
      drawContext: FIXTURE_DRAW_CONTEXT,
      stage: "mid",
    });

    const bounds = nowVsLaterPlugin.definition.rootOptionCount;
    expect(filled.options.length).toBeGreaterThanOrEqual(bounds.min);
    expect(filled.options.length).toBeLessThanOrEqual(bounds.max);

    for (const option of filled.options) {
      expect(option.text.length).toBeGreaterThan(0);
      expect(typeof option.locked).toBe("boolean");
    }
  });

  it("keeps the now reward immediate and the later reward in the delayed hook", () => {
    const ctx = buildFixtureContext();
    const filled = nowVsLaterPlugin.fill({
      context: ctx,
      drawContext: FIXTURE_DRAW_CONTEXT,
      stage: "mid",
    });
    const [now, later] = filled.options;

    const nowReward = narrowSharedRewardPayload(now.effects[0]);
    expect(now.rewardTemplateIds ?? []).toContain(nowReward?.templateId);
    expect(nowReward?.convertedEssence).toBe(now.effectConvertedEssence);

    expect(later.effects).toEqual([]);

    const delayedHook = filled.precommitted.delayed?.[0] as {
      reward: readonly unknown[];
    };
    const delayedReward = narrowSharedRewardPayload(delayedHook.reward[0]);
    expect(later.rewardTemplateIds ?? []).toContain(delayedReward?.templateId);
    expect((delayedHook.reward[0] as { timing?: unknown }).timing).toBe(
      "delayed",
    );
  });
});
