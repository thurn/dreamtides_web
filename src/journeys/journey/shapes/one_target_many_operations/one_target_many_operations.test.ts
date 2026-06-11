import { describe, expect, it } from "vitest";

import { collectRewardEntries } from "../../../apply/applyShared";
import { narrowSharedRewardPayload } from "../../../apply/payloads";
import type { SharedRewardPayload } from "../../../apply/payloads";
import type { JourneyOption } from "../../manifest";
import type { TemplateParams } from "../../shared/types";
import { buildFixtureContext, FIXTURE_DRAW_CONTEXT } from "../__shared__/fixture";
import { rewardParamsFor } from "./fill";
import { oneTargetManyOperationsPlugin } from "./index";

function drawContext(seed: string) {
  return {
    ...FIXTURE_DRAW_CONTEXT,
    seed,
  };
}

type RewardParamTarget = Parameters<typeof rewardParamsFor>[2];

function cardTarget(name = "Steady Burn"): RewardParamTarget {
  return {
    kind: "named_card",
    key: `card:${name}`,
    text: `'${name}'`,
    symbols: ["card"],
    weight: 1,
    card: { name },
  } as unknown as RewardParamTarget;
}

function predicateTarget(predicateId = "warriors"): RewardParamTarget {
  return {
    kind: "predicate_cards",
    key: `predicate:${predicateId}`,
    text: predicateId,
    symbols: ["card"],
    weight: 1,
    predicate: { id: predicateId },
  } as unknown as RewardParamTarget;
}

function routeTarget(siteType = "Shop"): RewardParamTarget {
  return {
    kind: "route_site",
    key: `route_site:${siteType}`,
    text: `${siteType} site`,
    symbols: ["route"],
    weight: 1,
    siteType,
  } as RewardParamTarget;
}

function fixedTarget(kind: "shop_surface" | "player_resources"): RewardParamTarget {
  return {
    kind,
    key: kind,
    text: kind,
    symbols: [],
    weight: 1,
  } as RewardParamTarget;
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
    const narrowed = narrowSharedRewardPayload(option.effects[0]);
    expect(narrowed).not.toBeNull();
    const [entry] = collectRewardEntries(option.effects);
    if (entry !== undefined) {
      return { option, payload: entry.payload };
    }
  }

  throw new Error(`could not find one_target_many_operations envelope for ${templateIds.join(", ")}`);
}

function observedOptions(templateIds: readonly string[]): Map<string, JourneyOption[]> {
  const ctx = buildFixtureContext();
  const observed = new Map<string, JourneyOption[]>();

  for (let index = 0; index < 1500; index += 1) {
    const filled = oneTargetManyOperationsPlugin.fill({
      context: ctx,
      drawContext: drawContext(`otmo-observed-${index}`),
      stage: index % 3 === 0 ? "early" : index % 3 === 1 ? "mid" : "late",
    });

    for (const option of filled.options) {
      const templateId = option.rewardTemplateIds?.[0];
      if (templateId === undefined || !templateIds.includes(templateId)) continue;
      observed.set(templateId, [...(observed.get(templateId) ?? []), option]);
    }
  }

  return observed;
}

function payloadRecord(payload: SharedRewardPayload): Record<string, unknown> {
  return payload.params;
}

describe("one_target_many_operations shape", () => {
  it.each([
    {
      templateId: "gain_named_card",
      params: {},
      target: cardTarget(),
      expected: { name: "Steady Burn" },
    },
    {
      templateId: "apply_named_transfiguration_to_card_name",
      params: { transfiguration: "Enduring" },
      target: cardTarget(),
      expected: { transfiguration: "Enduring", cardName: "Steady Burn" },
    },
    {
      templateId: "duplicate_named_card_X",
      params: { count: 2 },
      target: cardTarget(),
      expected: { cardName: "Steady Burn", count: 2 },
    },
    {
      templateId: "change_card_to_become_type",
      params: { predicateId: "warriors" },
      target: cardTarget(),
      expected: { cardName: "Steady Burn", cardTypePredicateId: "warriors" },
    },
    {
      templateId: "make_card_reclaim",
      params: { count: 2 },
      target: cardTarget(),
      expected: { cardName: "Steady Burn", count: 2 },
    },
    {
      templateId: "opening_hand_grant_for_X_battles",
      params: { battles: 3 },
      target: cardTarget(),
      expected: { cardName: "Steady Burn", battles: 3 },
    },
    {
      templateId: "gain_random_predicate_cards",
      params: { count: 2 },
      target: predicateTarget(),
      expected: { predicateId: "warriors", count: 2 },
    },
    {
      templateId: "duplicate_random_predicate",
      params: { count: 2 },
      target: predicateTarget(),
      expected: { predicateId: "warriors", count: 2 },
    },
    {
      templateId: "apply_named_transfiguration_to_random_predicate_cards",
      params: { transfiguration: "Enduring", count: 2 },
      target: predicateTarget(),
      expected: { transfiguration: "Enduring", predicateId: "warriors", count: 2 },
    },
    {
      templateId: "card_cost_reduction_for_X_battles",
      params: { reduction: 1, battles: 3 },
      target: predicateTarget(),
      expected: { predicateId: "warriors", amount: 1, battles: 3 },
    },
    {
      templateId: "add_site_to_dreamscape",
      params: {},
      target: routeTarget(),
      expected: { siteType: "Shop" },
    },
    {
      templateId: "add_site_to_next_dreamscape",
      params: {},
      target: routeTarget(),
      expected: { siteType: "Shop" },
    },
    {
      templateId: "replace_site_type",
      params: { replacementSiteType: "Purge" },
      target: routeTarget(),
      expected: { fromType: "Shop", toType: "Purge" },
    },
    {
      templateId: "boost_site_appearance_chance",
      params: { percent: 30 },
      target: routeTarget(),
      expected: { siteType: "Shop", percent: 30 },
    },
    {
      templateId: "next_X_shop_rerolls_free",
      params: { count: 2 },
      target: fixedTarget("shop_surface"),
      expected: { count: 2 },
    },
    {
      templateId: "shop_essence_discount",
      params: { percent: 20 },
      target: fixedTarget("shop_surface"),
      expected: { percent: 20 },
    },
    {
      templateId: "shop_omen_discount",
      params: { count: 2 },
      target: fixedTarget("shop_surface"),
      expected: { count: 2 },
    },
    {
      templateId: "gain_essence",
      params: { amount: 75 },
      target: fixedTarget("player_resources"),
      expected: { x: 75 },
    },
    {
      templateId: "gain_omens",
      params: { amount: 2 },
      target: fixedTarget("player_resources"),
      expected: { x: 2 },
    },
    {
      templateId: "set_essence_to_percent_of_max",
      params: { percent: 75 },
      target: fixedTarget("player_resources"),
      expected: { percent: 75 },
    },
    {
      templateId: "gain_essence_random_range",
      params: { minimum: 50, maximum: 90 },
      target: fixedTarget("player_resources"),
      expected: { min: 50, max: 90 },
    },
    {
      templateId: "gain_essence_to_max",
      params: {},
      target: fixedTarget("player_resources"),
      expected: {},
    },
    {
      templateId: "increase_max_essence",
      params: { amount: 15 },
      target: fixedTarget("player_resources"),
      expected: { amount: 15 },
    },
  ])("maps $templateId to shared reward params", ({ templateId, params, target, expected }) => {
    expect(rewardParamsFor(templateId, params as TemplateParams, target)).toEqual(expected);
  });

  it.each([
    ["transform_starter_into_named_card", { cardName: "Steady Burn" }, fixedTarget("player_resources")],
    ["draft_predicate_cards_from_4", {}, predicateTarget()],
    ["take_any_from_predicate_choices", { choices: 4 }, predicateTarget()],
    ["apply_named_transfiguration_to_chosen_predicate_cards", { count: 2 }, predicateTarget()],
  ])("does not map chooser-only template %s", (templateId, params, target) => {
    expect(rewardParamsFor(templateId, params as TemplateParams, target)).toBeNull();
  });

  it("attaches resolvable reward envelopes for generated visible no-op options", () => {
    const templateIds = [
      "change_card_to_become_type",
      "make_card_reclaim",
      "opening_hand_grant_for_X_battles",
      "card_cost_reduction_for_X_battles",
    ];
    const observed = observedOptions(templateIds);

    for (const templateId of templateIds) {
      const options = observed.get(templateId) ?? [];
      expect(options.length, `expected generated option for ${templateId}`).toBeGreaterThan(0);
      for (const option of options) {
        const entries = collectRewardEntries(option.effects);
        expect(entries, templateId).toHaveLength(1);
        expect(entries[0].payload.templateId).toBe(templateId);
      }
    }
  });

  it("leaves generated chooser-only template options without reward envelopes", () => {
    const templateIds = ["transform_starter_into_named_card"];
    const observed = observedOptions(templateIds);

    for (const templateId of templateIds) {
      const options = observed.get(templateId) ?? [];
      expect(options.length, `expected generated option for ${templateId}`).toBeGreaterThan(0);
      for (const option of options) {
        expect(collectRewardEntries(option.effects), templateId).toHaveLength(0);
      }
    }
  });

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
