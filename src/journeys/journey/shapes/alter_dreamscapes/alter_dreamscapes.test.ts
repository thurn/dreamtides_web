import { describe, expect, it } from "vitest";

import { collectRewardEntries } from "../../../apply/applyShared";
import { buildFixtureContext, FIXTURE_DRAW_CONTEXT } from "../__shared__/fixture";
import { alterDreamscapesPlugin } from "./index";

function routeEffectRecord(value: unknown): Record<string, unknown> {
  expect(value).toEqual(expect.any(Object));
  return value as Record<string, unknown>;
}

function expectRouteParamsMatchEnvelope(
  templateId: string,
  params: Record<string, unknown>,
  routeEffect: Record<string, unknown>,
): void {
  switch (templateId) {
    case "add_site_to_dreamscape":
    case "add_site_to_next_dreamscape":
      expect(routeEffect.siteType).toBe(params.siteType);
      break;
    case "replace_site_type":
      expect(routeEffect.fromSite).toBe(params.fromType);
      expect(routeEffect.toSite).toBe(params.toType);
      break;
    case "boost_site_appearance_chance":
      expect(routeEffect.siteType).toBe(params.siteType);
      expect(routeEffect.probabilityDeltaPercent).toBe(params.percent);
      expect(routeEffect.durationDreamscapes).toBe(params.dreamscapes);
      break;
    default:
      throw new Error(`unexpected route reward template '${templateId}'`);
  }
}

describe("alter_dreamscapes shape", () => {
  it("produces a structurally valid filled journey on a populated fixture", () => {
    const ctx = buildFixtureContext();
    const filled = alterDreamscapesPlugin.fill({
      context: ctx,
      drawContext: FIXTURE_DRAW_CONTEXT,
      stage: "mid",
    });

    const bounds = alterDreamscapesPlugin.definition.rootOptionCount;
    expect(filled.options.length).toBeGreaterThanOrEqual(bounds.min);
    expect(filled.options.length).toBeLessThanOrEqual(bounds.max);

    for (const option of filled.options) {
      expect(option.text.length).toBeGreaterThan(0);
      expect(typeof option.locked).toBe("boolean");
    }
  });

  it("emits a resolvable shared reward envelope for each route edit option", () => {
    const ctx = buildFixtureContext();
    const filled = alterDreamscapesPlugin.fill({
      context: ctx,
      drawContext: FIXTURE_DRAW_CONTEXT,
      stage: "mid",
    });

    for (const option of filled.options) {
      expect(option.effects).toHaveLength(1);
      expect(option.routeEffects).toHaveLength(1);

      const [entry] = collectRewardEntries(option.effects);
      const routeEffect = routeEffectRecord(option.routeEffects[0]);
      expect(entry).toBeDefined();
      expect(entry.payload.kind).toBe("shared_reward_template");
      expect(entry.payload.templateId).toBe(routeEffect.templateId);
      expect(entry.payload.text).toBe(option.text);
      expect(entry.payload.convertedEssence).toBe(option.effectConvertedEssence);
      expect(entry.payload.convertedEssence).toBe(option.netConvertedEssence);
      expect(entry.payload.templateId).toBe(entry.template.id);
      expect(option.rewardTemplateIds).toEqual([entry.payload.templateId]);
      expectRouteParamsMatchEnvelope(
        entry.payload.templateId,
        entry.payload.params,
        routeEffect,
      );
    }
  });
});
