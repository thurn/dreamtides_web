import { describe, expect, it } from "vitest";

import { collectRewardEntries } from "../../../apply/applyShared";
import type { SharedRewardPayload } from "../../../apply/payloads";
import type { JourneyOption } from "../../manifest";
import { buildFixtureContext, FIXTURE_DRAW_CONTEXT } from "../__shared__/fixture";
import { oneOperationManyTargetsPlugin } from "./index";

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
    const filled = oneOperationManyTargetsPlugin.fill({
      context: ctx,
      drawContext: drawContext(`oomt-envelope-${index}`),
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

  throw new Error(`could not find one_operation_many_targets envelope for ${templateIds.join(", ")}`);
}

function payloadRecord(payload: SharedRewardPayload): Record<string, unknown> {
  return payload.params;
}

describe("one_operation_many_targets shape", () => {
  it("produces a structurally valid filled journey on a populated fixture", () => {
    const ctx = buildFixtureContext();
    const filled = oneOperationManyTargetsPlugin.fill({
      context: ctx,
      drawContext: FIXTURE_DRAW_CONTEXT,
      stage: "mid",
    });

    const bounds = oneOperationManyTargetsPlugin.definition.rootOptionCount;
    expect(filled.options.length).toBeGreaterThanOrEqual(bounds.min);
    expect(filled.options.length).toBeLessThanOrEqual(bounds.max);

    for (const option of filled.options) {
      expect(option.text.length).toBeGreaterThan(0);
      expect(typeof option.locked).toBe("boolean");
    }
  });

  it("attaches a resolvable named-card reward envelope with selected card params", () => {
    const { option, payload } = optionWithRewardEnvelope([
      "apply_named_transfiguration_to_card_name",
    ]);
    const targetOperation = option.operations.find((operation) =>
      operation.operationKind === "target"
    );
    const rewardOperation = option.operations.find((operation) =>
      operation.operationKind === "reward"
    );
    const selector = targetOperation?.targetSelector;

    expect(payload.kind).toBe("shared_reward_template");
    expect(payload.templateId).toBe("apply_named_transfiguration_to_card_name");
    expect(payload.text).toBe(option.text);
    expect(payload.convertedEssence).toBe(option.effectConvertedEssence);
    expect(selector?.selectorKind).toBe("card");
    expect(payloadRecord(payload)).toEqual({
      cardName: selector?.selectorKind === "card" ? selector.names?.[0] : undefined,
      transfiguration: rewardOperation?.payload.transfigurationName,
    });
  });

  it("attaches a resolvable route reward envelope with selected site params", () => {
    const { option, payload } = optionWithRewardEnvelope([
      "add_site_to_dreamscape",
      "add_site_to_next_dreamscape",
      "boost_site_appearance_chance",
      "replace_site_type",
    ]);
    const routeOperation = option.operations.find((operation) =>
      operation.targetSelector?.selectorKind === "route_site"
    );
    const selector = routeOperation?.targetSelector;

    expect(payload.kind).toBe("shared_reward_template");
    expect(payload.text).toBe(option.text);
    expect(payload.convertedEssence).toBe(option.effectConvertedEssence);
    expect(selector?.selectorKind).toBe("route_site");
    expect(payloadRecord(payload).siteType ?? payloadRecord(payload).toType).toBe(
      selector?.selectorKind === "route_site" ? selector.siteType : undefined,
    );
  });
});
