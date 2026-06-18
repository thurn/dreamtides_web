import type { QuestContent } from "../../data/quest-content";
import type { CardData } from "../../types/cards";
import type { DreamsignTemplate } from "../../types/content";
import type { DeckEntry, Dreamsign, QuestState, SiteState } from "../../types/quest";
import type {
  MerchantContext,
  MerchantCatalogCard,
  MerchantDeckCard,
} from "../types";

interface BuildMerchantContextInput {
  questState: QuestState;
  questContent: QuestContent;
  site: SiteState;
}

function buildCardByUuid(
  cardDatabase: ReadonlyMap<number, CardData>,
): ReadonlyMap<string, CardData> {
  const cardByUuid = new Map<string, CardData>();
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
 * Resolves the quest's draft pool to the set of card UUIDs the player could
 * draft this game. `draftPoolCopiesByCard` is keyed by card number (as a
 * string); we map each number to its UUID via `cardByNumber`. Returns an empty
 * set when no package has been resolved (e.g. before the pool is built).
 */
function buildDraftPoolCardUuids(
  questState: QuestState,
  cardByNumber: ReadonlyMap<number, CardData>,
): ReadonlySet<string> {
  const draftPoolCardUuids = new Set<string>();
  const copiesByCard = questState.resolvedPackage?.draftPoolCopiesByCard;
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

function buildHeldDreamsignIds(dreamsigns: readonly Dreamsign[]): ReadonlySet<string> {
  const heldDreamsignIds = new Set<string>();
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
  heldDreamsignIds: ReadonlySet<string>,
  heldDreamsignFallbackNames: ReadonlySet<string>,
): boolean {
  return (
    !heldDreamsignIds.has(template.id) &&
    !heldDreamsignFallbackNames.has(template.name)
  );
}

export function buildMerchantContext({
  questState,
  questContent,
  site,
}: BuildMerchantContextInput): MerchantContext {
  const cardByNumber = new Map(questContent.cardDatabase);
  const cardByUuid = buildCardByUuid(cardByNumber);

  const deckCards = Object.freeze(
    questState.deck
      .map((deckEntry) => projectDeckCard(deckEntry, cardByNumber))
      .filter((deckCard): deckCard is MerchantDeckCard => deckCard !== null),
  );

  const deckEntryById = new Map<string, MerchantDeckCard>();
  const ownedCardUuids = new Set<string>();
  for (const deckCard of deckCards) {
    deckEntryById.set(deckCard.entryId, deckCard);
    ownedCardUuids.add(deckCard.cardUuid);
  }

  const candidateGrantCards = Object.freeze(
    [...cardByNumber.values()].filter(isGrantCandidate).map(projectCatalogCard),
  );

  const draftPoolCardUuids = buildDraftPoolCardUuids(questState, cardByNumber);

  const heldDreamsignIds = buildHeldDreamsignIds(questState.dreamsigns);
  const heldDreamsignFallbackNames = buildHeldDreamsignFallbackNames(
    questState.dreamsigns,
  );
  const candidateDreamsigns = Object.freeze(
    questContent.dreamsignTemplates.filter((template) =>
      isAvailableDreamsignTemplate(
        template,
        heldDreamsignIds,
        heldDreamsignFallbackNames,
      ),
    ),
  );

  const siteRuntime = questState.siteRuntime[site.id];
  const rerollNonce =
    siteRuntime?.kind === "dreamAugury" ? siteRuntime.rerollNonce ?? 0 : 0;
  const forcedArchetypeId =
    siteRuntime?.kind === "dreamAugury"
      ? siteRuntime.forcedArchetypeId
      : undefined;

  return {
    questSeed: questState.seed,
    site,
    rerollNonce,
    ...(forcedArchetypeId === undefined ? {} : { forcedArchetypeId }),
    essence: questState.essence,
    essenceCap: questState.essenceCap,
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
    fitModel: questContent.fitModel,
    merchantCorpus: questContent.merchantCorpus,
    dreamsignProfiles: questContent.dreamsignProfiles,
    cardDatabase: questContent.cardDatabase,
    dreamsignTemplates: questContent.dreamsignTemplates,
  };
}
