import type { JourneyContent } from "../data/journey-content";
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
} from "../reward-selection/types";
import { applyTransfigurationToCard } from "../transfiguration/transfiguration-logic";
import type { CardData } from "../types/cards";
import type {
  ExplorationStarterCardTransfigurationBinding,
  ExplorationStarterCardTransfigurationEffectKind,
  ExplorationStarterCardTransfigurationPreparation,
  ExplorationStarterCardTransfigurationTarget,
  ExplorationStarterCardTransfigurationUnavailableReason,
  JourneyState,
  SiteState,
  TransfigurationType,
} from "../types/journey";
import type { CardId } from "../types/card-identity";
import type { ExplorationActionId } from "../types/identifiers";
import { parseSelectionKey } from "../types/identifiers";
import type { SelectionContentRevision } from "../types/selection-content-revision";

export interface ExplorationStarterCardTransfigurationPlanInput {
  effectKind: ExplorationStarterCardTransfigurationEffectKind;
  count?: number;
  actionId: ExplorationActionId;
  encounterCardId: CardId;
  journey: JourneyState;
  site: SiteState;
  content: JourneyContent;
}

interface StarterCandidate extends ExplorationStarterCardTransfigurationBinding {
  card: CardData;
  positiveForms: readonly TransfigurationType[];
}

function isStarterCardRole(card: CardData): boolean {
  return (
    card.isStarter === true || card.roles?.includes("starter-deck") === true
  );
}

function positiveBenefitForms(
  content: JourneyContent,
  card: CardData,
): readonly TransfigurationType[] {
  return rewardTransfigurations(content.transfigurationData, card).filter(
    (transfiguration) => {
      const preview = applyTransfigurationToCard(
        content.transfigurationData,
        card,
        transfiguration,
      );
      return (
        transfigurationBenefit(
          content.transfigurationData,
          card,
          transfiguration,
          preview,
        ) > 0
      );
    },
  );
}

function starterCandidates(
  journey: JourneyState,
  content: JourneyContent,
): StarterCandidate[] {
  return journey.deck
    .flatMap((entry) => {
      const card = content.cardDatabase.get(entry.cardNumber);
      if (card === undefined || !isStarterCardRole(card)) return [];
      return [
        {
          entryId: entry.entryId,
          cardId: card.id,
          card,
          positiveForms:
            entry.transfiguration === null
              ? positiveBenefitForms(content, card)
              : [],
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
  journey: JourneyState;
  site: SiteState;
  actionId: ExplorationActionId;
  suffix: string;
  mechanicId: RewardSelectionRequest["mechanicId"];
  count: number;
  constraints: NonNullable<RewardSelectionRequest["constraints"]>;
}): RewardSelectionRequest {
  return {
    mechanicId: input.mechanicId,
    policyId: "uniform",
    scope: {
      journeySeed: input.journey.seed,
      siteUuid: input.site.id,
      selectionKey: parseSelectionKey(`${input.actionId}:${input.suffix}`),
    },
    count: input.count,
    constraints: input.constraints,
  };
}

function preparationKind(
  effectKind: ExplorationStarterCardTransfigurationEffectKind,
): ExplorationStarterCardTransfigurationPreparation["kind"] {
  return effectKind === "transfigure-random-starter-cards"
    ? "random-count"
    : "all";
}

function signedPreparation(
  input: ExplorationStarterCardTransfigurationPlanInput,
  preparation: Omit<
    ExplorationStarterCardTransfigurationPreparation,
    "planSignature"
  >,
): ExplorationStarterCardTransfigurationPreparation {
  return {
    ...preparation,
    planSignature: stableDigest({
      effectKind: input.effectKind,
      authoredCount: input.count ?? null,
      actionId: input.actionId,
      encounterCardId: input.encounterCardId,
      siteId: input.site.id,
      preparation,
    }),
  };
}

function unavailablePreparation(input: {
  plan: ExplorationStarterCardTransfigurationPlanInput;
  starterCards: readonly ExplorationStarterCardTransfigurationBinding[];
  eligibleStarterCards: readonly ExplorationStarterCardTransfigurationBinding[];
  selectionContentRevision: SelectionContentRevision;
  reason: ExplorationStarterCardTransfigurationUnavailableReason;
}): ExplorationStarterCardTransfigurationPreparation {
  return signedPreparation(input.plan, {
    kind: preparationKind(input.plan.effectKind),
    starterCards: input.starterCards,
    eligibleStarterCards: input.eligibleStarterCards,
    targets: [],
    selectionRulesVersion: SELECTION_RULES_VERSION,
    selectionContentRevision: input.selectionContentRevision,
    selectionKey: parseSelectionKey(input.plan.actionId),
    selectorSignatures: [],
    selectorTraces: [],
    unavailableReason: input.reason,
  });
}

/**
 * Prepare exact starter targets and one independently uniform positive-benefit
 * form per target. The plan is automatic, signed, and safe to recompute during
 * replay validation.
 */
export function prepareExplorationStarterCardTransfigurationPlan(
  input: ExplorationStarterCardTransfigurationPlanInput,
): ExplorationStarterCardTransfigurationPreparation {
  const context = buildRewardSelectionContext({
    journeyState: input.journey,
    journeyContent: input.content,
    site: input.site,
  });
  const starters = starterCandidates(input.journey, input.content);
  const eligible = starters.filter(
    (candidate) => candidate.positiveForms.length > 0,
  );
  const starterBindings = starters.map(({ entryId, cardId }) => ({
    entryId,
    cardId,
  }));
  const eligibleBindings = eligible.map(({ entryId, cardId }) => ({
    entryId,
    cardId,
  }));
  const unavailable = (
    reason: ExplorationStarterCardTransfigurationUnavailableReason,
  ) =>
    unavailablePreparation({
      plan: input,
      starterCards: starterBindings,
      eligibleStarterCards: eligibleBindings,
      selectionContentRevision: context.selectionContentRevision,
      reason,
    });

  if (starters.length === 0) return unavailable("requires-starter-card");

  let selectedCandidates: StarterCandidate[];
  const selectors: RewardSelectionResult[] = [];
  if (input.effectKind === "transfigure-all-starter-cards") {
    if (eligible.length !== starters.length) {
      return unavailable("all-starter-cards-must-be-transfigurable");
    }
    selectedCandidates = eligible;
  } else {
    const count = input.count;
    if (
      !Number.isInteger(count) ||
      (count ?? 0) <= 0 ||
      eligible.length < (count ?? 0)
    ) {
      return unavailable("insufficient-transfigurable-starter-cards");
    }
    const eligibleIds = new Set(eligible.map(({ entryId }) => entryId));
    const targetSelection = selectReward(
      context,
      selectionRequest({
        journey: input.journey,
        site: input.site,
        actionId: input.actionId,
        suffix: "starter-targets",
        mechanicId: "purge-deck-entry",
        count: count as number,
        constraints: {
          allowStarters: true,
          distinctDeckEntries: true,
          excludedDeckEntryIds: input.journey.deck
            .filter((entry) => !eligibleIds.has(entry.entryId))
            .map((entry) => entry.entryId)
            .sort((left, right) => left.localeCompare(right)),
        },
      }),
    );
    if (!targetSelection.ok) {
      return unavailable("insufficient-transfigurable-starter-cards");
    }
    selectedCandidates = targetSelection.bindings.deckEntryIds.flatMap(
      (entryId) => {
        const candidate = eligible.find((item) => item.entryId === entryId);
        return candidate === undefined ? [] : [candidate];
      },
    );
    if (selectedCandidates.length !== count) {
      return unavailable("insufficient-transfigurable-starter-cards");
    }
    selectors.push(targetSelection);
  }

  const targets: ExplorationStarterCardTransfigurationTarget[] = [];
  for (const candidate of selectedCandidates) {
    const formSelection = selectReward(
      context,
      selectionRequest({
        journey: input.journey,
        site: input.site,
        actionId: input.actionId,
        suffix: `starter-form:${candidate.entryId}`,
        mechanicId: "transfigure-deck-entry",
        count: 1,
        constraints: {
          allowStarters: true,
          fixedDeckEntryId: candidate.entryId,
          allowedTransfigurations: candidate.positiveForms,
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
      !candidate.positiveForms.includes(binding.transfiguration)
    ) {
      return unavailable(
        input.effectKind === "transfigure-all-starter-cards"
          ? "all-starter-cards-must-be-transfigurable"
          : "insufficient-transfigurable-starter-cards",
      );
    }
    selectors.push(formSelection);
    targets.push({
      entryId: candidate.entryId,
      cardId: candidate.cardId,
      transfiguration: binding.transfiguration,
    });
  }

  return signedPreparation(input, {
    kind: preparationKind(input.effectKind),
    starterCards: starterBindings,
    eligibleStarterCards: eligibleBindings,
    targets,
    selectionRulesVersion: SELECTION_RULES_VERSION,
    selectionContentRevision: context.selectionContentRevision,
    selectionKey: parseSelectionKey(input.actionId),
    selectorSignatures: selectors.map((selection) => selection.signature),
    selectorTraces: selectors.map((selection) => selection.trace),
  });
}

/** Reject stale, tampered, or state-incompatible starter transfiguration plans. */
export function explorationStarterCardTransfigurationPreparationsEqual(
  actual: ExplorationStarterCardTransfigurationPreparation,
  expected: ExplorationStarterCardTransfigurationPreparation,
): boolean {
  const { planSignature: actualSignature, ...actualBody } = actual;
  const { planSignature: expectedSignature, ...expectedBody } = expected;
  return (
    actualSignature === expectedSignature &&
    stableDigest(actualBody) === stableDigest(expectedBody)
  );
}
