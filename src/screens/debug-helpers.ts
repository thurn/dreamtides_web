import type { CardData } from "../types/cards";
import type {
  DreamsignTemplate,
  ResolvedDreamcallerPackage,
} from "../types/content";
import type { DraftState } from "../types/draft";
import {
  countRemainingCards,
  countRemainingUniqueCards,
} from "../draft/draft-engine";

/** Debug info for the player's fixed draft pool state. */
export interface DraftDebugInfo {
  currentOffer: CardData[];
  currentOfferSize: number;
  pickNumber: number;
  sitePicksCompleted: number;
  remainingCards: number;
  remainingUniqueCards: number;
  topRemainingCards: Array<{
    cardNumber: number;
    name: string;
    copiesRemaining: number;
  }>;
}

export interface DreamsignPoolDebugEntry {
  id: string;
  name: string;
}

export interface PackageDebugInfo {
  dreamcallerName: string;
  startingEssence: number;
  mandatoryTides: string[];
  optionalSubset: string[];
  selectedTides: string[];
  mandatoryOnlyPoolSize: number;
  draftPoolSize: number;
  doubledCardCount: number;
  legalSubsetCount: number;
  preferredSubsetCount: number;
  initialDreamsignPoolSize: number;
  remainingDreamsigns: DreamsignPoolDebugEntry[];
  spentDreamsigns: DreamsignPoolDebugEntry[];
}

/** Extract debug info from the current draft state. */
export function extractDraftDebugInfo(
  draftState: DraftState | null,
  cardDatabase: Map<number, CardData>,
): DraftDebugInfo | null {
  if (draftState === null) {
    return null;
  }

  return {
    currentOffer: draftState.currentOffer
      .map((cardNumber) => cardDatabase.get(cardNumber))
      .filter((card): card is CardData => card !== undefined),
    currentOfferSize: draftState.currentOffer.length,
    pickNumber: draftState.pickNumber,
    sitePicksCompleted: draftState.sitePicksCompleted,
    remainingCards: countRemainingCards(draftState.remainingCopiesByCard),
    remainingUniqueCards: countRemainingUniqueCards(draftState.remainingCopiesByCard),
    topRemainingCards: Object.entries(draftState.remainingCopiesByCard)
      .filter(([, copiesRemaining]) => copiesRemaining > 0)
      .map(([cardNumber, copiesRemaining]) => ({
        cardNumber: Number(cardNumber),
        copiesRemaining,
      }))
      .sort((a, b) => {
        const copiesDelta = b.copiesRemaining - a.copiesRemaining;
        if (copiesDelta !== 0) {
          return copiesDelta;
        }

        const cardA = cardDatabase.get(a.cardNumber);
        const cardB = cardDatabase.get(b.cardNumber);
        return (cardA?.name ?? "").localeCompare(cardB?.name ?? "");
      })
      .slice(0, 8)
      .map(({ cardNumber, copiesRemaining }) => ({
        cardNumber,
        name:
          cardDatabase.get(cardNumber)?.name
          ?? `Unknown Card #${String(cardNumber)}`,
        copiesRemaining,
      })),
  };
}

/** Extracts a debug summary of the resolved run package and Dreamsign pool. */
export function extractPackageDebugInfo(
  resolvedPackage: ResolvedDreamcallerPackage | null,
  remainingDreamsignPool: readonly string[],
  dreamsignTemplates: readonly DreamsignTemplate[],
): PackageDebugInfo | null {
  if (resolvedPackage === null) {
    return null;
  }

  const templatesById = new Map(
    dreamsignTemplates.map((template) => [template.id, template]),
  );
  const remainingIds = new Set(remainingDreamsignPool);

  const toDreamsignEntry = (id: string): DreamsignPoolDebugEntry => ({
    id,
    name: templatesById.get(id)?.name ?? id,
  });

  return {
    dreamcallerName: resolvedPackage.dreamcaller.name,
    startingEssence: resolvedPackage.dreamcaller.startingEssence,
    mandatoryTides: [...(resolvedPackage.mandatoryTides ?? [])],
    optionalSubset: [...(resolvedPackage.optionalSubset ?? [])],
    selectedTides: [...(resolvedPackage.selectedTides ?? [])],
    mandatoryOnlyPoolSize: resolvedPackage.mandatoryOnlyPoolSize,
    draftPoolSize: resolvedPackage.draftPoolSize,
    doubledCardCount: resolvedPackage.doubledCardCount,
    legalSubsetCount: resolvedPackage.legalSubsetCount,
    preferredSubsetCount: resolvedPackage.preferredSubsetCount,
    initialDreamsignPoolSize: (resolvedPackage.dreamsignPoolIds ?? []).length,
    remainingDreamsigns: remainingDreamsignPool.map(toDreamsignEntry),
    spentDreamsigns: (resolvedPackage.dreamsignPoolIds ?? [])
      .filter((id) => !remainingIds.has(id))
      .map(toDreamsignEntry),
  };
}
