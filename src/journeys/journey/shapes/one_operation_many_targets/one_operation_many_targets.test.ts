import { describe, expect, it } from "vitest";

import { collectRewardEntries } from "../../../apply/applyShared";
import { narrowSharedRewardPayload } from "../../../apply/payloads";
import type { SharedRewardPayload } from "../../../apply/payloads";
import type { JourneyOption } from "../../manifest";
import type { TemplateParams } from "../../shared/types";
import { buildFixtureContext, FIXTURE_DRAW_CONTEXT } from "../__shared__/fixture";
import { rewardParamsFor } from "./fill";
import { oneOperationManyTargetsPlugin } from "./index";

function drawContext(seed: string) {
  return {
    ...FIXTURE_DRAW_CONTEXT,
    seed,
  };
}

type RewardParamTarget = Parameters<typeof rewardParamsFor>[2];

function namedCardTarget(name = "Steady Burn"): RewardParamTarget {
  return {
    key: `card:${name}`,
    text: `'${name}'`,
    selector: {
      selectorKind: "card",
      names: [name],
    },
  } as RewardParamTarget;
}

function predicateTarget(predicateId = "warriors"): RewardParamTarget {
  return {
    key: `predicate:${predicateId}`,
    text: predicateId,
    selector: {
      selectorKind: "card",
    },
  } as RewardParamTarget;
}

function transfigurationPredicateTarget(
  transfiguration = "Bronze",
  predicateId = "warriors",
): RewardParamTarget {
  return {
    key: `transfiguration_predicate:${transfiguration}:${predicateId}`,
    text: `${transfiguration} to ${predicateId}`,
    selector: {
      selectorKind: "card",
    },
  } as RewardParamTarget;
}

function routeTarget(siteType = "Shop"): RewardParamTarget {
  return {
    key: `route_site:current_dreamscape:${siteType}`,
    text: `${siteType} site`,
    selector: {
      selectorKind: "route_site",
      siteType,
    },
  } as RewardParamTarget;
}

function dreamwellTarget(cardName = "Bright Spark"): RewardParamTarget {
  return {
    key: `dreamwell_card:${cardName}`,
    text: `'${cardName}'`,
    selector: {
      selectorKind: "status",
      statusName: cardName,
    },
  } as RewardParamTarget;
}

function metaRewardTarget(): RewardParamTarget {
  return {
    key: "meta_reward_pair:card-1:dreamsign-1",
    text: "'Steady Burn' and 'Quiet Star'",
    selector: {
      selectorKind: "status",
      statusName: "Steady Burn / Quiet Star",
    },
  } as RewardParamTarget;
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
    const narrowed = narrowSharedRewardPayload(option.effects[0]);
    expect(narrowed).not.toBeNull();
    const [entry] = collectRewardEntries(option.effects);
    if (entry !== undefined) {
      return { option, payload: entry.payload };
    }
  }

  throw new Error(`could not find one_operation_many_targets envelope for ${templateIds.join(", ")}`);
}

function observedOptions(templateIds: readonly string[]): Map<string, JourneyOption[]> {
  const ctx = buildFixtureContext();
  const observed = new Map<string, JourneyOption[]>();

  for (let index = 0; index < 1500; index += 1) {
    const filled = oneOperationManyTargetsPlugin.fill({
      context: ctx,
      drawContext: drawContext(`oomt-observed-${index}`),
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

describe("one_operation_many_targets shape", () => {
  it.each([
    {
      templateId: "gain_named_card",
      params: {},
      target: namedCardTarget(),
      expected: { name: "Steady Burn" },
    },
    {
      templateId: "gain_named_dreamsign",
      params: {},
      target: namedCardTarget("Quiet Star"),
      expected: { name: "Quiet Star" },
    },
    {
      templateId: "apply_named_transfiguration_to_card_name",
      params: { transfiguration: "Bronze" },
      target: namedCardTarget(),
      expected: { transfiguration: "Bronze", cardName: "Steady Burn" },
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
      params: { count: 2 },
      target: transfigurationPredicateTarget(),
      expected: { transfiguration: "Bronze", predicateId: "warriors", count: 2 },
    },
    {
      templateId: "purge_named_starter",
      params: {},
      target: namedCardTarget(),
      expected: { cardName: "Steady Burn" },
    },
    {
      templateId: "purge_random_starter_with_predicate_replacement",
      params: {},
      target: predicateTarget(),
      expected: { predicateId: "warriors" },
    },
    {
      templateId: "transform_card_in_deck_into_named",
      params: { oldCardName: "Old Spark" },
      target: namedCardTarget(),
      expected: { oldCardName: "Old Spark", newCardName: "Steady Burn" },
    },
    {
      templateId: "duplicate_named_card_X",
      params: { count: 2 },
      target: namedCardTarget(),
      expected: { cardName: "Steady Burn", count: 2 },
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
      templateId: "boost_site_appearance_chance",
      params: { percent: 30 },
      target: routeTarget(),
      expected: { siteType: "Shop", percent: 30 },
    },
    {
      templateId: "apply_named_transfiguration_to_all_predicate_cards",
      params: {},
      target: transfigurationPredicateTarget(),
      expected: { transfiguration: "Bronze", predicateId: "warriors" },
    },
    {
      templateId: "replace_site_type",
      params: { fromType: "Purge" },
      target: routeTarget(),
      expected: { fromType: "Purge", toType: "Shop" },
    },
    {
      templateId: "meta_gain_2_rewards",
      params: {
        pairs: [{
          cardId: "card-1",
          cardName: "Steady Burn",
          dreamsignId: "dreamsign-1",
          dreamsignName: "Quiet Star",
        }],
      },
      target: metaRewardTarget(),
      expected: {
        subIds: ["gain_named_card", "gain_named_dreamsign"],
        subParams: [{ name: "Steady Burn" }, { name: "Quiet Star" }],
      },
    },
  ])("maps $templateId to shared reward params", ({ templateId, params, target, expected }) => {
    expect(rewardParamsFor(templateId, params as TemplateParams, target)).toEqual(expected);
  });

  it.each([
    ["make_card_reclaim", { count: 2 }, namedCardTarget()],
    ["opening_hand_grant_for_X_battles", { battles: 3 }, namedCardTarget()],
    ["temporary_card_copy_for_X_battles", { battles: 3 }, namedCardTarget()],
    ["change_card_to_become_type", { cardTypePredicateId: "warriors" }, namedCardTarget()],
    ["modify_random_cards_to_types", { count: 2 }, predicateTarget()],
    ["set_starting_dreamwell_positive", {}, dreamwellTarget()],
    ["shuffle_positive_dreamwell_cards", { count: 2 }, dreamwellTarget()],
    ["card_cost_reduction_for_X_battles", { amount: 1, battles: 3 }, predicateTarget()],
    ["transform_starter_into_named_card", {}, namedCardTarget()],
    ["draft_predicate_cards_from_4", {}, predicateTarget()],
    ["take_any_from_predicate_choices", { choices: 4 }, predicateTarget()],
    ["apply_named_transfiguration_to_chosen_predicate_cards", { count: 2 }, transfigurationPredicateTarget()],
  ])("does not map deferred or visual-only template %s", (templateId, params, target) => {
    expect(rewardParamsFor(templateId, params as TemplateParams, target)).toBeNull();
  });

  it("leaves generated no-op and deferred template options without reward envelopes", () => {
    const templateIds = [
      "make_card_reclaim",
      "opening_hand_grant_for_X_battles",
      "temporary_card_copy_for_X_battles",
      "change_card_to_become_type",
      "modify_random_cards_to_types",
      "card_cost_reduction_for_X_battles",
      "transform_starter_into_named_card",
    ];
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
