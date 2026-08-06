import type { ExplorationSiteView } from "../../cumulus/screens/ExplorationSiteScreen";
import type { ExplorationSiteRuntime } from "../../types/journey";

/** Stable, display-free mechanics and minted offers recorded when a site opens. */
export function buildExplorationEntryLog(
  view: ExplorationSiteView,
  runtime: ExplorationSiteRuntime,
) {
  return {
    presentedCardId: runtime.encounterCardId,
    selectionRulesVersion: runtime.selectionRulesVersion ?? null,
    selectionContentRevision: runtime.selectionContentRevision ?? null,
    encounterSignature: runtime.encounterSignature ?? null,
    actionIds: runtime.actionOffers.map((offer) => offer.actionId),
    actions: view.actions.map((action) => ({
      actionId: action.id,
      effectKind: action.effectKind,
      mechanics: action.mechanics,
    })),
    offers: runtime.actionOffers.map((offer) => ({
      actionId: offer.actionId,
      canonicalMechanicId: offer.canonicalMechanicId ?? null,
      selectionPolicyId: offer.selectionPolicyId ?? null,
      selectionKey: offer.selectionKey ?? null,
      selectionSignature: offer.selectionSignature ?? null,
      selectionTrace: offer.selectionTrace ?? null,
      selectionTraces: offer.selectionTraces ?? null,
      offeredCardIds: offer.offeredCardIds,
      offeredDreamsignIds: offer.offeredDreamsignIds ?? [],
      offeredDeckEntryIds: offer.offeredDeckEntryIds ?? [],
      offeredDreamAvatarIds: offer.offeredDreamAvatarIds ?? [],
      packCardIds: offer.packCardIds,
      replacementCardIdByEntryId: offer.replacementCardIdByEntryId,
      transfigurationByEntryId: offer.transfigurationByEntryId,
      transfigurationByCardId: offer.transfigurationByCardId ?? null,
      offeredSiteType: offer.offeredSiteType ?? null,
    })),
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
  return {
    presentedCardId: runtime.encounterCardId,
    effectKind: action?.effectKind ?? null,
    authoredMechanics: action?.mechanics ?? null,
    outcomeKind: view.outcomeKind,
    ...resolution,
  };
}

/** Exact final transition payload emitted immediately before completing the site. */
export function buildExplorationCompletionLog(
  view: ExplorationSiteView,
  runtime: ExplorationSiteRuntime,
) {
  const resolution = runtime.resolution;
  if (resolution === null) return null;
  return {
    presentedCardId: runtime.encounterCardId,
    actionId: resolution.actionId,
    gainedCardIds: resolution.gainedCardIds,
    gainedDreamsignIds: resolution.gainedDreamsignIds,
    purgedDreamsignIds: resolution.purgedDreamsignIds ?? [],
    purgedCardIds: resolution.purgedCardIds,
    purgedEntryIds: resolution.purgedEntryIds ?? [],
    purgedEntrySnapshots: resolution.purgedEntrySnapshots ?? [],
    gainedEntryIds: resolution.gainedEntryIds ?? [],
    affectedEntryIds: resolution.affectedEntryIds,
    selection: resolution.selection ?? {},
    battleModifier: resolution.battleModifier ?? null,
    chosenDreamAvatarId: resolution.chosenDreamAvatarId ?? null,
    reclaimCostByEntryId: resolution.reclaimCostByEntryId ?? {},
    siteOfferModifier: resolution.siteOfferModifier ?? null,
    outcomeKind: view.outcomeKind,
    essenceGained: resolution.essenceGained,
  };
}
