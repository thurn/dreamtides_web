// Rules validation deciding whether a prepared Exploration action offer is
// still usable: each effect kind's prepared plan must be the offer's
// preparation, match the authored action, agree with the offer's selection
// evidence, and bind to cards that are still in the deck.

import { resolveDeckEntryCard } from "../card-type-change";
import {
  explorationActionUsesOfferedDeckTarget,
  type ExplorationActionContent,
  type ExplorationPredicate,
} from "../data/exploration";
import type { JourneyContent } from "../data/journey-content";
import { activeSiteIdOf } from "../rules/journey/sites";
import { offeredTransfigurationForms } from "../transfiguration/transfiguration-logic";
import { AUGURY_TUNING } from "../journey_v2/tuning";
import type { CardId } from "../types/card-identity";
import type { CardData } from "../types/cards";
import type { DeckEntryId } from "../types/identifiers";
import {
  parseRewardCandidateKey,
  parseSelectionKey,
} from "../types/identifiers";
import type {
  DeckEntry,
  ExplorationActionOfferRuntime,
  ExplorationOfferPlan,
  ExplorationOfferPreparationKind,
  JourneyState,
} from "../types/journey";

/**
 * The offer's prepared plan when it belongs to the `kind` family, otherwise
 * undefined.
 */
export function explorationOfferPlan<K extends ExplorationOfferPreparationKind>(
  offer: Pick<ExplorationActionOfferRuntime, "preparation"> | null | undefined,
  kind: K,
): ExplorationOfferPlan<K> | undefined {
  const preparation = offer?.preparation;
  if (preparation === undefined || preparation.kind !== kind) return undefined;
  return preparation.plan as ExplorationOfferPlan<K>;
}

/**
 * The parts of an action's follow-up step that offer usability reads. The
 * Exploration screen's follow-up view satisfies this shape.
 */
export type OfferUsabilityFollowup =
  | {
      readonly kind:
        | "none"
        | "transfiguration"
        | "multi-card-transfiguration"
        | "cards"
        | "packs"
        | "subtypes"
        | "avatars";
    }
  | { readonly kind: "dreamsigns"; readonly dreamsigns: readonly unknown[] }
  | {
      readonly kind: "dreamsign-flow";
      readonly offered: readonly unknown[];
      readonly held: readonly unknown[];
      readonly requiredOverflowReplacementCount: number;
    }
  | { readonly kind: "site-types"; readonly choices: readonly unknown[] };

export function matchesPredicate(
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
          (content.rewardSelectionData?.tuning.costBands
            .cheapCharacterMaximum ??
            AUGURY_TUNING.costBands.cheapCharacterMaximum)
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

export function cardById(
  content: JourneyContent,
  cardId: CardId,
): CardData | null {
  return (
    [...content.cardDatabase.values()].find((card) => card.id === cardId) ??
    null
  );
}

export function hasStarterCardRole(card: CardData): boolean {
  return (
    card.isStarter === true || card.roles?.includes("starter-deck") === true
  );
}

export function sameOrderedIds<Value>(
  actual: readonly Value[],
  expected: readonly Value[],
): boolean {
  return (
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

/** The deck entry's current card after transfiguration and modifications. */
function resolvedDeckCard(
  entry: DeckEntry,
  content: JourneyContent,
): CardData | null {
  const base = content.cardDatabase.get(entry.cardNumber);
  return base === undefined
    ? null
    : resolveDeckEntryCard(content.transfigurationData, base, entry);
}

/** Whether `action` resolves through a prepared Dreamsign plan. */
function usesDreamsignPreparation(action: ExplorationActionContent): boolean {
  return (
    action.effectKind === "gain-nightmare-and-dreamsign" ||
    action.effectKind === "gain-nightmare-and-offered-dreamsign" ||
    action.effectKind === "gain-offered-dreamsign" ||
    action.effectKind === "replace-selected-dreamsign-with-offered" ||
    action.effectKind === "replace-all-dreamsigns-random" ||
    action.effectKind === "purge-selected-dreamsign-and-gain-random"
  );
}

/**
 * Whether `action` resolves through a prepared starter-card purge or
 * replacement plan.
 */
export function usesStarterCardPreparation(
  action: ExplorationActionContent,
): boolean {
  return (
    action.effectKind === "purge-starter-card" ||
    action.effectKind === "purge-random-starter-card" ||
    action.effectKind === "purge-random-starter-and-gain-card" ||
    action.effectKind === "replace-all-starter-cards"
  );
}

/**
 * Whether `action` resolves through a prepared starter-card transfiguration
 * plan.
 */
export function usesStarterCardTransfigurationPreparation(
  action: ExplorationActionContent,
): boolean {
  return (
    action.effectKind === "transfigure-random-starter-cards" ||
    action.effectKind === "transfigure-all-starter-cards"
  );
}

/**
 * Whether `action` resolves through a prepared multi-card transfiguration plan.
 */
export function usesMultiCardTransfigurationPreparation(
  action: ExplorationActionContent,
): boolean {
  return (
    (action.effectKind === "transfigure-selected" && (action.count ?? 1) > 1) ||
    (action.effectKind === "transfigure-fixed-selected" &&
      (action.count ?? 1) > 1) ||
    action.effectKind === "transfigure-random-cards" ||
    action.effectKind === "transfigure-fixed-random-cards"
  );
}

/** Whether `action` resolves through a prepared multi-card replacement plan. */
function usesMultiCardReplacementPreparation(
  action: ExplorationActionContent,
): boolean {
  return action.effectKind === "replace-selected" && (action.count ?? 1) > 1;
}

/** Whether `action` resolves through a prepared random deck-target plan. */
export function usesRandomDeckTargetPreparation(
  action: ExplorationActionContent,
): boolean {
  return (
    action.effectKind === "copy-random-cards" ||
    action.effectKind === "replace-random-with-card"
  );
}

/** Whether `action` resolves through a prepared disclosed deck-target plan. */
function usesDisclosedDeckTargetPreparation(
  action: ExplorationActionContent,
): boolean {
  return (
    action.effectKind === "change-card-type-selected" &&
    action.deckTarget === "offered"
  );
}

/** Whether `action` resolves through a prepared compound-action plan. */
function usesCompoundActionPreparation(
  action: ExplorationActionContent,
): boolean {
  return (
    action.effectKind === "transfigure-all-cards" ||
    action.effectKind === "purge-disclosed-and-transfigure-same-type" ||
    action.effectKind === "make-predicate-fast-and-gain-nightmares" ||
    action.effectKind === "take-transfigured-cards-and-gain-nightmares" ||
    action.effectKind === "purge-one-transfigure-and-copy-others"
  );
}

/**
 * Whether an Exploration action offer carries every prepared plan its effect
 * kind requires, and each plan still agrees with the authored action, the
 * offer's persisted selection evidence, and the current journey state.
 */
export function hasUsableExplorationOffer(params: {
  readonly action: ExplorationActionContent;
  readonly offer: ExplorationActionOfferRuntime;
  readonly state: JourneyState;
  readonly content: JourneyContent;
  readonly followup: OfferUsabilityFollowup;
  /**
   * Card UUID of the disclosed starter-card purge target, when one resolves.
   */
  readonly starterTargetCardId: CardId | undefined;
  /** Whether the action's disclosed deck-card target resolves in the deck. */
  readonly hasDeckCardTarget: boolean;
}): boolean {
  const {
    action,
    offer,
    state,
    content,
    followup,
    starterTargetCardId,
    hasDeckCardTarget,
  } = params;
  const requiresDeckCardTarget =
    explorationActionUsesOfferedDeckTarget(action) ||
    action.effectKind === "purge-disclosed-and-transfigure-same-type";
  const essence =
    offer.preparation?.kind === "essence" ? offer.preparation : undefined;
  const hasPreparedRandomEssence =
    action.effectKind !== "gain-random-essence" ||
    (essence !== undefined &&
      Number.isInteger(essence.amount) &&
      essence.plan.purpose === "essence-amount" &&
      essence.plan.minimumEssence === action.minimumEssence &&
      essence.plan.maximumEssence === action.maximumEssence &&
      essence.amount >= (action.minimumEssence ?? 0) &&
      essence.amount <= (action.maximumEssence ?? Number.POSITIVE_INFINITY));
  return !hasPreparedRandomEssence
    ? false
    : usesCompoundActionPreparation(action)
      ? hasUsableCompoundActionPreparation(action, offer, state, content)
      : usesDreamsignPreparation(action)
        ? hasUsableDreamsignPreparation(action, offer, followup)
        : usesStarterCardPreparation(action)
          ? hasUsableStarterCardPreparation(action, offer, starterTargetCardId)
          : usesStarterCardTransfigurationPreparation(action)
            ? hasUsableStarterCardTransfigurationPreparation(
                action,
                offer,
                state,
                content,
              )
            : usesMultiCardTransfigurationPreparation(action)
              ? hasUsableMultiCardTransfigurationPreparation(
                  action,
                  offer,
                  state,
                  content,
                )
              : usesMultiCardReplacementPreparation(action)
                ? hasUsableMultiCardReplacementPreparation(
                    action,
                    offer,
                    state,
                    content,
                  )
                : usesDisclosedDeckTargetPreparation(action)
                  ? hasUsableDisclosedDeckTargetPreparation(
                      action,
                      offer,
                      state,
                      content,
                    )
                  : usesRandomDeckTargetPreparation(action)
                    ? hasUsableRandomDeckTargetPreparation(
                        action,
                        offer,
                        state,
                        content,
                      )
                    : action.effectKind === "add-fixed-site"
                      ? hasUsableSiteInsertionPreparation(action, offer, state)
                      : action.effectKind === "choose-site-type"
                        ? hasUsableSiteTypeChoicePreparation(
                            action,
                            offer,
                            state,
                            followup,
                          )
                        : action.effectKind === "gain-random-dreamsign"
                          ? (offer.offeredDreamsignIds?.length ?? 0) > 0
                          : action.effectKind === "transfigure-all-for-essence"
                            ? (offer.eligibleDeckEntryIds?.length ?? 0) > 0 &&
                              Number.isInteger(action.essence) &&
                              (action.essence ?? 0) > 0 &&
                              state.essence >=
                                (action.essence ?? Number.POSITIVE_INFINITY)
                            : action.effectKind === "gain-offered-card"
                              ? offer.offeredCardIds.length === 1
                              : action.effectKind === "copy-offered-deck-card"
                                ? (offer.offeredDeckEntryIds?.length ?? 0) > 0
                                : action.effectKind ===
                                    "purge-random-subtype-and-increase-spark"
                                  ? (offer.offeredDeckEntryIds?.length ?? 0) ===
                                    1
                                  : action.effectKind === "choose-avatar"
                                    ? (offer.offeredAvatarIds?.length ?? 0) > 0
                                    : action.effectKind === "add-site"
                                      ? offer.offeredSiteType !== undefined
                                      : requiresDeckCardTarget
                                        ? hasDeckCardTarget
                                        : true;
}

/** Whether an add-fixed-site offer carries a usable site-insertion plan. */
function hasUsableSiteInsertionPreparation(
  action: ExplorationActionContent,
  offer: ExplorationActionOfferRuntime,
  state: JourneyState,
): boolean {
  const preparation = explorationOfferPlan(offer, "site-insertion");
  const siteInsertionNode =
    preparation === undefined
      ? undefined
      : state.atlas.nodes[preparation.targetNodeId];
  return (
    action.effectKind !== "add-fixed-site" ||
    (action.siteType !== undefined &&
      preparation !== undefined &&
      offer.canonicalMechanicId === "add-site" &&
      offer.selectionPolicyId === "fixed" &&
      offer.selectionKey === parseSelectionKey(action.id) &&
      offer.selectionSignature === preparation.planSignature &&
      offer.selectionTrace === undefined &&
      offer.selectionTraces === undefined &&
      offer.offeredSiteType === undefined &&
      preparation.sourceSiteId === activeSiteIdOf(state) &&
      preparation.sourceActionId === action.id &&
      preparation.targetNodeId === state.currentDreamscape &&
      preparation.targetNodeId === state.atlas.currentNodeId &&
      siteInsertionNode !== undefined &&
      preparation.insertionIndex === preparation.siblingSiteIdsBefore.length &&
      sameOrderedIds(
        siteInsertionNode.sites.map((site) => site.id),
        preparation.siblingSiteIdsBefore,
      ) &&
      preparation.insertedSite.id.length > 0 &&
      preparation.insertedSite.type === action.siteType &&
      !preparation.insertedSite.isEnhanced &&
      !preparation.insertedSite.isVisited)
  );
}

/** Whether a choose-site-type offer carries a usable site-type choice plan. */
function hasUsableSiteTypeChoicePreparation(
  action: ExplorationActionContent,
  offer: ExplorationActionOfferRuntime,
  state: JourneyState,
  followup: OfferUsabilityFollowup,
): boolean {
  const preparation = explorationOfferPlan(offer, "site-type-choice");
  const siteTypeChoiceNode =
    preparation === undefined
      ? undefined
      : state.atlas.nodes[preparation.targetNodeId];
  const preparedSiteTypes =
    preparation?.choices.map((choice) => choice.siteType) ?? [];
  return (
    action.effectKind !== "choose-site-type" ||
    (preparation !== undefined &&
      followup.kind === "site-types" &&
      offer.canonicalMechanicId === "add-site" &&
      offer.selectionPolicyId === "site-uniform" &&
      offer.selectionKey === parseSelectionKey(action.id) &&
      offer.selectionSignature === preparation.planSignature &&
      offer.selectionTrace !== undefined &&
      preparation.selectorSignature.length > 0 &&
      offer.selectionTrace.mechanicId === "add-site" &&
      offer.selectionTrace.policyId === "site-uniform" &&
      offer.selectionTrace.selectionKey === parseSelectionKey(action.id) &&
      sameOrderedIds(
        offer.selectionTrace.selectedKeys,
        preparedSiteTypes.map(parseRewardCandidateKey),
      ) &&
      offer.selectionTraces === undefined &&
      offer.offeredSiteType === undefined &&
      preparation.sourceSiteId === activeSiteIdOf(state) &&
      preparation.sourceActionId === action.id &&
      preparation.targetNodeId === state.currentDreamscape &&
      preparation.targetNodeId === state.atlas.currentNodeId &&
      siteTypeChoiceNode !== undefined &&
      preparation.insertionIndex === preparation.siblingSiteIdsBefore.length &&
      sameOrderedIds(
        siteTypeChoiceNode.sites.map((site) => site.id),
        preparation.siblingSiteIdsBefore,
      ) &&
      preparation.choices.length === action.offerCount &&
      followup.choices.length === preparation.choices.length &&
      new Set(preparedSiteTypes).size === preparedSiteTypes.length &&
      preparation.choices.every(
        (choice) =>
          choice.insertedSite.type === choice.siteType &&
          choice.insertedSite.id.length > 0 &&
          !choice.insertedSite.isEnhanced &&
          !choice.insertedSite.isVisited,
      ))
  );
}

function hasUsableDreamsignPreparation(
  action: ExplorationActionContent,
  offer: ExplorationActionOfferRuntime,
  followup: OfferUsabilityFollowup,
): boolean {
  const preparation = explorationOfferPlan(offer, "dreamsign");
  if (
    preparation === undefined ||
    preparation.unavailableReason !== undefined ||
    preparation.planSignature.length === 0 ||
    !Number.isInteger(preparation.requiredOverflowReplacementCount) ||
    preparation.requiredOverflowReplacementCount < 0
  ) {
    return false;
  }
  const expectedKind =
    action.effectKind === "gain-nightmare-and-dreamsign"
      ? "fixed-gain"
      : action.effectKind === "gain-offered-dreamsign" ||
          action.effectKind === "gain-nightmare-and-offered-dreamsign"
        ? "offered-gain"
        : action.effectKind === "replace-selected-dreamsign-with-offered"
          ? "offered-replacement"
          : action.effectKind === "replace-all-dreamsigns-random"
            ? "replace-all-random"
            : action.effectKind === "purge-selected-dreamsign-and-gain-random"
              ? "purge-and-gain-random"
              : null;
  if (expectedKind === null || preparation.kind !== expectedKind) return false;
  if (
    (action.effectKind === "gain-nightmare-and-dreamsign" ||
      action.effectKind === "gain-nightmare-and-offered-dreamsign") &&
    (preparation.nightmareCount !== action.nightmareCount ||
      !Number.isInteger(preparation.nightmareCount) ||
      (preparation.nightmareCount ?? 0) <= 0)
  ) {
    return false;
  }
  if (action.effectKind === "replace-all-dreamsigns-random") return true;
  if (action.effectKind === "gain-nightmare-and-dreamsign") {
    const expectedDreamsignId = action.dreamsignId?.toLowerCase();
    return (
      expectedDreamsignId !== undefined &&
      preparation.preparedDreamsignIds.length === 1 &&
      preparation.preparedDreamsignIds[0]?.toLowerCase() ===
        expectedDreamsignId &&
      preparation.requiredOverflowReplacementCount <= 1 &&
      ((preparation.requiredOverflowReplacementCount === 0 &&
        followup.kind === "none") ||
        (preparation.requiredOverflowReplacementCount === 1 &&
          followup.kind === "dreamsigns" &&
          followup.dreamsigns.length > 0))
    );
  }
  if (followup.kind !== "dreamsign-flow") return false;
  if (
    action.effectKind === "gain-offered-dreamsign" ||
    action.effectKind === "gain-nightmare-and-offered-dreamsign"
  ) {
    return (
      followup.offered.length > 0 &&
      followup.requiredOverflowReplacementCount <= 1 &&
      followup.held.length >= followup.requiredOverflowReplacementCount
    );
  }
  if (action.effectKind === "replace-selected-dreamsign-with-offered") {
    return followup.offered.length > 0 && followup.held.length > 0;
  }
  return (
    followup.held.length >= preparation.requiredOverflowReplacementCount + 1
  );
}

function hasUsableStarterCardPreparation(
  action: ExplorationActionContent,
  offer: ExplorationActionOfferRuntime,
  starterTargetCardId: CardId | undefined,
): boolean {
  const preparation = explorationOfferPlan(offer, "starter-card");
  if (
    preparation === undefined ||
    preparation.kind !== action.effectKind ||
    preparation.unavailableReason !== undefined ||
    preparation.planSignature.length === 0 ||
    preparation.selectionRulesVersion.length === 0 ||
    preparation.selectionContentRevision.length === 0 ||
    preparation.selectionKey.length === 0 ||
    preparation.purgedEntryIds.length === 0 ||
    preparation.purgedEntryIds.length !== preparation.purgedCardIds.length ||
    new Set(preparation.purgedEntryIds).size !==
      preparation.purgedEntryIds.length
  ) {
    return false;
  }
  const eligibleCardIdByEntryId = new Map(
    preparation.eligibleStarterCards.map((binding) => [
      binding.entryId,
      binding.cardId,
    ]),
  );
  if (
    preparation.purgedEntryIds.some(
      (entryId, index) =>
        eligibleCardIdByEntryId.get(entryId) !==
        preparation.purgedCardIds[index],
    )
  ) {
    return false;
  }
  const replacementEntryIds = Object.keys(
    preparation.replacementCardIdByEntryId,
  );
  switch (action.effectKind) {
    case "purge-starter-card":
      return (
        preparation.purgedEntryIds.length === 1 &&
        replacementEntryIds.length === 0 &&
        starterTargetCardId === preparation.purgedCardIds[0]
      );
    case "purge-random-starter-card":
      return (
        preparation.purgedEntryIds.length === 1 &&
        replacementEntryIds.length === 0
      );
    case "purge-random-starter-and-gain-card":
      return (
        preparation.purgedEntryIds.length === 1 &&
        replacementEntryIds.length === 1 &&
        replacementEntryIds[0] === preparation.purgedEntryIds[0]
      );
    case "replace-all-starter-cards":
      return (
        replacementEntryIds.length === preparation.purgedEntryIds.length &&
        preparation.purgedEntryIds.every((entryId) =>
          replacementEntryIds.includes(entryId),
        )
      );
    default:
      return false;
  }
}

export function hasUsableStarterCardTransfigurationPreparation(
  action: ExplorationActionContent,
  offer: ExplorationActionOfferRuntime,
  state: JourneyState,
  content: JourneyContent,
): boolean {
  const preparation = explorationOfferPlan(
    offer,
    "starter-card-transfiguration",
  );
  const expectedKind =
    action.effectKind === "transfigure-random-starter-cards"
      ? "random-count"
      : action.effectKind === "transfigure-all-starter-cards"
        ? "all"
        : null;
  if (
    expectedKind === null ||
    preparation === undefined ||
    preparation.kind !== expectedKind ||
    preparation.unavailableReason !== undefined ||
    preparation.planSignature.length === 0 ||
    preparation.selectionRulesVersion.length === 0 ||
    preparation.selectionContentRevision.length === 0 ||
    preparation.selectionKey.length === 0 ||
    preparation.selectorSignatures.length === 0 ||
    preparation.targets.length === 0 ||
    offer.canonicalMechanicId !== "transfigure-deck-entry" ||
    offer.selectionPolicyId !== "uniform" ||
    offer.selectionRulesVersion !== preparation.selectionRulesVersion ||
    offer.selectionContentRevision !== preparation.selectionContentRevision ||
    offer.selectionKey !== preparation.selectionKey ||
    offer.selectionSignature !== preparation.planSignature ||
    (offer.offeredDeckEntryIds?.length ?? 0) !== 0 ||
    JSON.stringify(offer.selectionTraces ?? []) !==
      JSON.stringify(preparation.selectorTraces)
  ) {
    return false;
  }
  const validBindings = (
    bindings: readonly {
      readonly entryId: DeckEntryId;
      readonly cardId: CardId;
    }[],
  ): boolean =>
    new Set(bindings.map((binding) => binding.entryId)).size ===
      bindings.length &&
    bindings.every((binding) => {
      const entry = state.deck.find(
        (candidate) => candidate.entryId === binding.entryId,
      );
      const base =
        entry === undefined
          ? undefined
          : content.cardDatabase.get(entry.cardNumber);
      return (
        entry !== undefined &&
        base !== undefined &&
        hasStarterCardRole(base) &&
        base.id === binding.cardId
      );
    });
  if (
    !validBindings(preparation.starterCards) ||
    !validBindings(preparation.eligibleStarterCards) ||
    !validBindings(preparation.targets)
  ) {
    return false;
  }
  const eligibleCardIdByEntryId = new Map(
    preparation.eligibleStarterCards.map((binding) => [
      binding.entryId,
      binding.cardId,
    ]),
  );
  if (
    preparation.targets.some((target) => {
      const entry = state.deck.find(
        (candidate) => candidate.entryId === target.entryId,
      );
      const base =
        entry === undefined
          ? undefined
          : content.cardDatabase.get(entry.cardNumber);
      return (
        eligibleCardIdByEntryId.get(target.entryId) !== target.cardId ||
        base === undefined ||
        (entry?.transfiguration !== null &&
          entry?.transfiguration !== target.transfiguration) ||
        !offeredTransfigurationForms(
          content.transfigurationData,
          base,
          null,
        ).some((form) => form.type === target.transfiguration)
      );
    })
  ) {
    return false;
  }
  const preparedTransfigurationEntries = Object.entries(
    offer.transfigurationByEntryId,
  ).sort(([left], [right]) => left.localeCompare(right));
  const targetTransfigurationEntries = preparation.targets
    .map(
      (target) =>
        [target.entryId, target.transfiguration] as readonly [string, string],
    )
    .sort(([left], [right]) => left.localeCompare(right));
  if (
    JSON.stringify(preparedTransfigurationEntries) !==
    JSON.stringify(targetTransfigurationEntries)
  ) {
    return false;
  }
  if (action.effectKind === "transfigure-random-starter-cards") {
    return (
      Number.isInteger(action.count) &&
      (action.count ?? 0) > 0 &&
      preparation.targets.length === action.count
    );
  }
  return (
    preparation.targets.length === preparation.starterCards.length &&
    sameOrderedIds(
      preparation.targets.map((target) => target.entryId),
      preparation.starterCards.map((binding) => binding.entryId),
    )
  );
}

export function hasUsableMultiCardTransfigurationPreparation(
  action: ExplorationActionContent,
  offer: ExplorationActionOfferRuntime,
  state: JourneyState,
  content: JourneyContent,
): boolean {
  const preparation = explorationOfferPlan(offer, "multi-card-transfiguration");
  const expectedMode =
    action.effectKind === "transfigure-selected" && (action.count ?? 1) > 1
      ? "chosen-flexible"
      : action.effectKind === "transfigure-fixed-selected" &&
          (action.count ?? 1) > 1
        ? "chosen-fixed"
        : action.effectKind === "transfigure-random-cards"
          ? "random-flexible"
          : action.effectKind === "transfigure-fixed-random-cards"
            ? "random-fixed"
            : null;
  const expectedPolicy =
    expectedMode === "chosen-flexible" || expectedMode === "chosen-fixed"
      ? "transfiguration-value"
      : "uniform";
  const authoredCount = action.count;
  if (
    expectedMode === null ||
    preparation === undefined ||
    preparation.mode !== expectedMode ||
    preparation.unavailableReason !== undefined ||
    !Number.isInteger(authoredCount) ||
    (authoredCount ?? 0) <= 0 ||
    preparation.planSignature.length === 0 ||
    preparation.selectionRulesVersion.length === 0 ||
    preparation.selectionContentRevision.length === 0 ||
    preparation.selectionKey.length === 0 ||
    preparation.eligibleCards.length < (authoredCount ?? 0) ||
    offer.canonicalMechanicId !== "transfigure-deck-entry" ||
    offer.selectionPolicyId !== expectedPolicy ||
    offer.selectionRulesVersion !== preparation.selectionRulesVersion ||
    offer.selectionContentRevision !== preparation.selectionContentRevision ||
    offer.selectionKey !== preparation.selectionKey ||
    offer.selectionSignature !== preparation.planSignature ||
    (offer.offeredDeckEntryIds?.length ?? 0) !== 0 ||
    JSON.stringify(offer.selectionTraces ?? []) !==
      JSON.stringify(preparation.selectorTraces)
  ) {
    return false;
  }
  const eligibleEntryIds = new Set<DeckEntryId>();
  const validEligibleCards = preparation.eligibleCards.every((binding) => {
    if (
      eligibleEntryIds.has(binding.entryId) ||
      binding.transfigurations.length === 0 ||
      new Set(binding.transfigurations).size !== binding.transfigurations.length
    ) {
      return false;
    }
    eligibleEntryIds.add(binding.entryId);
    const entry = state.deck.find(
      (candidate) => candidate.entryId === binding.entryId,
    );
    const base =
      entry === undefined
        ? undefined
        : content.cardDatabase.get(entry.cardNumber);
    if (
      entry === undefined ||
      base === undefined ||
      (entry.transfiguration !== null &&
        !binding.transfigurations.includes(entry.transfiguration)) ||
      base.id !== binding.cardId ||
      (action.predicate !== undefined &&
        !matchesPredicate(base, action.predicate, content))
    ) {
      return false;
    }
    const applicableForms = offeredTransfigurationForms(
      content.transfigurationData,
      base,
      null,
    ).map((form) => form.type);
    return binding.transfigurations.every((form) =>
      applicableForms.includes(form),
    );
  });
  if (!validEligibleCards) return false;

  if (expectedMode === "chosen-flexible" || expectedMode === "chosen-fixed") {
    return (
      preparation.targets.length === 0 &&
      preparation.selectorSignatures.length === 0 &&
      preparation.selectorTraces.length === 0 &&
      Object.keys(offer.transfigurationByEntryId).length === 0 &&
      (expectedMode !== "chosen-fixed" ||
        (action.transfiguration !== undefined &&
          preparation.eligibleCards.every(
            (binding) =>
              binding.transfigurations.length === 1 &&
              binding.transfigurations[0] === action.transfiguration,
          )))
    );
  }
  if (
    preparation.targets.length !== authoredCount ||
    new Set(preparation.targets.map((target) => target.entryId)).size !==
      preparation.targets.length
  ) {
    return false;
  }
  const eligibleByEntryId = new Map(
    preparation.eligibleCards.map((binding) => [binding.entryId, binding]),
  );
  if (
    preparation.targets.some((target) => {
      const binding = eligibleByEntryId.get(target.entryId);
      return (
        binding === undefined ||
        binding.cardId !== target.cardId ||
        !binding.transfigurations.includes(target.transfiguration)
      );
    })
  ) {
    return false;
  }
  const preparedForms = Object.entries(offer.transfigurationByEntryId).sort(
    ([left], [right]) => left.localeCompare(right),
  );
  const targetForms = preparation.targets
    .map(
      (target) =>
        [target.entryId, target.transfiguration] as readonly [string, string],
    )
    .sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify(preparedForms) === JSON.stringify(targetForms);
}

export function hasUsableMultiCardReplacementPreparation(
  action: ExplorationActionContent,
  offer: ExplorationActionOfferRuntime,
  state: JourneyState,
  content: JourneyContent,
): boolean {
  const preparation = explorationOfferPlan(offer, "multi-card-replacement");
  if (
    action.effectKind !== "replace-selected" ||
    (action.count ?? 1) <= 1 ||
    action.predicate === undefined ||
    preparation === undefined ||
    preparation.kind !== "chosen-replacement" ||
    preparation.predicate !== action.predicate ||
    preparation.authoredMaximumCount !== action.count ||
    preparation.unavailableReason !== undefined ||
    preparation.bindings.length === 0 ||
    preparation.planSignature.length === 0 ||
    preparation.selectionRulesVersion.length === 0 ||
    preparation.selectionContentRevision.length === 0 ||
    preparation.selectionKey.length === 0 ||
    preparation.selectorSignatures.length !== preparation.bindings.length ||
    preparation.selectorTraces.length !== preparation.bindings.length ||
    offer.canonicalMechanicId !== "replace-deck-entry" ||
    offer.selectionPolicyId !== "card-fit-quality" ||
    offer.selectionRulesVersion !== preparation.selectionRulesVersion ||
    offer.selectionContentRevision !== preparation.selectionContentRevision ||
    offer.selectionKey !== preparation.selectionKey ||
    offer.selectionSignature !== preparation.planSignature ||
    (offer.offeredDeckEntryIds?.length ?? 0) !== 0 ||
    Object.keys(offer.replacementCardIdByEntryId).length !== 0 ||
    JSON.stringify(offer.selectionTraces ?? []) !==
      JSON.stringify(preparation.selectorTraces)
  ) {
    return false;
  }
  const sourceIds = new Set<DeckEntryId>();
  return preparation.bindings.every((binding) => {
    if (sourceIds.has(binding.sourceEntryId)) return false;
    sourceIds.add(binding.sourceEntryId);
    const entry = state.deck.find(
      (candidate) => candidate.entryId === binding.sourceEntryId,
    );
    const source =
      entry === undefined ? null : resolvedDeckCard(entry, content);
    const replacement = cardById(content, binding.replacementCardId);
    return (
      source !== null &&
      source.id === binding.sourceCardId &&
      matchesPredicate(source, preparation.predicate, content) &&
      replacement !== null &&
      replacement.id !== binding.sourceCardId &&
      matchesPredicate(replacement, preparation.predicate, content)
    );
  });
}

export function hasUsableRandomDeckTargetPreparation(
  action: ExplorationActionContent,
  offer: ExplorationActionOfferRuntime,
  state: JourneyState,
  content: JourneyContent,
): boolean {
  const preparation = explorationOfferPlan(offer, "random-deck-target");
  const expectedMechanic =
    action.effectKind === "copy-random-cards"
      ? "duplicate-deck-entry"
      : action.effectKind === "replace-random-with-card"
        ? "replace-deck-entry"
        : null;
  const expectedCount =
    action.effectKind === "replace-random-with-card" ? 1 : action.count;
  if (
    expectedMechanic === null ||
    preparation === undefined ||
    preparation.effectKind !== action.effectKind ||
    preparation.count !== expectedCount ||
    preparation.predicate !== action.predicate ||
    preparation.replacementCardId !== action.cardId ||
    preparation.unavailableReason !== undefined ||
    preparation.eligibleCards.length < preparation.count ||
    preparation.targets.length !== preparation.count ||
    preparation.selectorSignature === undefined ||
    preparation.selectorTrace === undefined ||
    preparation.planSignature.length === 0 ||
    preparation.selectionRulesVersion.length === 0 ||
    preparation.selectionContentRevision.length === 0 ||
    preparation.selectionKey.length === 0 ||
    offer.canonicalMechanicId !== expectedMechanic ||
    offer.selectionPolicyId !== "uniform" ||
    offer.selectionRulesVersion !== preparation.selectionRulesVersion ||
    offer.selectionContentRevision !== preparation.selectionContentRevision ||
    offer.selectionKey !== preparation.selectionKey ||
    offer.selectionSignature !== preparation.planSignature ||
    JSON.stringify(offer.selectionTrace) !==
      JSON.stringify(preparation.selectorTrace) ||
    (offer.offeredDeckEntryIds?.length ?? 0) !== 0
  ) {
    return false;
  }
  const eligibleIds = new Set<DeckEntryId>();
  const validEligible = preparation.eligibleCards.every((binding) => {
    if (eligibleIds.has(binding.entryId)) return false;
    eligibleIds.add(binding.entryId);
    const entry = state.deck.find(
      (candidate) => candidate.entryId === binding.entryId,
    );
    const card = entry === undefined ? null : resolvedDeckCard(entry, content);
    if (card === null || card.id !== binding.cardId) {
      return false;
    }
    return (
      action.predicate !== undefined &&
      matchesPredicate(card, action.predicate, content)
    );
  });
  return (
    validEligible &&
    new Set(preparation.targets.map((target) => target.entryId)).size ===
      preparation.targets.length &&
    preparation.targets.every((target) =>
      preparation.eligibleCards.some(
        (binding) =>
          binding.entryId === target.entryId &&
          binding.cardId === target.cardId,
      ),
    )
  );
}

export function hasUsableDisclosedDeckTargetPreparation(
  action: ExplorationActionContent,
  offer: ExplorationActionOfferRuntime,
  state: JourneyState,
  content: JourneyContent,
  allowResolvedTypeChange = false,
): boolean {
  const preparation = explorationOfferPlan(offer, "disclosed-deck-target");
  const target = preparation?.target;
  if (
    action.effectKind !== "change-card-type-selected" ||
    action.deckTarget !== "offered" ||
    action.cardType === undefined ||
    preparation === undefined ||
    target === null ||
    target === undefined ||
    preparation.effectKind !== action.effectKind ||
    preparation.cardType !== action.cardType ||
    preparation.unavailableReason !== undefined ||
    preparation.eligibleCards.length === 0 ||
    preparation.selectorSignature === undefined ||
    preparation.selectorTrace === undefined ||
    offer.canonicalMechanicId !== "change-entry-card-type" ||
    offer.selectionPolicyId !== "deck-entry-centrality" ||
    offer.selectionRulesVersion !== preparation.selectionRulesVersion ||
    offer.selectionContentRevision !== preparation.selectionContentRevision ||
    offer.selectionKey !== preparation.selectionKey ||
    offer.selectionSignature !== preparation.planSignature ||
    JSON.stringify(offer.selectionTrace) !==
      JSON.stringify(preparation.selectorTrace) ||
    !sameOrderedIds(offer.offeredDeckEntryIds ?? [], [target.entryId])
  ) {
    return false;
  }
  const uniqueEligible = new Set<DeckEntryId>();
  if (
    !preparation.eligibleCards.every((binding) => {
      if (uniqueEligible.has(binding.entryId)) return false;
      uniqueEligible.add(binding.entryId);
      const entry = state.deck.find(
        (candidate) => candidate.entryId === binding.entryId,
      );
      const card =
        entry === undefined ? null : resolvedDeckCard(entry, content);
      return (
        card !== null &&
        card.id === binding.cardId &&
        (allowResolvedTypeChange || card.cardType !== action.cardType)
      );
    })
  ) {
    return false;
  }
  return preparation.eligibleCards.some(
    (binding) =>
      binding.entryId === target.entryId && binding.cardId === target.cardId,
  );
}

export function hasUsableCompoundActionPreparation(
  action: ExplorationActionContent,
  offer: ExplorationActionOfferRuntime,
  state: JourneyState,
  content: JourneyContent,
): boolean {
  const preparation = explorationOfferPlan(offer, "compound-action");
  if (
    preparation === undefined ||
    preparation.unavailableReason !== undefined ||
    preparation.planSignature.length === 0 ||
    preparation.selectionRulesVersion.length === 0 ||
    preparation.selectionContentRevision.length === 0 ||
    preparation.selectionKey.length === 0 ||
    offer.selectionRulesVersion !== preparation.selectionRulesVersion ||
    offer.selectionContentRevision !== preparation.selectionContentRevision ||
    offer.selectionKey !== preparation.selectionKey ||
    offer.selectionSignature !== preparation.planSignature ||
    offer.selectionTrace !== undefined ||
    JSON.stringify(offer.selectionTraces ?? []) !==
      JSON.stringify(preparation.selectorTraces) ||
    preparation.selectorSignatures.length !==
      preparation.selectorTraces.length ||
    preparation.selectorSignatures.some((signature) => signature.length === 0)
  ) {
    return false;
  }

  const currentCard = (entryId: DeckEntryId, cardId: CardId) => {
    const entry = state.deck.find((candidate) => candidate.entryId === entryId);
    const card = entry === undefined ? null : resolvedDeckCard(entry, content);
    return card !== null && card.id === cardId ? card : null;
  };
  const hasDistinctEntries = (
    bindings: readonly { readonly entryId: DeckEntryId }[],
  ) =>
    new Set(bindings.map((binding) => binding.entryId)).size ===
    bindings.length;

  switch (action.effectKind) {
    case "transfigure-all-cards":
      if (preparation.kind !== "all-card-transfiguration") return false;
      return (
        preparation.targets.length > 0 &&
        preparation.targets.length === state.deck.length &&
        preparation.allCards.length === preparation.targets.length &&
        hasDistinctEntries(preparation.targets) &&
        sameOrderedIds(
          preparation.targets.map((target) => target.entryId),
          preparation.allCards.map((card) => card.entryId),
        ) &&
        preparation.targets.every((target, index) => {
          const card = preparation.allCards[index];
          return (
            card !== undefined &&
            card.cardId === target.cardId &&
            card.positiveForms.includes(target.transfiguration) &&
            currentCard(target.entryId, target.cardId) !== null
          );
        })
      );
    case "purge-disclosed-and-transfigure-same-type": {
      if (
        preparation.kind !== "purge-disclosed-transfigure-same-type" ||
        preparation.transfiguration !== action.transfiguration ||
        preparation.target === null ||
        preparation.companionTargets.length === 0 ||
        !hasDistinctEntries([
          preparation.target,
          ...preparation.companionTargets,
        ]) ||
        !sameOrderedIds(offer.offeredDeckEntryIds ?? [], [
          preparation.target.entryId,
        ])
      ) {
        return false;
      }
      const target = currentCard(
        preparation.target.entryId,
        preparation.target.cardId,
      );
      return (
        target !== null &&
        target.cardType === preparation.target.effectiveCardType &&
        preparation.eligiblePurgeTargets.some(
          (candidate) =>
            candidate.entryId === preparation.target?.entryId &&
            candidate.cardId === preparation.target.cardId &&
            candidate.effectiveCardType ===
              preparation.target.effectiveCardType,
        ) &&
        preparation.companionTargets.every(
          (companion) =>
            companion.transfiguration === preparation.transfiguration &&
            currentCard(companion.entryId, companion.cardId) !== null,
        )
      );
    }
    case "make-predicate-fast-and-gain-nightmares":
      if (preparation.kind !== "predicate-fast-nightmares") return false;
      return (
        preparation.predicate === action.predicate &&
        preparation.nightmareCount === action.nightmareCount &&
        Number.isInteger(preparation.nightmareCount) &&
        preparation.nightmareCount > 0 &&
        hasDistinctEntries(preparation.targets) &&
        preparation.targets.every((target) => {
          const card = currentCard(target.entryId, target.cardId);
          return (
            card !== null &&
            matchesPredicate(card, preparation.predicate, content)
          );
        })
      );
    case "take-transfigured-cards-and-gain-nightmares":
      if (preparation.kind !== "take-transfigured-nightmares") return false;
      return (
        preparation.predicate === action.predicate &&
        preparation.offerCount === action.offerCount &&
        preparation.transfiguration === action.transfiguration &&
        preparation.nightmareCount === action.nightmareCount &&
        preparation.offeredCards.length === preparation.offerCount &&
        new Set(preparation.offeredCards.map((card) => card.cardId)).size ===
          preparation.offeredCards.length &&
        sameOrderedIds(
          offer.offeredCardIds,
          preparation.offeredCards.map((card) => card.cardId),
        ) &&
        preparation.offeredCards.every(
          (card) =>
            card.transfiguration === preparation.transfiguration &&
            cardById(content, card.cardId) !== null,
        )
      );
    case "purge-one-transfigure-and-copy-others":
      if (preparation.kind !== "purge-transfigure-copy") return false;
      return (
        preparation.offerCount === action.offerCount &&
        preparation.transfiguration === action.transfiguration &&
        preparation.targets.length === preparation.offerCount &&
        preparation.targets.length === 4 &&
        hasDistinctEntries(preparation.targets) &&
        sameOrderedIds(
          offer.offeredDeckEntryIds ?? [],
          preparation.targets.map((target) => target.entryId),
        ) &&
        preparation.targets.every(
          (target) =>
            target.transfiguration === preparation.transfiguration &&
            currentCard(target.entryId, target.cardId) !== null &&
            preparation.eligibleCards.some(
              (card) =>
                card.entryId === target.entryId &&
                card.cardId === target.cardId,
            ),
        )
      );
    default:
      return false;
  }
}
