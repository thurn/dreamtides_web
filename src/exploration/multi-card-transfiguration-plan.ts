import type { JourneyContent } from "../data/journey-content";
import type { ExplorationPredicate } from "../data/exploration";
import {
  rewardTransfigurations,
  transfigurationBenefit,
} from "../journey_v2/archetypes/improve";
import { buildRewardSelectionContext } from "../reward-selection/context";
import { selectReward } from "../reward-selection/selectReward";
import { stableDigest } from "../reward-selection/stable";
import {
  SELECTION_RULES_VERSION,
  type RewardSelectionRequest,
  type RewardSelectionResult,
  type RewardSelectionTrace,
  type SelectionRulesVersion,
} from "../reward-selection/types";
import {
  applyTransfigurationToCard,
  offeredTransfigurationForms,
} from "../transfiguration/transfiguration-logic";
import type { CardData } from "../types/cards";
import type {
  JourneyState,
  SiteState,
  TransfigurationType,
} from "../types/journey";

export type ExplorationMultiCardTransfigurationEffectKind =
  | "transfigure-selected"
  | "transfigure-fixed-selected"
  | "transfigure-random-cards"
  | "transfigure-fixed-random-cards";

export type ExplorationMultiCardTransfigurationMode =
  "chosen-flexible" | "chosen-fixed" | "random-flexible" | "random-fixed";

export interface ExplorationMultiCardTransfigurationEligibleBinding {
  entryId: string;
  cardId: string;
  transfigurations: readonly TransfigurationType[];
}

export interface ExplorationMultiCardTransfigurationTarget {
  entryId: string;
  cardId: string;
  transfiguration: TransfigurationType;
}

export type ExplorationMultiCardTransfigurationUnavailableReason =
  "invalid-authored-configuration" | "insufficient-eligible-cards";

export interface ExplorationMultiCardTransfigurationPreparation {
  mode: ExplorationMultiCardTransfigurationMode;
  eligibleCards: readonly ExplorationMultiCardTransfigurationEligibleBinding[];
  targets: readonly ExplorationMultiCardTransfigurationTarget[];
  selectionRulesVersion: SelectionRulesVersion;
  selectionContentRevision: string;
  selectionKey: string;
  selectorSignatures: readonly string[];
  selectorTraces: readonly RewardSelectionTrace[];
  unavailableReason?: ExplorationMultiCardTransfigurationUnavailableReason;
  planSignature: string;
}

export interface ExplorationMultiCardTransfigurationPlanInput {
  effectKind: ExplorationMultiCardTransfigurationEffectKind;
  predicate?: ExplorationPredicate;
  count?: number;
  transfiguration?: TransfigurationType;
  actionId: string;
  encounterCardId: string;
  journey: JourneyState;
  site: SiteState;
  content: JourneyContent;
}

type Candidate = ExplorationMultiCardTransfigurationEligibleBinding;

function modeFor(
  effectKind: ExplorationMultiCardTransfigurationEffectKind,
): ExplorationMultiCardTransfigurationMode {
  switch (effectKind) {
    case "transfigure-selected":
      return "chosen-flexible";
    case "transfigure-fixed-selected":
      return "chosen-fixed";
    case "transfigure-random-cards":
      return "random-flexible";
    case "transfigure-fixed-random-cards":
      return "random-fixed";
  }
}

function matchesPredicate(
  card: CardData,
  predicate: ExplorationPredicate | undefined,
  content: JourneyContent,
): boolean {
  if (predicate === undefined) return true;
  switch (predicate) {
    case "character":
      return card.cardType === "Character";
    case "event":
      return card.cardType === "Event";
    case "cheap-character":
      return (
        card.cardType === "Character" &&
        card.energyCost !== null &&
        card.energyCost <=
          content.rewardSelectionData.tuning.costBands.cheapCharacterMaximum
      );
    case "spirit-animal":
      return card.cardType === "Character" && card.subtype === "Spirit Animal";
    case "survivor":
      return card.cardType === "Character" && card.subtype === "Survivor";
    case "warrior":
      return card.cardType === "Character" && card.subtype === "Warrior";
    case "legendary":
      return card.rarity === "Legendary";
  }
}

function offeredForms(
  input: ExplorationMultiCardTransfigurationPlanInput,
  card: CardData,
): readonly TransfigurationType[] {
  const forms = offeredTransfigurationForms(
    input.content.transfigurationData,
    card,
    null,
  ).map(({ type }) => type);
  if (input.effectKind === "transfigure-selected") return forms;
  if (
    input.effectKind === "transfigure-fixed-selected" ||
    input.effectKind === "transfigure-fixed-random-cards"
  ) {
    return input.transfiguration !== undefined &&
      forms.includes(input.transfiguration)
      ? [input.transfiguration]
      : [];
  }
  const rewardForms = new Set(
    rewardTransfigurations(input.content.transfigurationData, card),
  );
  return forms.filter((transfiguration) => {
    if (!rewardForms.has(transfiguration)) return false;
    const preview = applyTransfigurationToCard(
      input.content.transfigurationData,
      card,
      transfiguration,
    );
    return (
      transfigurationBenefit(
        input.content.transfigurationData,
        card,
        transfiguration,
        preview,
      ) > 0
    );
  });
}

function candidates(
  input: ExplorationMultiCardTransfigurationPlanInput,
): Candidate[] {
  return input.journey.deck
    .flatMap((entry): Candidate[] => {
      if (entry.transfiguration !== null) return [];
      const card = input.content.cardDatabase.get(entry.cardNumber);
      if (
        card === undefined ||
        !matchesPredicate(card, input.predicate, input.content)
      ) {
        return [];
      }
      const transfigurations = offeredForms(input, card);
      return transfigurations.length === 0
        ? []
        : [
            {
              entryId: entry.entryId,
              cardId: card.id,
              transfigurations,
            },
          ];
    })
    .sort(
      (left, right) =>
        left.entryId.localeCompare(right.entryId) ||
        left.cardId.localeCompare(right.cardId),
    );
}

function selectionRequest(input: {
  plan: ExplorationMultiCardTransfigurationPlanInput;
  suffix: string;
  mechanicId: RewardSelectionRequest["mechanicId"];
  count: number;
  constraints: NonNullable<RewardSelectionRequest["constraints"]>;
}): RewardSelectionRequest {
  return {
    mechanicId: input.mechanicId,
    policyId: "uniform",
    scope: {
      journeySeed: input.plan.journey.seed,
      siteUuid: input.plan.site.id,
      selectionKey: `${input.plan.actionId}:${input.suffix}`,
    },
    count: input.count,
    constraints: input.constraints,
  };
}

function isValidAuthoredInput(
  input: ExplorationMultiCardTransfigurationPlanInput,
): boolean {
  const isChosen =
    input.effectKind === "transfigure-selected" ||
    input.effectKind === "transfigure-fixed-selected";
  const isFixed =
    input.effectKind === "transfigure-fixed-selected" ||
    input.effectKind === "transfigure-fixed-random-cards";
  const count = input.count ?? (isChosen ? 1 : undefined);
  if (!Number.isInteger(count) || (count ?? 0) <= 0) return false;
  if (!isFixed && input.transfiguration !== undefined) {
    return false;
  }
  if (!isChosen && input.predicate === undefined) {
    return false;
  }
  if (isChosen && (count ?? 0) > 1 && input.predicate === undefined) {
    return false;
  }
  return !isFixed || input.transfiguration !== undefined;
}

function signedPreparation(
  input: ExplorationMultiCardTransfigurationPlanInput,
  preparation: Omit<
    ExplorationMultiCardTransfigurationPreparation,
    "planSignature"
  >,
): ExplorationMultiCardTransfigurationPreparation {
  return {
    ...preparation,
    planSignature: stableDigest({
      effectKind: input.effectKind,
      predicate: input.predicate ?? null,
      authoredCount: input.count ?? null,
      fixedTransfiguration: input.transfiguration ?? null,
      actionId: input.actionId,
      encounterCardId: input.encounterCardId,
      siteId: input.site.id,
      preparation,
    }),
  };
}

/**
 * Prepare the complete signed candidate set for a chosen multi-card action, or
 * the exact deterministic targets for an automatic multi-card action.
 */
export function prepareExplorationMultiCardTransfigurationPlan(
  input: ExplorationMultiCardTransfigurationPlanInput,
): ExplorationMultiCardTransfigurationPreparation {
  const context = buildRewardSelectionContext({
    journeyState: input.journey,
    journeyContent: input.content,
    site: input.site,
  });
  const eligible = candidates(input);
  const eligibleCards = eligible.map(
    ({ entryId, cardId, transfigurations }) => ({
      entryId,
      cardId,
      transfigurations,
    }),
  );
  const selectors: RewardSelectionResult[] = [];
  const base = {
    mode: modeFor(input.effectKind),
    eligibleCards,
    selectionRulesVersion: SELECTION_RULES_VERSION,
    selectionContentRevision: context.selectionContentRevision,
    selectionKey: input.actionId,
  } as const;
  const unavailable = (
    unavailableReason: ExplorationMultiCardTransfigurationUnavailableReason,
  ) =>
    signedPreparation(input, {
      ...base,
      targets: [],
      selectorSignatures: [],
      selectorTraces: [],
      unavailableReason,
    });

  if (!isValidAuthoredInput(input)) {
    return unavailable("invalid-authored-configuration");
  }
  const count = input.count ?? 1;
  if (eligible.length < count)
    return unavailable("insufficient-eligible-cards");
  if (
    input.effectKind === "transfigure-selected" ||
    input.effectKind === "transfigure-fixed-selected"
  ) {
    return signedPreparation(input, {
      ...base,
      targets: [],
      selectorSignatures: [],
      selectorTraces: [],
    });
  }

  const eligibleIds = new Set(eligible.map(({ entryId }) => entryId));
  const targetSelection = selectReward(
    context,
    selectionRequest({
      plan: input,
      suffix: "targets",
      mechanicId: "purge-deck-entry",
      count,
      constraints: {
        ...(input.predicate === undefined
          ? {}
          : { predicate: input.predicate }),
        allowStarters: true,
        allowNightmare: true,
        distinctDeckEntries: true,
        excludedDeckEntryIds: input.journey.deck
          .filter(({ entryId }) => !eligibleIds.has(entryId))
          .map(({ entryId }) => entryId)
          .sort((left, right) => left.localeCompare(right)),
      },
    }),
  );
  if (!targetSelection.ok) return unavailable("insufficient-eligible-cards");
  selectors.push(targetSelection);
  const selected = targetSelection.bindings.deckEntryIds.flatMap((entryId) => {
    const candidate = eligible.find((item) => item.entryId === entryId);
    return candidate === undefined ? [] : [candidate];
  });
  if (selected.length !== count)
    return unavailable("insufficient-eligible-cards");

  const targets: ExplorationMultiCardTransfigurationTarget[] = [];
  for (const candidate of selected) {
    if (input.effectKind === "transfigure-fixed-random-cards") {
      const transfiguration = input.transfiguration;
      if (
        transfiguration === undefined ||
        !candidate.transfigurations.includes(transfiguration)
      ) {
        return unavailable("insufficient-eligible-cards");
      }
      targets.push({
        entryId: candidate.entryId,
        cardId: candidate.cardId,
        transfiguration,
      });
      continue;
    }
    const formSelection = selectReward(
      context,
      selectionRequest({
        plan: input,
        suffix: `form:${candidate.entryId}`,
        mechanicId: "transfigure-deck-entry",
        count: 1,
        constraints: {
          allowStarters: true,
          fixedDeckEntryId: candidate.entryId,
          allowedTransfigurations: candidate.transfigurations,
          distinctDeckEntries: true,
        },
      }),
    );
    const binding = formSelection.ok
      ? formSelection.bindings.transfigurations[0]
      : undefined;
    if (
      !formSelection.ok ||
      binding === undefined ||
      binding.entryId !== candidate.entryId ||
      binding.cardUuid !== candidate.cardId ||
      !candidate.transfigurations.includes(binding.transfiguration)
    ) {
      return unavailable("insufficient-eligible-cards");
    }
    selectors.push(formSelection);
    targets.push({
      entryId: candidate.entryId,
      cardId: candidate.cardId,
      transfiguration: binding.transfiguration,
    });
  }

  return signedPreparation(input, {
    ...base,
    targets,
    selectorSignatures: selectors.map(({ signature }) => signature),
    selectorTraces: selectors.map(({ trace }) => trace),
  });
}

/** Reject a stale or tampered preparation before mutating the journey fold. */
export function explorationMultiCardTransfigurationPreparationsEqual(
  actual: ExplorationMultiCardTransfigurationPreparation,
  expected: ExplorationMultiCardTransfigurationPreparation,
): boolean {
  const { planSignature: actualSignature, ...actualBody } = actual;
  const { planSignature: expectedSignature, ...expectedBody } = expected;
  return (
    actualSignature === expectedSignature &&
    stableDigest(actualBody) === stableDigest(expectedBody)
  );
}
