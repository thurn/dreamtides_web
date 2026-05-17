// Direct port from CLI `src/journey/shapes/one_operation_many_targets/fill.ts`.

import {
  makeUnlockedOption,
  type JourneyOption,
  type JourneySymmetryContractDebug,
} from "../../manifest";
import {
  ONE_OPERATION_MANY_TARGETS_REWARDS,
  type OneOperationManyTargetsReward,
  type TargetedRewardTarget,
} from "./rewards";
import type { SharedRewardPayload } from "../../../apply/payloads";
import { shuffleDeterministic, weightedChoice } from "../../../util/rng";
import type { TemplateParams } from "../../shared/types";
import type { FilledJourney, ShapeFillArgs } from "../types";

type Candidate = {
  readonly template: OneOperationManyTargetsReward;
  readonly params: TemplateParams;
  readonly targets: readonly TargetedRewardTarget[];
};

const LATE_MIN_EFFECT_CEC = 60;

function hasLateStageValue(candidate: Candidate, args: ShapeFillArgs): boolean {
  if (args.stage !== "late") {
    return true;
  }

  return candidate.targets.some((target) =>
    candidate.template.cec(candidate.params, target, args.context) >= LATE_MIN_EFFECT_CEC
  );
}

function stringParam(params: TemplateParams, key: string): string | undefined {
  const value = params[key];
  return typeof value === "string" ? value : undefined;
}

function numberParam(params: TemplateParams, key: string): number | undefined {
  const value = params[key];
  return typeof value === "number" ? value : undefined;
}

function targetName(target: TargetedRewardTarget): string | undefined {
  const selector = target.selector;
  if ("names" in selector && Array.isArray(selector.names)) {
    return selector.names[0];
  }
  if ("statusName" in selector && typeof selector.statusName === "string") {
    return selector.statusName;
  }
  return undefined;
}

function predicateId(target: TargetedRewardTarget): string | undefined {
  return target.key.startsWith("predicate:") ? target.key.replace("predicate:", "") : undefined;
}

function cardTypePredicateId(target: TargetedRewardTarget): string | undefined {
  return target.key.startsWith("card_type:")
    ? target.key.replace("card_type:", "")
    : undefined;
}

function routeSiteType(target: TargetedRewardTarget): string | undefined {
  const selector = target.selector;
  if (selector.selectorKind === "route_site") {
    return selector.siteType;
  }
  return undefined;
}

function transfigurationPredicate(target: TargetedRewardTarget): {
  readonly transfiguration: string;
  readonly predicateId: string;
} | undefined {
  const [kind, transfiguration, predicate] = target.key.split(":");
  return kind === "transfiguration_predicate" && transfiguration && predicate
    ? { transfiguration, predicateId: predicate }
    : undefined;
}

function isMetaRewardPair(value: unknown): value is {
  readonly cardId: string;
  readonly cardName: string;
  readonly dreamsignId: string;
  readonly dreamsignName: string;
} {
  if (value === null || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.cardId === "string" &&
    typeof record.cardName === "string" &&
    typeof record.dreamsignId === "string" &&
    typeof record.dreamsignName === "string";
}

function metaRewardParams(
  params: TemplateParams,
  target: TargetedRewardTarget,
): TemplateParams | null {
  if (!Array.isArray(params.pairs)) return null;
  const pair = params.pairs.find((entry): entry is {
    readonly cardId: string;
    readonly cardName: string;
    readonly dreamsignId: string;
    readonly dreamsignName: string;
  } => isMetaRewardPair(entry) && target.key === `meta_reward_pair:${entry.cardId}:${entry.dreamsignId}`);

  return pair
    ? {
        subIds: ["gain_named_card", "gain_named_dreamsign"],
        subParams: [{ name: pair.cardName }, { name: pair.dreamsignName }],
      }
    : null;
}

export function rewardParamsFor(
  templateId: string,
  params: TemplateParams,
  target: TargetedRewardTarget,
): TemplateParams | null {
  const cardName = targetName(target);
  const predId = predicateId(target);
  const cardTypePredId = cardTypePredicateId(target);
  const siteType = routeSiteType(target);
  const transfigPred = transfigurationPredicate(target);

  switch (templateId) {
    case "gain_named_card":
    case "gain_named_dreamsign":
      return cardName === undefined ? null : { name: cardName };
    case "apply_named_transfiguration_to_card_name": {
      const transfiguration = stringParam(params, "transfiguration");
      return cardName === undefined || transfiguration === undefined
        ? null
        : { transfiguration, cardName };
    }
    case "gain_random_predicate_cards":
    case "duplicate_random_predicate": {
      const count = numberParam(params, "count");
      return predId === undefined || count === undefined ? null : { predicateId: predId, count };
    }
    case "apply_named_transfiguration_to_random_predicate_cards": {
      const count = numberParam(params, "count");
      return transfigPred === undefined || count === undefined
        ? null
        : { ...transfigPred, count };
    }
    case "purge_named_starter":
      return cardName === undefined ? null : { cardName };
    case "purge_random_starter_with_predicate_replacement":
      return predId === undefined ? null : { predicateId: predId };
    case "transform_card_in_deck_into_named": {
      const oldCardName = stringParam(params, "oldCardName");
      return cardName === undefined || oldCardName === undefined
        ? null
        : { oldCardName, newCardName: cardName };
    }
    case "duplicate_named_card_X": {
      const count = numberParam(params, "count");
      return cardName === undefined || count === undefined ? null : { cardName, count };
    }
    case "change_card_to_become_type": {
      const cardTypePredicateId = stringParam(params, "cardTypePredicateId");
      return cardName === undefined || cardTypePredicateId === undefined
        ? null
        : { cardName, cardTypePredicateId };
    }
    case "modify_random_cards_to_types": {
      const count = numberParam(params, "count");
      return cardTypePredId === undefined || count === undefined
        ? null
        : { count, cardTypePredicateId: cardTypePredId };
    }
    case "make_card_reclaim": {
      const count = numberParam(params, "count");
      return cardName === undefined || count === undefined ? null : { cardName, count };
    }
    case "opening_hand_grant_for_X_battles":
    case "temporary_card_copy_for_X_battles": {
      const battles = numberParam(params, "battles");
      return cardName === undefined || battles === undefined ? null : { cardName, battles };
    }
    case "card_cost_reduction_for_X_battles": {
      const amount = numberParam(params, "amount");
      const battles = numberParam(params, "battles");
      return predId === undefined || amount === undefined || battles === undefined
        ? null
        : { predicateId: predId, amount, battles };
    }
    case "add_site_to_dreamscape":
    case "add_site_to_next_dreamscape":
      return siteType === undefined ? null : { siteType };
    case "boost_site_appearance_chance": {
      const percent = numberParam(params, "percent");
      return siteType === undefined || percent === undefined ? null : { siteType, percent };
    }
    case "apply_named_transfiguration_to_all_predicate_cards":
      return transfigPred === undefined ? null : transfigPred;
    case "set_starting_dreamwell_positive":
      return cardName === undefined ? null : { cardName };
    case "shuffle_positive_dreamwell_cards": {
      const count = numberParam(params, "count");
      return cardName === undefined || count === undefined ? null : { cardName, count };
    }
    case "replace_site_type": {
      const fromType = stringParam(params, "fromType");
      return siteType === undefined || fromType === undefined
        ? null
        : { fromType, toType: siteType };
    }
    case "meta_gain_2_rewards":
      return metaRewardParams(params, target);
    default:
      return null;
  }
}

function sharedRewardEnvelope(args: {
  readonly templateId: string;
  readonly params: TemplateParams;
  readonly target: TargetedRewardTarget;
  readonly text: string;
  readonly cec: number;
}): SharedRewardPayload | null {
  const params = rewardParamsFor(args.templateId, args.params, args.target);
  return params === null
    ? null
    : {
        kind: "shared_reward_template",
        templateId: args.templateId,
        params,
        text: args.text,
        convertedEssence: args.cec,
      };
}

function optionFor(
  number: number,
  template: OneOperationManyTargetsReward,
  params: TemplateParams,
  target: TargetedRewardTarget,
  args: ShapeFillArgs,
): JourneyOption {
  const cec = template.cec(params, target, args.context);
  const text = template.render(params, target, args.context);
  const rewardEnvelope = sharedRewardEnvelope({
    templateId: template.rewardTypeId,
    params,
    target,
    text,
    cec,
  });

  return makeUnlockedOption({
    number,
    symbols: [...template.symbols],
    text,
    operations: [...template.operations(params, target, { optionNumber: number, cec })],
    costs: [],
    effects: rewardEnvelope === null ? [] : [rewardEnvelope],
    burdens: [],
    targets: [],
    triggers: [],
    routeEffects: [],
    costConvertedEssence: 0,
    effectConvertedEssence: cec,
    burdenConvertedEssence: 0,
    uncertaintyConvertedEssence: 0,
    netConvertedEssence: cec,
    pickBehavior: "record_and_generate_next",
    rewardTemplateIds: [template.rewardTypeId],
  });
}

function symmetryContract(
  operationKey: string,
  template: OneOperationManyTargetsReward,
  targets: readonly TargetedRewardTarget[],
): JourneySymmetryContractDebug {
  return {
    contractKind: "shared_axis_rotated_attribute",
    sharedProperty: `rewardType=${template.rewardTypeId}`,
    variedProperty: template.targetKind,
    sharedFirst: true,
    optionNumbers: targets.map((_target, index) => index + 1),
    sharedPayloadKeys: [`rewardType=${template.rewardTypeId}`, `operation=${operationKey}`],
    variedPayloadKeys: targets.map((target) => `${template.targetKind}=${target.key}`),
    weight: template.targetKind === "visible_named_card_target" ? 4 : 1,
  };
}

export function oneOperationManyTargetsFill(args: ShapeFillArgs): FilledJourney {
  const candidates: Candidate[] = ONE_OPERATION_MANY_TARGETS_REWARDS.flatMap((template) => {
    if (template.stages !== undefined && !template.stages.includes(args.stage)) {
      return [];
    }

    const params = template.rollParams(args.context, args.drawContext, args.stage);
    const targets = template.targets(params, args.context);

    const candidate = { template, params, targets };

    return targets.length >= 3 && hasLateStageValue(candidate, args)
      ? [candidate]
      : [];
  });

  if (candidates.length === 0) {
    throw new Error("one_operation_many_targets fill could not find an operation with at least three targets");
  }

  const selected = weightedChoice(
    args.drawContext,
    "oomt:template",
    candidates.map((candidate) => ({
      item: candidate,
      weight: 1,
    })),
  );
  const targets = shuffleDeterministic(
    args.drawContext,
    `oomt:targets:${selected.template.id}:${selected.template.operationKey(selected.params)}`,
    selected.targets,
  ).slice(0, 3);
  const options = targets.map((target, index) =>
    optionFor(index + 1, selected.template, selected.params, target, args)
  );

  return {
    options,
    precommitted: {},
    symmetryContracts: [
      symmetryContract(
        selected.template.operationKey(selected.params),
        selected.template,
        targets,
      ),
    ],
  };
}
