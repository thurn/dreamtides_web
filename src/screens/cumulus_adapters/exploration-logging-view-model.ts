import type { ExplorationSiteView } from "../../cumulus/screens/ExplorationSiteScreen";
import type { ExplorationSiteRuntime } from "../../types/journey";
import type { ExplorationActionId } from "../../types/identifiers";
import type { StableDigest } from "../../reward-selection/stable";
import { isSiteType, type SiteType } from "../../types/site-type";
import { explorationOfferPlan } from "../../exploration/offer-usability";

type ExplorationOfferLogInput =
  ExplorationSiteRuntime["actionOffers"][number] | undefined;

function compoundAuthoredFields(
  action: ExplorationSiteView["actions"][number] | undefined,
) {
  const nightmareCount = action?.mechanics.nightmareCount;
  const count = action?.mechanics.count;
  const fixedDreamsignId = action?.mechanics.dreamsignId;
  const offerCount = action?.mechanics.offerCount;
  const fixedTransfiguration = action?.mechanics.transfiguration;
  const cardType = action?.mechanics.cardType;
  const siteType = action?.mechanics.siteType;
  const fixedCardId = action?.mechanics.cardId;
  const deckTarget = action?.mechanics.deckTarget;
  return {
    authoredPredicate:
      typeof action?.mechanics.predicate === "string"
        ? action.mechanics.predicate
        : null,
    authoredNightmareCount:
      typeof nightmareCount === "number" ? nightmareCount : null,
    authoredCount: typeof count === "number" ? count : null,
    authoredFixedDreamsignId:
      typeof fixedDreamsignId === "string" ? fixedDreamsignId : null,
    authoredOfferCount: typeof offerCount === "number" ? offerCount : null,
    authoredFixedTransfiguration:
      typeof fixedTransfiguration === "string" ? fixedTransfiguration : null,
    authoredCardType: typeof cardType === "string" ? cardType : null,
    authoredSiteType: typeof siteType === "string" ? siteType : null,
    authoredFixedCardId: typeof fixedCardId === "string" ? fixedCardId : null,
    authoredDeckTarget: typeof deckTarget === "string" ? deckTarget : null,
  };
}

function preparedSelectorSignatures(
  offer: ExplorationOfferLogInput,
): readonly StableDigest[] {
  const preparation = offer?.preparation;
  switch (preparation?.kind) {
    case "multi-card-replacement":
    case "multi-card-transfiguration":
    case "compound-action":
      return preparation.plan.selectorSignatures;
    case "site-type-choice":
      return [preparation.plan.selectorSignature];
    case "random-deck-target":
    case "disclosed-deck-target": {
      const signature = preparation.plan.selectorSignature;
      return signature === undefined ? [] : [signature];
    }
    default:
      return [];
  }
}

function preparedSiteFields(offer: ExplorationOfferLogInput) {
  const fixedPreparation = explorationOfferPlan(offer, "site-insertion");
  const choicePreparation = explorationOfferPlan(offer, "site-type-choice");
  const preparation = choicePreparation ?? fixedPreparation;
  return {
    siteInsertionPreparation: fixedPreparation ?? null,
    siteTypeChoicePreparation: choicePreparation ?? null,
    offeredSiteType: offer?.offeredSiteType ?? null,
    offeredSiteTypes:
      choicePreparation?.choices.map((choice) => choice.siteType) ?? [],
    selectorSignature: choicePreparation?.selectorSignature ?? null,
    planSignature: preparation?.planSignature ?? null,
    sourceSiteId: preparation?.sourceSiteId ?? null,
    preparedTargetNodeId: preparation?.targetNodeId ?? null,
    preparedInsertionIndex: preparation?.insertionIndex ?? null,
    preparedSiblingSiteIdsBefore: preparation?.siblingSiteIdsBefore ?? [],
  };
}

/** Every prepared deck, Dreamsign, and site plan under its stable log key. */
function preparedPlanFields(offer: ExplorationOfferLogInput) {
  const dreamsign = explorationOfferPlan(offer, "dreamsign");
  return {
    dreamsignPreparation: dreamsign ?? null,
    starterCardPreparation: explorationOfferPlan(offer, "starter-card") ?? null,
    starterCardTransfigurationPreparation:
      explorationOfferPlan(offer, "starter-card-transfiguration") ?? null,
    multiCardTransfigurationPreparation:
      explorationOfferPlan(offer, "multi-card-transfiguration") ?? null,
    multiCardReplacementPreparation:
      explorationOfferPlan(offer, "multi-card-replacement") ?? null,
    randomDeckTargetPreparation:
      explorationOfferPlan(offer, "random-deck-target") ?? null,
    disclosedDeckTargetPreparation:
      explorationOfferPlan(offer, "disclosed-deck-target") ?? null,
    compoundActionPreparation:
      explorationOfferPlan(offer, "compound-action") ?? null,
    ...preparedSiteFields(offer),
    selectorPlan: dreamsign ?? null,
    excludedDreamsignIds: dreamsign?.heldIdsAtPreparation ?? [],
    dreamsignUnavailableReason: dreamsign?.unavailableReason ?? null,
  };
}

function selectedSiteType(selection: unknown): SiteType | null {
  if (typeof selection !== "object" || selection === null) return null;
  const siteType = (selection as Readonly<Record<string, unknown>>).siteType;
  return isSiteType(siteType) ? siteType : null;
}

function terminalOutcome(
  view: ExplorationSiteView,
  runtime: ExplorationSiteRuntime,
) {
  const resolution = runtime.resolution;
  if (resolution === null) return null;
  const action = view.actions.find(
    (candidate) => candidate.id === resolution.actionId,
  );
  const offer = runtime.actionOffers.find(
    (candidate) => candidate.actionId === resolution.actionId,
  );
  return {
    kind: view.outcomeKind,
    presentedCardId: runtime.encounterCardId,
    encounterSignature:
      resolution.encounterSignature ?? runtime.encounterSignature ?? null,
    actionId: resolution.actionId,
    effectKind: action?.effectKind ?? null,
    ...compoundAuthoredFields(action),
    canonicalMechanicId: offer?.canonicalMechanicId ?? null,
    selectionPolicyId: offer?.selectionPolicyId ?? null,
    selectionRulesVersion:
      resolution.selectionRulesVersion ?? offer?.selectionRulesVersion ?? null,
    selectionContentRevision:
      resolution.selectionContentRevision ??
      offer?.selectionContentRevision ??
      null,
    selectionKey: offer?.selectionKey ?? null,
    selectionSignature:
      resolution.selectionSignature ?? offer?.selectionSignature ?? null,
    selectionTrace: offer?.selectionTrace ?? null,
    selectionTraces: offer?.selectionTraces ?? null,
    selectorSignatures: preparedSelectorSignatures(offer),
    multiCardReplacementPreparation:
      explorationOfferPlan(offer, "multi-card-replacement") ?? null,
    randomDeckTargetPreparation:
      explorationOfferPlan(offer, "random-deck-target") ?? null,
    disclosedDeckTargetPreparation:
      explorationOfferPlan(offer, "disclosed-deck-target") ?? null,
    compoundActionPreparation:
      explorationOfferPlan(offer, "compound-action") ?? null,
    ...preparedSiteFields(offer),
    multiCardTransfigurationPreparation:
      explorationOfferPlan(offer, "multi-card-transfiguration") ?? null,
    rawSelection: resolution.selection ?? {},
    validatedSelection: resolution.selection ?? {},
    gainedCardIds: resolution.gainedCardIds,
    gainedEntryIds: resolution.gainedEntryIds ?? [],
    mintedEntryIds: resolution.gainedEntryIds ?? [],
    gainedDreamsignIds: resolution.gainedDreamsignIds,
    purgedDreamsignIds: resolution.purgedDreamsignIds ?? [],
    dreamsignMutation: resolution.dreamsignMutation ?? null,
    purgedCardIds: resolution.purgedCardIds,
    purgedEntryIds: resolution.purgedEntryIds ?? [],
    purgedEntrySnapshots: resolution.purgedEntrySnapshots ?? [],
    starterCardReplacements: resolution.starterCardReplacements ?? [],
    starterCardTransfigurations: resolution.starterCardTransfigurations ?? [],
    cardTransfigurations: resolution.cardTransfigurations ?? [],
    cardReplacements: resolution.cardReplacements ?? [],
    cardCopies: resolution.cardCopies ?? [],
    cardTypeChanges: resolution.cardTypeChanges ?? [],
    cardKeywordChanges: resolution.cardKeywordChanges ?? [],
    nightmareGains: resolution.nightmareGains ?? [],
    affectedEntryIds: resolution.affectedEntryIds,
    resolvedPredicate: resolution.resolvedPredicate ?? null,
    resolvedCardType: resolution.resolvedCardType ?? null,
    siteInsertion: resolution.siteInsertion ?? null,
    shopModifier: resolution.shopModifier ?? null,
    essenceBefore: resolution.essenceBefore ?? null,
    essenceSpent: resolution.essenceSpent ?? 0,
    essenceAfter: resolution.essenceAfter ?? null,
    chosenSiteType:
      selectedSiteType(resolution.selection) ??
      resolution.siteInsertion?.insertedSite.type ??
      null,
  };
}

/** Stable, display-free mechanics and minted offers recorded when a site opens. */
export function buildExplorationEntryLog(
  view: ExplorationSiteView,
  runtime: ExplorationSiteRuntime,
) {
  return {
    presentedCardId: runtime.encounterCardId,
    encounterSignature: runtime.encounterSignature ?? null,
    selectionRulesVersion: runtime.selectionRulesVersion,
    selectionContentRevision: runtime.selectionContentRevision ?? null,
    actionIds: runtime.actionOffers.map((offer) => offer.actionId),
    actions: view.actions.map((action) => ({
      actionId: action.id,
      effectKind: action.effectKind,
      mechanics: action.mechanics,
      ...compoundAuthoredFields(action),
    })),
    offers: runtime.actionOffers.map((offer) => ({
      actionId: offer.actionId,
      ...compoundAuthoredFields(
        view.actions.find((action) => action.id === offer.actionId),
      ),
      canonicalMechanicId: offer.canonicalMechanicId,
      selectionPolicyId: offer.selectionPolicyId ?? null,
      selectionRulesVersion: offer.selectionRulesVersion ?? null,
      selectionContentRevision: offer.selectionContentRevision ?? null,
      selectionKey: offer.selectionKey ?? null,
      selectionSignature: offer.selectionSignature ?? null,
      selectionTrace: offer.selectionTrace ?? null,
      selectionTraces: offer.selectionTraces ?? null,
      selectorSignatures: preparedSelectorSignatures(offer),
      preparedEssenceAmount:
        offer.preparation?.kind === "essence" ? offer.preparation.amount : null,
      essencePreparation: explorationOfferPlan(offer, "essence") ?? null,
      ...preparedPlanFields(offer),
      offeredCardIds: offer.offeredCardIds,
      offeredDreamsignIds: offer.offeredDreamsignIds ?? [],
      offeredDeckEntryIds: offer.offeredDeckEntryIds ?? [],
      eligibleDeckEntryIds: offer.eligibleDeckEntryIds ?? [],
      offeredAvatarIds: offer.offeredAvatarIds ?? [],
      packCardIds: offer.packCardIds,
      replacementCardIdByEntryId: offer.replacementCardIdByEntryId,
      transfigurationByEntryId: offer.transfigurationByEntryId,
      transfigurationByCardId: offer.transfigurationByCardId ?? null,
    })),
    rawSelection: runtime.resolution?.selection ?? null,
    validatedSelection: runtime.resolution?.selection ?? null,
    terminalOutcome: terminalOutcome(view, runtime),
  };
}

/** Raw player intent plus the exact prepared plan it attempted to resolve. */
export function buildExplorationActionLog(
  view: ExplorationSiteView,
  runtime: ExplorationSiteRuntime,
  actionId: ExplorationActionId,
  selection: unknown,
) {
  const action = view.actions.find((candidate) => candidate.id === actionId);
  const offer = runtime.actionOffers.find(
    (candidate) => candidate.actionId === actionId,
  );
  return {
    presentedCardId: runtime.encounterCardId,
    encounterSignature: runtime.encounterSignature ?? null,
    actionId,
    effectKind: action?.effectKind ?? null,
    authoredMechanics: action?.mechanics ?? null,
    ...compoundAuthoredFields(action),
    canonicalMechanicId: offer?.canonicalMechanicId ?? null,
    selectionPolicyId: offer?.selectionPolicyId ?? null,
    selectionRulesVersion: offer?.selectionRulesVersion ?? null,
    selectionContentRevision: offer?.selectionContentRevision ?? null,
    selectionKey: offer?.selectionKey ?? null,
    selectionSignature: offer?.selectionSignature ?? null,
    selectionTrace: offer?.selectionTrace ?? null,
    selectionTraces: offer?.selectionTraces ?? null,
    selectorSignatures: preparedSelectorSignatures(offer),
    ...preparedPlanFields(offer),
    requestedSelection: selection ?? null,
    rawSelection: selection ?? null,
    validatedSelection:
      runtime.resolution?.actionId === actionId
        ? (runtime.resolution.selection ?? {})
        : null,
    terminalOutcome: terminalOutcome(view, runtime),
    requestedSiteType: selectedSiteType(selection),
    validatedSiteType:
      runtime.resolution?.actionId === actionId
        ? selectedSiteType(runtime.resolution.selection)
        : null,
  };
}

/** Exact persisted selection, transition facts, and semantic outcome for replay. */
export function buildExplorationResolutionLog(
  view: ExplorationSiteView,
  runtime: ExplorationSiteRuntime,
) {
  const resolution = runtime.resolution;
  if (resolution === null) return null;
  const action = view.actions.find(
    (candidate) => candidate.id === resolution.actionId,
  );
  const offer = runtime.actionOffers.find(
    (candidate) => candidate.actionId === resolution.actionId,
  );
  return {
    ...resolution,
    presentedCardId: runtime.encounterCardId,
    encounterSignature:
      resolution.encounterSignature ?? runtime.encounterSignature ?? null,
    effectKind: action?.effectKind ?? null,
    ...compoundAuthoredFields(action),
    canonicalMechanicId: offer?.canonicalMechanicId ?? null,
    selectionPolicyId: offer?.selectionPolicyId ?? null,
    selectionRulesVersion:
      resolution.selectionRulesVersion ?? offer?.selectionRulesVersion ?? null,
    selectionContentRevision:
      resolution.selectionContentRevision ??
      offer?.selectionContentRevision ??
      null,
    selectionKey: offer?.selectionKey ?? null,
    selectionSignature:
      resolution.selectionSignature ?? offer?.selectionSignature ?? null,
    selectionTrace: offer?.selectionTrace ?? null,
    selectionTraces: offer?.selectionTraces ?? null,
    selectorSignatures: preparedSelectorSignatures(offer),
    ...preparedPlanFields(offer),
    authoredMechanics: action?.mechanics ?? null,
    outcomeKind: view.outcomeKind,
    rawSelection: resolution.selection ?? {},
    validatedSelection: resolution.selection ?? {},
    mintedEntryIds: resolution.gainedEntryIds ?? [],
    mutation: resolution.dreamsignMutation ?? null,
    starterCardReplacements: resolution.starterCardReplacements ?? [],
    starterCardTransfigurations: resolution.starterCardTransfigurations ?? [],
    cardTransfigurations: resolution.cardTransfigurations ?? [],
    cardReplacements: resolution.cardReplacements ?? [],
    cardCopies: resolution.cardCopies ?? [],
    cardTypeChanges: resolution.cardTypeChanges ?? [],
    cardKeywordChanges: resolution.cardKeywordChanges ?? [],
    nightmareGains: resolution.nightmareGains ?? [],
    resolvedPredicate: resolution.resolvedPredicate ?? null,
    resolvedCardType: resolution.resolvedCardType ?? null,
    siteInsertion: resolution.siteInsertion ?? null,
    shopModifier: resolution.shopModifier ?? null,
    chosenSiteType:
      selectedSiteType(resolution.selection) ??
      resolution.siteInsertion?.insertedSite.type ??
      null,
    terminalOutcome: terminalOutcome(view, runtime),
    terminalEssenceTotal: resolution.essenceAfter ?? null,
  };
}

/** Exact final transition payload emitted immediately before completing the site. */
export function buildExplorationCompletionLog(
  view: ExplorationSiteView,
  runtime: ExplorationSiteRuntime,
) {
  const resolution = runtime.resolution;
  if (resolution === null) return null;
  const offer = runtime.actionOffers.find(
    (candidate) => candidate.actionId === resolution.actionId,
  );
  const action = view.actions.find(
    (candidate) => candidate.id === resolution.actionId,
  );
  return {
    presentedCardId: runtime.encounterCardId,
    encounterSignature:
      resolution.encounterSignature ?? runtime.encounterSignature ?? null,
    actionId: resolution.actionId,
    effectKind: action?.effectKind ?? null,
    ...compoundAuthoredFields(action),
    canonicalMechanicId: offer?.canonicalMechanicId ?? null,
    selectionPolicyId: offer?.selectionPolicyId ?? null,
    selectionRulesVersion:
      resolution.selectionRulesVersion ?? offer?.selectionRulesVersion ?? null,
    selectionKey: offer?.selectionKey ?? null,
    selectionSignature:
      resolution.selectionSignature ?? offer?.selectionSignature ?? null,
    selectionTrace: offer?.selectionTrace ?? null,
    selectionTraces: offer?.selectionTraces ?? null,
    selectorSignatures: preparedSelectorSignatures(offer),
    ...preparedPlanFields(offer),
    gainedCardIds: resolution.gainedCardIds,
    gainedDreamsignIds: resolution.gainedDreamsignIds,
    purgedDreamsignIds: resolution.purgedDreamsignIds ?? [],
    dreamsignMutation: resolution.dreamsignMutation ?? null,
    purgedCardIds: resolution.purgedCardIds,
    purgedEntryIds: resolution.purgedEntryIds ?? [],
    purgedEntrySnapshots: resolution.purgedEntrySnapshots ?? [],
    starterCardReplacements: resolution.starterCardReplacements ?? [],
    starterCardTransfigurations: resolution.starterCardTransfigurations ?? [],
    cardTransfigurations: resolution.cardTransfigurations ?? [],
    cardReplacements: resolution.cardReplacements ?? [],
    cardCopies: resolution.cardCopies ?? [],
    cardTypeChanges: resolution.cardTypeChanges ?? [],
    cardKeywordChanges: resolution.cardKeywordChanges ?? [],
    nightmareGains: resolution.nightmareGains ?? [],
    gainedEntryIds: resolution.gainedEntryIds ?? [],
    mintedEntryIds: resolution.gainedEntryIds ?? [],
    affectedEntryIds: resolution.affectedEntryIds,
    eligibleDeckEntryIds: offer?.eligibleDeckEntryIds ?? [],
    sparkBeforeByEntryId: resolution.sparkBeforeByEntryId ?? {},
    sparkAfterByEntryId: resolution.sparkAfterByEntryId ?? {},
    selection: resolution.selection ?? {},
    selectionContentRevision:
      resolution.selectionContentRevision ??
      offer?.selectionContentRevision ??
      null,
    battleModifier: resolution.battleModifier ?? null,
    chosenAvatarId: resolution.chosenAvatarId ?? null,
    reclaimCostByEntryId: resolution.reclaimCostByEntryId ?? {},
    siteOfferModifier: resolution.siteOfferModifier ?? null,
    shopModifier: resolution.shopModifier ?? null,
    siteInsertion: resolution.siteInsertion ?? null,
    chosenSiteType:
      selectedSiteType(resolution.selection) ??
      resolution.siteInsertion?.insertedSite.type ??
      null,
    outcomeKind: view.outcomeKind,
    rawSelection: resolution.selection ?? {},
    validatedSelection: resolution.selection ?? {},
    mutation: resolution.dreamsignMutation ?? null,
    terminalOutcome: terminalOutcome(view, runtime),
    essenceGained: resolution.essenceGained,
    essenceBefore: resolution.essenceBefore ?? null,
    essenceAfter: resolution.essenceAfter ?? null,
    terminalEssenceTotal: resolution.essenceAfter ?? null,
    essencePreparation: resolution.essencePreparation ?? null,
    essenceSpent: resolution.essenceSpent ?? 0,
    chosenTransfiguration: resolution.chosenTransfiguration ?? null,
    resolvedPredicate: resolution.resolvedPredicate ?? null,
    resolvedCardType: resolution.resolvedCardType ?? null,
  };
}
