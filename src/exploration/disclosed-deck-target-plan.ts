import type { JourneyContent } from "../data/journey-content";
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
import type { CardType } from "../types/cards";
import type { JourneyState, SiteState } from "../types/journey";
import type { DeckEntryId, SelectionKey } from "../types/identifiers";
import type { CardId } from "../types/card-identity";
import type { ExplorationActionId } from "../types/identifiers";
import { parseSelectionKey } from "../types/identifiers";
import type { SelectionContentRevision } from "../types/selection-content-revision";

export type ExplorationDisclosedDeckTargetEffectKind =
  "change-card-type-selected";

export interface ExplorationDisclosedDeckTargetBinding {
  entryId: DeckEntryId;
  cardId: CardId;
}

export type ExplorationDisclosedDeckTargetUnavailableReason =
  "invalid-authored-configuration" | "no-eligible-cards";

/** One disclosed concrete deck target prepared when an Exploration site opens. */
export interface ExplorationDisclosedDeckTargetPreparation {
  effectKind: ExplorationDisclosedDeckTargetEffectKind;
  cardType: CardType;
  eligibleCards: readonly ExplorationDisclosedDeckTargetBinding[];
  target: ExplorationDisclosedDeckTargetBinding | null;
  selectionRulesVersion: SelectionRulesVersion;
  selectionContentRevision: SelectionContentRevision;
  selectionKey: SelectionKey;
  selectorSignature?: string;
  selectorTrace?: RewardSelectionTrace;
  unavailableReason?: ExplorationDisclosedDeckTargetUnavailableReason;
  planSignature: string;
}

export interface ExplorationDisclosedDeckTargetPlanInput {
  effectKind: ExplorationDisclosedDeckTargetEffectKind;
  cardType: CardType;
  actionId: ExplorationActionId;
  encounterCardId: CardId;
  journey: JourneyState;
  site: SiteState;
  content: JourneyContent;
}

function isValidAuthoredInput(
  input: ExplorationDisclosedDeckTargetPlanInput,
): boolean {
  return (
    input.effectKind === "change-card-type-selected" &&
    (input.cardType === "Character" || input.cardType === "Event")
  );
}

function selectionKey(
  input: ExplorationDisclosedDeckTargetPlanInput,
): SelectionKey {
  return parseSelectionKey(`${input.actionId}:disclosed-deck-target`);
}

function eligibleBindings(
  input: ExplorationDisclosedDeckTargetPlanInput,
  context: RewardSelectionContext,
): ExplorationDisclosedDeckTargetBinding[] {
  return context.effectiveDeckCards
    .filter(
      ({ baseCard, effectiveCard }) =>
        baseCard.id !== input.encounterCardId &&
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

function signedPreparation(
  input: ExplorationDisclosedDeckTargetPlanInput,
  preparation: Omit<ExplorationDisclosedDeckTargetPreparation, "planSignature">,
): ExplorationDisclosedDeckTargetPreparation {
  return {
    ...preparation,
    planSignature: stableDigest({
      effectKind: input.effectKind,
      cardType: input.cardType,
      actionId: input.actionId,
      encounterCardId: input.encounterCardId,
      siteId: input.site.id,
      preparation,
    }),
  };
}

function unavailablePreparation(input: {
  plan: ExplorationDisclosedDeckTargetPlanInput;
  eligibleCards: readonly ExplorationDisclosedDeckTargetBinding[];
  selectionContentRevision: SelectionContentRevision;
  reason: ExplorationDisclosedDeckTargetUnavailableReason;
}): ExplorationDisclosedDeckTargetPreparation {
  return signedPreparation(input.plan, {
    effectKind: "change-card-type-selected",
    cardType: input.plan.cardType,
    eligibleCards: input.eligibleCards,
    target: null,
    selectionRulesVersion: SELECTION_RULES_VERSION,
    selectionContentRevision: input.selectionContentRevision,
    selectionKey: selectionKey(input.plan),
    unavailableReason: input.reason,
  });
}

/**
 * Prepare one disclosed, signed deck-entry target whose effective card type is
 * opposite the authored destination type.
 */
export function prepareExplorationDisclosedDeckTargetPlan(
  input: ExplorationDisclosedDeckTargetPlanInput,
): ExplorationDisclosedDeckTargetPreparation {
  const context = buildRewardSelectionContext({
    journeyState: input.journey,
    journeyContent: input.content,
    site: input.site,
  });
  if (!isValidAuthoredInput(input)) {
    return unavailablePreparation({
      plan: input,
      eligibleCards: [],
      selectionContentRevision: context.selectionContentRevision,
      reason: "invalid-authored-configuration",
    });
  }

  const eligibleCards = eligibleBindings(input, context);
  const unavailable = () =>
    unavailablePreparation({
      plan: input,
      eligibleCards,
      selectionContentRevision: context.selectionContentRevision,
      reason: "no-eligible-cards",
    });
  if (eligibleCards.length === 0) return unavailable();

  const eligibleEntryIds = new Set(eligibleCards.map(({ entryId }) => entryId));
  const request: RewardSelectionRequest = {
    mechanicId: "change-entry-card-type",
    policyId: "deck-entry-centrality",
    scope: {
      journeySeed: input.journey.seed,
      siteUuid: input.site.id,
      selectionKey: selectionKey(input),
    },
    count: 1,
    constraints: {
      allowStarters: true,
      allowNightmare: true,
      distinctDeckEntries: true,
      excludedCardUuids: [input.encounterCardId],
      excludedDeckEntryIds: input.journey.deck
        .filter((entry) => !eligibleEntryIds.has(entry.entryId))
        .map((entry) => entry.entryId)
        .sort((left, right) => left.localeCompare(right)),
    },
  };
  const selection = selectReward(context, request);
  if (!selection.ok) return unavailable();

  const selectedEntryId = selection.bindings.deckEntryIds[0];
  const selectedCardId = selection.bindings.cardUuids[0];
  const target = eligibleCards.find(
    ({ entryId }) => entryId === selectedEntryId,
  );
  if (
    selection.bindings.deckEntryIds.length !== 1 ||
    selection.bindings.cardUuids.length !== 1 ||
    target === undefined ||
    target.cardId !== selectedCardId
  ) {
    return unavailable();
  }

  return signedPreparation(input, {
    effectKind: input.effectKind,
    cardType: input.cardType,
    eligibleCards,
    target,
    selectionRulesVersion: SELECTION_RULES_VERSION,
    selectionContentRevision: context.selectionContentRevision,
    selectionKey: request.scope.selectionKey,
    selectorSignature: selection.signature,
    selectorTrace: selection.trace,
  });
}

/** Reject stale or mutated disclosed targets even with a retained signature. */
export function explorationDisclosedDeckTargetPreparationsEqual(
  actual: ExplorationDisclosedDeckTargetPreparation,
  expected: ExplorationDisclosedDeckTargetPreparation,
): boolean {
  const { planSignature: actualSignature, ...actualBody } = actual;
  const { planSignature: expectedSignature, ...expectedBody } = expected;
  return (
    actualSignature === expectedSignature &&
    stableDigest(actualBody) === stableDigest(expectedBody)
  );
}
