import { resolveDeckEntryCard } from "../card-type-change";
import type { JourneyContent } from "../data/journey-content";
import type { CardData } from "../types/cards";
import type { JourneyState, SiteState } from "../types/journey";
import { stableDigest } from "./stable";
import type { RewardSelectionContext } from "./types";

function draftPoolUuids(
  state: JourneyState,
  cardDatabase: ReadonlyMap<number, CardData>,
): ReadonlySet<string> {
  const result = new Set<string>();
  for (const rawNumber of Object.keys(
    state.resolvedPackage?.draftPoolCopiesByCard ?? {},
  )) {
    const card = cardDatabase.get(Number(rawNumber));
    if (card !== undefined) result.add(card.id);
  }
  return result;
}

function selectionContentRevision(content: JourneyContent): string {
  return stableDigest({
    cards: [...content.cardDatabase.values()]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((card) => ({ ...card })),
    dreamsigns: [...content.dreamsignTemplates]
      .sort((left, right) => left.id.localeCompare(right.id)),
    customCards: [...(content.exploration?.customCards ?? [])]
      .sort((left, right) => left.id.localeCompare(right.id)),
    customDreamsigns: [...(content.exploration?.customDreamsigns ?? [])]
      .sort((left, right) => (left.id ?? "").localeCompare(right.id ?? "")),
    dreamAvatars: [...content.dreamAvatars]
      .sort((left, right) => left.id.localeCompare(right.id)),
    fitModel: content.fitModel,
    corpus: content.merchantCorpus,
    profiles: content.dreamsignProfiles,
  });
}

export function buildRewardSelectionContext(input: {
  journeyState: JourneyState;
  journeyContent: JourneyContent;
  site: SiteState;
}): RewardSelectionContext {
  const { journeyState, journeyContent, site } = input;
  const cardByUuid = new Map<string, CardData>();
  for (const card of journeyContent.cardDatabase.values()) {
    cardByUuid.set(card.id, card);
  }
  const effectiveDeckCards = journeyState.deck.flatMap((entry) => {
    const baseCard = journeyContent.cardDatabase.get(entry.cardNumber);
    return baseCard === undefined
      ? []
      : [{
          entry,
          baseCard,
          effectiveCard: resolveDeckEntryCard(baseCard, entry),
        }];
  });
  return {
    journeySeed: journeyState.seed,
    site,
    content: journeyContent,
    deckEntries: journeyState.deck,
    effectiveDeckCards,
    cardByUuid,
    ownedCardUuids: new Set(effectiveDeckCards.map(({ baseCard }) => baseCard.id)),
    draftPoolCardUuids: draftPoolUuids(journeyState, journeyContent.cardDatabase),
    heldDreamsignIds: new Set(
      journeyState.dreamsigns.flatMap((dreamsign) =>
        dreamsign.id === undefined ? [] : [dreamsign.id],
      ),
    ),
    remainingDreamsignIds: new Set(journeyState.remainingDreamsignPool),
    selectionContentRevision: selectionContentRevision(journeyContent),
  };
}
