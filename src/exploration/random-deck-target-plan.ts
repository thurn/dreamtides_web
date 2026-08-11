import type { JourneyContent } from "../data/journey-content";
import type { ExplorationPredicate } from "../data/exploration";
import { buildRewardSelectionContext } from "../reward-selection/context";
import { selectReward } from "../reward-selection/selectReward";
import { stableDigest } from "../reward-selection/stable";
import {
  SELECTION_RULES_VERSION,
  type RewardSelectionContext,
  type RewardSelectionRequest,
  type RewardSelectionTrace,
  type SelectionRulesVersion,
} from "../reward-selection/types";
import type { CardData, CardType } from "../types/cards";
import type { JourneyState, SiteState } from "../types/journey";

export type ExplorationRandomDeckTargetEffectKind =
  "copy-random-cards" | "change-random-card-type" | "replace-random-with-card";

export interface ExplorationRandomDeckTargetBinding {
  entryId: string;
  cardId: string;
}

export type ExplorationRandomDeckTargetUnavailableReason =
  "invalid-authored-configuration" | "insufficient-eligible-cards";

export interface ExplorationRandomDeckTargetPreparation {
  effectKind: ExplorationRandomDeckTargetEffectKind;
  count: number;
  predicate?: ExplorationPredicate;
  cardType?: CardType;
  replacementCardId?: string;
  eligibleCards: readonly ExplorationRandomDeckTargetBinding[];
  targets: readonly ExplorationRandomDeckTargetBinding[];
  selectionRulesVersion: SelectionRulesVersion;
  selectionContentRevision: string;
  selectionKey: string;
  selectorSignature?: string;
  selectorTrace?: RewardSelectionTrace;
  unavailableReason?: ExplorationRandomDeckTargetUnavailableReason;
  planSignature: string;
}

export interface ExplorationRandomDeckTargetPlanInput {
  effectKind: ExplorationRandomDeckTargetEffectKind;
  predicate?: ExplorationPredicate;
  count?: number;
  cardType?: CardType;
  replacementCardId?: string;
  actionId: string;
  encounterCardId: string;
  journey: JourneyState;
  site: SiteState;
  content: JourneyContent;
}

const EXPLORATION_PREDICATES: ReadonlySet<ExplorationPredicate> = new Set([
  "character",
  "event",
  "cheap-character",
  "legendary",
  "spirit-animal",
  "survivor",
  "warrior",
]);

function matchesPredicate(
  card: CardData,
  predicate: ExplorationPredicate,
  content: JourneyContent,
): boolean {
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
    case "legendary":
      return card.rarity === "Legendary";
    case "spirit-animal":
      return card.cardType === "Character" && card.subtype === "Spirit Animal";
    case "survivor":
      return card.cardType === "Character" && card.subtype === "Survivor";
    case "warrior":
      return card.cardType === "Character" && card.subtype === "Warrior";
  }
}

function isValidAuthoredInput(
  input: ExplorationRandomDeckTargetPlanInput,
): boolean {
  if (input.effectKind === "replace-random-with-card") {
    return (
      input.count === undefined &&
      input.predicate !== undefined &&
      EXPLORATION_PREDICATES.has(input.predicate) &&
      input.cardType === undefined &&
      typeof input.replacementCardId === "string" &&
      [...input.content.cardDatabase.values()].some(
        (card) => card.id === input.replacementCardId,
      )
    );
  }
  if (!Number.isInteger(input.count) || (input.count ?? 0) <= 0) return false;
  if (input.effectKind === "copy-random-cards") {
    return (
      input.predicate !== undefined &&
      EXPLORATION_PREDICATES.has(input.predicate) &&
      input.cardType === undefined &&
      input.replacementCardId === undefined
    );
  }
  return (
    input.predicate === undefined &&
    (input.cardType === "Character" || input.cardType === "Event") &&
    input.replacementCardId === undefined
  );
}

function targetCount(input: ExplorationRandomDeckTargetPlanInput): number {
  return input.effectKind === "replace-random-with-card"
    ? 1
    : (input.count ?? 0);
}

function eligibleBindings(
  input: ExplorationRandomDeckTargetPlanInput,
  context: RewardSelectionContext,
): ExplorationRandomDeckTargetBinding[] {
  return context.effectiveDeckCards
    .filter(({ effectiveCard }) =>
      input.effectKind === "copy-random-cards" ||
      input.effectKind === "replace-random-with-card"
        ? input.predicate !== undefined &&
          matchesPredicate(effectiveCard, input.predicate, input.content)
        : input.cardType !== undefined &&
          effectiveCard.cardType !== input.cardType,
    )
    .map(({ entry, baseCard }) => ({
      entryId: entry.entryId,
      cardId: baseCard.id,
    }))
    .sort(
      (left, right) =>
        left.entryId.localeCompare(right.entryId) ||
        left.cardId.localeCompare(right.cardId),
    );
}

function selectionKey(input: ExplorationRandomDeckTargetPlanInput): string {
  return `${input.actionId}:random-deck-targets`;
}

function signedPreparation(
  input: ExplorationRandomDeckTargetPlanInput,
  preparation: Omit<ExplorationRandomDeckTargetPreparation, "planSignature">,
): ExplorationRandomDeckTargetPreparation {
  return {
    ...preparation,
    planSignature: stableDigest({
      effect: {
        kind: input.effectKind,
        count: preparation.count,
        predicate: input.predicate ?? null,
        cardType: input.cardType ?? null,
        replacementCardId: input.replacementCardId ?? null,
      },
      actionId: input.actionId,
      encounterCardId: input.encounterCardId,
      siteId: input.site.id,
      preparation,
    }),
  };
}

function unavailablePreparation(input: {
  plan: ExplorationRandomDeckTargetPlanInput;
  eligibleCards: readonly ExplorationRandomDeckTargetBinding[];
  selectionContentRevision: string;
  reason: ExplorationRandomDeckTargetUnavailableReason;
}): ExplorationRandomDeckTargetPreparation {
  return signedPreparation(input.plan, {
    effectKind: input.plan.effectKind,
    count: targetCount(input.plan),
    ...(input.plan.predicate === undefined
      ? {}
      : { predicate: input.plan.predicate }),
    ...(input.plan.cardType === undefined
      ? {}
      : { cardType: input.plan.cardType }),
    ...(input.plan.replacementCardId === undefined
      ? {}
      : { replacementCardId: input.plan.replacementCardId }),
    eligibleCards: input.eligibleCards,
    targets: [],
    selectionRulesVersion: SELECTION_RULES_VERSION,
    selectionContentRevision: input.selectionContentRevision,
    selectionKey: selectionKey(input.plan),
    unavailableReason: input.reason,
  });
}

/**
 * Prepare an exact, signed set of concrete deck-entry targets for automatic
 * copy, card-type-change, and fixed-replacement Exploration actions.
 */
export function prepareExplorationRandomDeckTargetPlan(
  input: ExplorationRandomDeckTargetPlanInput,
): ExplorationRandomDeckTargetPreparation {
  const context = buildRewardSelectionContext({
    journeyState: input.journey,
    journeyContent: input.content,
    site: input.site,
  });
  const validAuthoredInput = isValidAuthoredInput(input);
  const eligibleCards = validAuthoredInput
    ? eligibleBindings(input, context)
    : [];
  const unavailable = (reason: ExplorationRandomDeckTargetUnavailableReason) =>
    unavailablePreparation({
      plan: input,
      eligibleCards,
      selectionContentRevision: context.selectionContentRevision,
      reason,
    });
  if (!validAuthoredInput) {
    return unavailable("invalid-authored-configuration");
  }
  const count = targetCount(input);
  if (eligibleCards.length < count) {
    return unavailable("insufficient-eligible-cards");
  }

  const eligibleIds = new Set(eligibleCards.map(({ entryId }) => entryId));
  const request: RewardSelectionRequest = {
    mechanicId:
      input.effectKind === "copy-random-cards"
        ? "duplicate-deck-entry"
        : input.effectKind === "change-random-card-type"
          ? "change-entry-card-type"
          : "replace-deck-entry",
    policyId: "uniform",
    scope: {
      journeySeed: input.journey.seed,
      siteUuid: input.site.id,
      selectionKey: selectionKey(input),
    },
    count,
    constraints: {
      ...(input.predicate === undefined ? {} : { predicate: input.predicate }),
      allowStarters: true,
      allowNightmare: true,
      distinctDeckEntries: true,
      excludedDeckEntryIds: input.journey.deck
        .filter((entry) => !eligibleIds.has(entry.entryId))
        .map((entry) => entry.entryId)
        .sort((left, right) => left.localeCompare(right)),
    },
  };
  const selection = selectReward(context, request);
  if (!selection.ok) return unavailable("insufficient-eligible-cards");

  const eligibleByEntry = new Map(
    eligibleCards.map((binding) => [binding.entryId, binding]),
  );
  const targets = selection.bindings.deckEntryIds.flatMap((entryId) => {
    const binding = eligibleByEntry.get(entryId);
    return binding === undefined ? [] : [binding];
  });
  if (
    targets.length !== count ||
    new Set(targets.map(({ entryId }) => entryId)).size !== count ||
    selection.bindings.cardUuids.length !== count ||
    targets.some(
      ({ cardId }, index) => selection.bindings.cardUuids[index] !== cardId,
    )
  ) {
    return unavailable("insufficient-eligible-cards");
  }

  return signedPreparation(input, {
    effectKind: input.effectKind,
    count,
    ...(input.predicate === undefined ? {} : { predicate: input.predicate }),
    ...(input.cardType === undefined ? {} : { cardType: input.cardType }),
    ...(input.replacementCardId === undefined
      ? {}
      : { replacementCardId: input.replacementCardId }),
    eligibleCards,
    targets,
    selectionRulesVersion: SELECTION_RULES_VERSION,
    selectionContentRevision: context.selectionContentRevision,
    selectionKey: request.scope.selectionKey,
    selectorSignature: selection.signature,
    selectorTrace: selection.trace,
  });
}

/** Reject stale or mutated prepared targets even when a signature is retained. */
export function explorationRandomDeckTargetPreparationsEqual(
  actual: ExplorationRandomDeckTargetPreparation,
  expected: ExplorationRandomDeckTargetPreparation,
): boolean {
  const { planSignature: actualSignature, ...actualBody } = actual;
  const { planSignature: expectedSignature, ...expectedBody } = expected;
  return (
    actualSignature === expectedSignature &&
    stableDigest(actualBody) === stableDigest(expectedBody)
  );
}
