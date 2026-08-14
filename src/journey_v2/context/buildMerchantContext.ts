import type { JourneyContent } from "../../data/journey-content";
import type { CardData } from "../../types/cards";
import type { DreamsignTemplate } from "../../types/content";
import type {
  DeckEntry,
  Dreamsign,
  JourneyState,
  SiteState,
} from "../../types/journey";
import type {
  MerchantContext,
  MerchantCatalogCard,
  MerchantDeckCard,
} from "../types";
import { buildRewardSelectionContext } from "../../reward-selection";
import type { CardId } from "../../types/card-identity";
import type { DeckEntryId, DreamsignId } from "../../types/identifiers";

interface BuildMerchantContextInput {
  journeyState: JourneyState;
  journeyContent: JourneyContent;
  site: SiteState;
}

function buildCardByUuid(
  cardDatabase: ReadonlyMap<number, CardData>,
): ReadonlyMap<CardId, CardData> {
  const cardByUuid = new Map<CardId, CardData>();
  for (const card of cardDatabase.values()) {
    if (card.id.length > 0) {
      cardByUuid.set(card.id, card);
    }
  }
  return cardByUuid;
}

function projectDeckCard(
  deckEntry: DeckEntry,
  cardByNumber: ReadonlyMap<number, CardData>,
): MerchantDeckCard | null {
  const card = cardByNumber.get(deckEntry.cardNumber);
  if (card === undefined) return null;

  return {
    objectType: "deckCard",
    entryId: deckEntry.entryId,
    cardUuid: card.id,
    cardNumber: card.cardNumber,
    deckEntry,
    card,
    displayName: card.name,
  };
}

function isGrantCandidate(card: CardData): boolean {
  if (card.isStarter) return false;
  return card.rarity !== "Starter" && card.rarity !== "Special";
}

function projectCatalogCard(card: CardData): MerchantCatalogCard {
  return {
    objectType: "catalogCard",
    cardUuid: card.id,
    cardNumber: card.cardNumber,
    card,
    displayName: card.name,
  };
}

/**
 * Resolves the journey's draft pool to the set of card UUIDs the player could
 * draft this game. `draftPoolCopiesByCard` is keyed by card number (as a
 * string); we map each number to its UUID via `cardByNumber`. Returns an empty
 * set when no package has been resolved (e.g. before the pool is built).
 */
function buildDraftPoolCardUuids(
  journeyState: JourneyState,
  cardByNumber: ReadonlyMap<number, CardData>,
): ReadonlySet<CardId> {
  const draftPoolCardUuids = new Set<CardId>();
  const copiesByCard = journeyState.resolvedPackage?.draftPoolCopiesByCard;
  if (copiesByCard === undefined) return draftPoolCardUuids;
  for (const cardNumberKey of Object.keys(copiesByCard)) {
    const cardNumber = Number(cardNumberKey);
    if (!Number.isInteger(cardNumber)) continue;
    const card = cardByNumber.get(cardNumber);
    if (card !== undefined && card.id.length > 0) {
      draftPoolCardUuids.add(card.id);
    }
  }
  return draftPoolCardUuids;
}

function buildHeldDreamsignIds(
  dreamsigns: readonly Dreamsign[],
): ReadonlySet<DreamsignId> {
  const heldDreamsignIds = new Set<DreamsignId>();
  for (const dreamsign of dreamsigns) {
    if (dreamsign.id !== undefined) {
      heldDreamsignIds.add(dreamsign.id);
    }
  }
  return heldDreamsignIds;
}

function buildHeldDreamsignFallbackNames(
  dreamsigns: readonly Dreamsign[],
): ReadonlySet<string> {
  const heldDreamsignNames = new Set<string>();
  for (const dreamsign of dreamsigns) {
    if (dreamsign.id === undefined) {
      heldDreamsignNames.add(dreamsign.name);
    }
  }
  return heldDreamsignNames;
}

function isAvailableDreamsignTemplate(
  template: DreamsignTemplate,
  heldDreamsignIds: ReadonlySet<DreamsignId>,
  heldDreamsignFallbackNames: ReadonlySet<string>,
): boolean {
  return (
    !heldDreamsignIds.has(template.id) &&
    !heldDreamsignFallbackNames.has(template.name)
  );
}

export function buildMerchantContext({
  journeyState,
  journeyContent,
  site,
}: BuildMerchantContextInput): MerchantContext {
  const cardByNumber = new Map(journeyContent.cardDatabase);
  const cardByUuid = buildCardByUuid(cardByNumber);

  const deckCards = Object.freeze(
    journeyState.deck
      .map((deckEntry) => projectDeckCard(deckEntry, cardByNumber))
      .filter((deckCard): deckCard is MerchantDeckCard => deckCard !== null),
  );

  const deckEntryById = new Map<DeckEntryId, MerchantDeckCard>();
  const ownedCardUuids = new Set<CardId>();
  for (const deckCard of deckCards) {
    deckEntryById.set(deckCard.entryId, deckCard);
    ownedCardUuids.add(deckCard.cardUuid);
  }

  const candidateGrantCards = Object.freeze(
    [...cardByNumber.values()].filter(isGrantCandidate).map(projectCatalogCard),
  );

  const draftPoolCardUuids = buildDraftPoolCardUuids(
    journeyState,
    cardByNumber,
  );

  const heldDreamsignIds = buildHeldDreamsignIds(journeyState.dreamsigns);
  const heldDreamsignFallbackNames = buildHeldDreamsignFallbackNames(
    journeyState.dreamsigns,
  );
  const candidateDreamsigns = Object.freeze(
    journeyContent.dreamsignTemplates.filter((template) =>
      isAvailableDreamsignTemplate(
        template,
        heldDreamsignIds,
        heldDreamsignFallbackNames,
      ),
    ),
  );

  const siteRuntime = journeyState.siteRuntime[site.id];
  const rerollNonce =
    siteRuntime?.kind === "augury" ? (siteRuntime.rerollNonce ?? 0) : 0;
  const forcedArchetypeId =
    siteRuntime?.kind === "augury" ? siteRuntime.forcedArchetypeId : undefined;

  return {
    sitesData: journeyContent.sitesData,
    journeySeed: journeyState.seed,
    site,
    rerollNonce,
    ...(forcedArchetypeId === undefined ? {} : { forcedArchetypeId }),
    essence: journeyState.essence,
    deckCards,
    cardByUuid,
    cardByNumber,
    deckEntryById,
    ownedCardUuids,
    draftPoolCardUuids,
    heldDreamsignIds,
    heldDreamsignFallbackNames,
    candidateGrantCards,
    candidateDreamsigns,
    cardDatabase: journeyContent.cardDatabase,
    dreamsignTemplates: journeyContent.dreamsignTemplates,
    rewardSelection: buildRewardSelectionContext({
      journeyState,
      journeyContent,
      site,
    }),
  };
}
