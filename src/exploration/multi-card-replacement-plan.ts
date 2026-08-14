import { resolveDeckEntryCard } from "../card-type-change";
import type { ExplorationPredicate } from "../data/exploration";
import type { JourneyContent } from "../data/journey-content";
import { buildRewardSelectionContext } from "../reward-selection/context";
import { selectReward } from "../reward-selection/selectReward";
import { stableDigest } from "../reward-selection/stable";
import {
  SELECTION_RULES_VERSION,
  type RewardSelectionRequest,
  type RewardSelectionTrace,
} from "../reward-selection/types";
import type { CardData } from "../types/cards";
import type { JourneyState, SiteState } from "../types/journey";
import type { DeckEntryId, SelectionKey } from "../types/identifiers";
import type { CardId } from "../types/card-identity";
import { asCardId } from "../types/card-identity";
import type { ExplorationActionId } from "../types/identifiers";
import { asSelectionKey } from "../types/identifiers";

export interface MultiCardReplacementBinding {
  sourceEntryId: DeckEntryId;
  sourceCardId: CardId;
  replacementCardId: CardId;
}

export interface MultiCardReplacementPreparation {
  kind: "chosen-replacement";
  predicate: ExplorationPredicate;
  authoredMaximumCount: number;
  bindings: readonly MultiCardReplacementBinding[];
  selectionRulesVersion: string;
  selectionContentRevision: string;
  selectionKey: SelectionKey;
  selectorSignatures: readonly string[];
  selectorTraces: readonly RewardSelectionTrace[];
  unavailableReason?: "requires-eligible-card";
  planSignature: string;
}

export interface MultiCardReplacementPlanInput {
  actionId: ExplorationActionId;
  encounterCardId: CardId;
  predicate: ExplorationPredicate;
  count: number;
  journey: JourneyState;
  site: SiteState;
  content: JourneyContent;
}

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

function replacementRequest(input: {
  plan: MultiCardReplacementPlanInput;
  sourceEntryId: DeckEntryId;
  sourceCardId: CardId;
}): RewardSelectionRequest {
  return {
    mechanicId: "gain-card",
    policyId: "card-fit-quality",
    scope: {
      journeySeed: input.plan.journey.seed,
      siteUuid: input.plan.site.id,
      selectionKey: asSelectionKey(
        `${input.plan.actionId}:replacement:${input.sourceEntryId}`,
      ),
    },
    count: 1,
    constraints: {
      predicate: input.plan.predicate,
      cardScope: "draft-pool",
      excludeOwned: true,
      excludedCardUuids: [input.plan.encounterCardId, input.sourceCardId],
    },
  };
}

function signedPreparation(
  input: MultiCardReplacementPlanInput,
  preparation: Omit<MultiCardReplacementPreparation, "planSignature">,
): MultiCardReplacementPreparation {
  return {
    ...preparation,
    planSignature: stableDigest({
      effectKind: "replace-selected",
      actionId: input.actionId,
      encounterCardId: input.encounterCardId,
      siteId: input.site.id,
      predicate: input.predicate,
      authoredMaximumCount: input.count,
      preparation,
    }),
  };
}

/**
 * Prepare one concealed same-predicate replacement for every current source
 * entry that can be replaced. Concrete entry UUIDs keep duplicate base cards
 * independent, and each selector has its own deterministic stream.
 */
export function prepareMultiCardReplacementPlan(
  input: MultiCardReplacementPlanInput,
): MultiCardReplacementPreparation {
  if (!Number.isInteger(input.count) || input.count <= 1) {
    throw new Error(
      "Multi-card replacement plans require an authored maximum count greater than one",
    );
  }
  const context = buildRewardSelectionContext({
    journeyState: input.journey,
    journeyContent: input.content,
    site: input.site,
  });
  const bindings: MultiCardReplacementBinding[] = [];
  const selectorSignatures: string[] = [];
  const selectorTraces: RewardSelectionTrace[] = [];

  const sourceEntries = input.journey.deck
    .flatMap((entry) => {
      const baseCard = input.content.cardDatabase.get(entry.cardNumber);
      if (baseCard === undefined) return [];
      const effectiveCard = resolveDeckEntryCard(
        input.content.transfigurationData,
        baseCard,
        entry,
      );
      return matchesPredicate(effectiveCard, input.predicate, input.content)
        ? [{ entry, baseCard }]
        : [];
    })
    .sort(
      (left, right) =>
        left.entry.entryId.localeCompare(right.entry.entryId) ||
        left.baseCard.id.localeCompare(right.baseCard.id),
    );

  for (const { entry, baseCard } of sourceEntries) {
    const selected = selectReward(
      context,
      replacementRequest({
        plan: input,
        sourceEntryId: entry.entryId,
        sourceCardId: baseCard.id,
      }),
    );
    const replacementCardId = selected.ok
      ? selected.bindings.cardUuids[0]
      : undefined;
    if (
      !selected.ok ||
      replacementCardId === undefined ||
      replacementCardId === baseCard.id ||
      replacementCardId === input.encounterCardId
    ) {
      continue;
    }
    bindings.push({
      sourceEntryId: entry.entryId,
      sourceCardId: baseCard.id,
      replacementCardId: asCardId(replacementCardId),
    });
    selectorSignatures.push(selected.signature);
    selectorTraces.push(selected.trace);
  }

  return signedPreparation(input, {
    kind: "chosen-replacement",
    predicate: input.predicate,
    authoredMaximumCount: input.count,
    bindings,
    selectionRulesVersion: SELECTION_RULES_VERSION,
    selectionContentRevision: context.selectionContentRevision,
    selectionKey: asSelectionKey(input.actionId),
    selectorSignatures,
    selectorTraces,
    ...(bindings.length === 0
      ? { unavailableReason: "requires-eligible-card" as const }
      : {}),
  });
}

/** Reject stale, tampered, or state-incompatible multi-card replacement plans. */
export function multiCardReplacementPreparationsEqual(
  actual: MultiCardReplacementPreparation,
  expected: MultiCardReplacementPreparation,
): boolean {
  const { planSignature: actualSignature, ...actualBody } = actual;
  const { planSignature: expectedSignature, ...expectedBody } = expected;
  return (
    actualSignature === expectedSignature &&
    stableDigest(actualBody) === stableDigest(expectedBody)
  );
}
