import { describe, expect, it } from "vitest";

import { collectRewardEntries } from "../../../apply/applyShared";
import type { SharedRewardPayload } from "../../../apply/payloads";
import type { JourneyOption } from "../../manifest";
import { buildFixtureContext, FIXTURE_DRAW_CONTEXT } from "../__shared__/fixture";
import { oneTargetManyOperationsPlugin } from "./index";

function drawContext(seed: string) {
  return {
    ...FIXTURE_DRAW_CONTEXT,
    seed,
  };
}

function optionWithRewardEnvelope(templateIds: readonly string[]): {
  readonly option: JourneyOption;
  readonly payload: SharedRewardPayload;
} {
  const ctx = buildFixtureContext();

  for (let index = 0; index < 500; index += 1) {
    const filled = oneTargetManyOperationsPlugin.fill({
      context: ctx,
      drawContext: drawContext(`otmo-envelope-${index}`),
      stage: "mid",
    });
    const option = filled.options.find((candidate) =>
      templateIds.includes(candidate.rewardTemplateIds?.[0] ?? "")
    );
    if (option === undefined) continue;
    const [entry] = collectRewardEntries(option.effects);
    if (entry !== undefined) {
      return { option, payload: entry.payload };
    }
  }

  throw new Error(`could not find one_target_many_operations envelope for ${templateIds.join(", ")}`);
}

function payloadRecord(payload: SharedRewardPayload): Record<string, unknown> {
  return payload.params;
}

describe("one_target_many_operations shape", () => {
  it("produces a structurally valid filled journey on a populated fixture", () => {
    const ctx = buildFixtureContext();
    const filled = oneTargetManyOperationsPlugin.fill({
      context: ctx,
      drawContext: FIXTURE_DRAW_CONTEXT,
      stage: "mid",
    });

    const bounds = oneTargetManyOperationsPlugin.definition.rootOptionCount;
    expect(filled.options.length).toBeGreaterThanOrEqual(bounds.min);
    expect(filled.options.length).toBeLessThanOrEqual(bounds.max);

    for (const option of filled.options) {
      expect(option.text.length).toBeGreaterThan(0);
      expect(typeof option.locked).toBe("boolean");
    }
  });

  it("attaches a resolvable named-card reward envelope with selected card params", () => {
    const { option, payload } = optionWithRewardEnvelope(["duplicate_named_card_X"]);
    const params = payloadRecord(payload);

    expect(payload.kind).toBe("shared_reward_template");
    expect(payload.templateId).toBe("duplicate_named_card_X");
    expect(payload.text).toBe(option.text);
    expect(payload.convertedEssence).toBe(option.effectConvertedEssence);
    expect(typeof params.cardName).toBe("string");
    expect(typeof params.count).toBe("number");
    expect(option.text).toContain(String(params.cardName));
    expect(option.text).toContain(String(params.count));
  });

  it("attaches a resolvable resource reward envelope with shared apply params", () => {
    const { option, payload } = optionWithRewardEnvelope([
      "gain_essence",
      "gain_omens",
    ]);
    const params = payloadRecord(payload);

    expect(payload.kind).toBe("shared_reward_template");
    expect(payload.text).toBe(option.text);
    expect(payload.convertedEssence).toBe(option.effectConvertedEssence);
    expect(["gain_essence", "gain_omens"]).toContain(payload.templateId);
    expect(typeof params.x).toBe("number");
    expect(option.text).toContain(String(params.x));
  });
});
