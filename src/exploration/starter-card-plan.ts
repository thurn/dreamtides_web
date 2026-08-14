import type { JourneyContent } from "../data/journey-content";
import { buildRewardSelectionContext } from "../reward-selection/context";
import { selectReward } from "../reward-selection/selectReward";
import { stableDigest } from "../reward-selection/stable";
import {
  SELECTION_RULES_VERSION,
  type RewardCardPredicate,
  type RewardSelectionRequest,
  type RewardSelectionResult,
} from "../reward-selection/types";
import type { CardData } from "../types/cards";
import type {
  ExplorationStarterCardBinding,
  ExplorationStarterCardEffectKind,
  ExplorationStarterCardPreparation,
  ExplorationStarterCardUnavailableReason,
  JourneyState,
  SiteState,
} from "../types/journey";
import type { CardId } from "../types/card-identity";
import type {
  DeckEntryId,
  ExplorationActionId,
  IdentityRecord,
} from "../types/identifiers";
import { asSelectionKey } from "../types/identifiers";

export interface ExplorationStarterCardPlanInput {
  effectKind: ExplorationStarterCardEffectKind;
  predicate?: RewardCardPredicate;
  actionId: ExplorationActionId;
  encounterCardId: CardId;
  journey: JourneyState;
  site: SiteState;
  content: JourneyContent;
}

function isStarterCardRole(card: CardData): boolean {
  return (
    card.isStarter === true || card.roles?.includes("starter-deck") === true
  );
}

function eligibleStarterCards(
  journey: JourneyState,
  content: JourneyContent,
): ExplorationStarterCardBinding[] {
  return journey.deck
    .flatMap((entry) => {
      const card = content.cardDatabase.get(entry.cardNumber);
      return card === undefined || !isStarterCardRole(card)
        ? []
        : [{ entryId: entry.entryId, cardId: card.id }];
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
  suffix: "starter-target" | "gain" | "replacements";
  mechanicId: RewardSelectionRequest["mechanicId"];
  policyId: RewardSelectionRequest["policyId"];
  count: number;
  constraints: NonNullable<RewardSelectionRequest["constraints"]>;
}): RewardSelectionRequest {
  return {
    mechanicId: input.mechanicId,
    policyId: input.policyId,
    scope: {
      journeySeed: input.journey.seed,
      siteUuid: input.site.id,
      selectionKey: asSelectionKey(`${input.actionId}:${input.suffix}`),
    },
    count: input.count,
    constraints: input.constraints,
  };
}

function planSignature(
  preparation: Omit<ExplorationStarterCardPreparation, "planSignature">,
): string {
  return stableDigest(preparation);
}

function signedPreparation(
  preparation: Omit<ExplorationStarterCardPreparation, "planSignature">,
): ExplorationStarterCardPreparation {
  return {
    ...preparation,
    planSignature: planSignature(preparation),
  };
}

/**
 * Prepare the complete starter-card mutation while the site is opened. The
 * returned plan contains every concrete target and replacement needed for a
 * replayable, all-or-nothing resolution.
 */
export function prepareExplorationStarterCardPlan(
  input: ExplorationStarterCardPlanInput,
): ExplorationStarterCardPreparation {
  const context = buildRewardSelectionContext({
    journeyState: input.journey,
    journeyContent: input.content,
    site: input.site,
  });
  const eligible = eligibleStarterCards(input.journey, input.content);
  const selectors: RewardSelectionResult[] = [];
  let purged = eligible;
  let unavailableReason: ExplorationStarterCardUnavailableReason | undefined;

  if (eligible.length === 0) {
    purged = [];
    unavailableReason = "requires-starter-card";
  } else if (input.effectKind !== "replace-all-starter-cards") {
    const target = selectReward(
      context,
      selectionRequest({
        journey: input.journey,
        site: input.site,
        actionId: input.actionId,
        suffix: "starter-target",
        mechanicId: "purge-deck-entry",
        policyId: "uniform",
        count: 1,
        constraints: {
          starterOnly: true,
          distinctDeckEntries: true,
        },
      }),
    );
    const targetEntryId = target.ok
      ? target.bindings.deckEntryIds[0]
      : undefined;
    const selected = eligible.find((item) => item.entryId === targetEntryId);
    if (!target.ok || selected === undefined) {
      purged = [];
      unavailableReason = "requires-starter-card";
    } else {
      selectors.push(target);
      purged = [selected];
    }
  }

  const replacementCardIdByEntryId: IdentityRecord<DeckEntryId, CardId> = {};
  if (
    unavailableReason === undefined &&
    (input.effectKind === "purge-random-starter-and-gain-card" ||
      input.effectKind === "replace-all-starter-cards")
  ) {
    const predicate = input.predicate;
    const selection =
      predicate === undefined
        ? null
        : selectReward(
            context,
            selectionRequest({
              journey: input.journey,
              site: input.site,
              actionId: input.actionId,
              suffix:
                input.effectKind === "replace-all-starter-cards"
                  ? "replacements"
                  : "gain",
              mechanicId: "gain-card",
              policyId:
                input.effectKind === "replace-all-starter-cards"
                  ? "card-bundle"
                  : "card-fit-quality",
              count: purged.length,
              constraints: {
                predicate,
                cardScope: "draft-pool",
                excludeOwned: true,
                excludedCardUuids: [input.encounterCardId],
                distinctCards: true,
              },
            }),
          );
    if (
      selection === null ||
      !selection.ok ||
      selection.bindings.cardUuids.length !== purged.length ||
      new Set(selection.bindings.cardUuids).size !== purged.length
    ) {
      unavailableReason = "insufficient-replacement-cards";
    } else {
      selectors.push(selection);
      purged.forEach((starter, index) => {
        const replacementCardId = selection.bindings.cardUuids[index];
        if (replacementCardId !== undefined) {
          replacementCardIdByEntryId[starter.entryId] = replacementCardId;
        }
      });
    }
  }

  return signedPreparation({
    kind: input.effectKind,
    eligibleStarterCards: eligible,
    purgedEntryIds: purged.map((item) => item.entryId),
    purgedCardIds: purged.map((item) => item.cardId),
    replacementCardIdByEntryId: replacementCardIdByEntryId,
    selectionRulesVersion: SELECTION_RULES_VERSION,
    selectionContentRevision: context.selectionContentRevision,
    selectionKey: asSelectionKey(input.actionId),
    selectorSignatures: selectors.map((selection) => selection.signature),
    selectorTraces: selectors.map((selection) => selection.trace),
    ...(unavailableReason === undefined ? {} : { unavailableReason }),
  });
}

/** Reject stale, tampered, or state-incompatible starter-card plans. */
export function explorationStarterCardPreparationsEqual(
  actual: ExplorationStarterCardPreparation,
  expected: ExplorationStarterCardPreparation,
): boolean {
  const { planSignature: actualSignature, ...actualBody } = actual;
  return (
    actualSignature === planSignature(actualBody) &&
    actualSignature === expected.planSignature &&
    stableDigest(actual) === stableDigest(expected)
  );
}
