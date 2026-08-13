import { resolveDeckEntryCard } from "../card-type-change";
import type { JourneyContent } from "../data/journey-content";
import type { CardData } from "../types/cards";
import type { JourneyState, SiteState } from "../types/journey";
import { stableDigest } from "./stable";
import type { RewardSelectionContext } from "./types";
import {
  buildAffinityContext,
  buildTideAffinityIndex,
} from "../selection/tide-affinity";
import type { Tides4DecksJson } from "../draft/pool/tides4-io";

const EMPTY_TIDES: Tides4DecksJson = {
  version: 2,
  selection: { bandFraction: 0.25, bandMinimum: 5 },
  tides: [{
    id: "unavailable",
    displayName: "Unavailable",
    displayDescription: "Unavailable",
    resonance: "ember",
    role: "neutral",
    cards: [],
  }],
  tidePoolByDreamAvatar: {},
};

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
    tides: content.poolContext?.poolData.tides4Decks,
    auguryFoldHash: content.auguryData.foldHash,
    sitesFoldHash: content.sitesData.foldHash,
    explorationFoldHash: content.exploration?.foldHash ?? null,
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
          effectiveCard: resolveDeckEntryCard(
            journeyContent.transfigurationData,
            baseCard,
            entry,
          ),
        }];
  });
  const tideData = journeyContent.poolContext?.poolData.tides4Decks ?? EMPTY_TIDES;
  const affinityIndex = buildTideAffinityIndex(tideData);
  const dreamsignById = new Map(
    journeyContent.dreamsignTemplates.map((dreamsign) => [dreamsign.id, dreamsign]),
  );
  const heldDreamsignIds = new Set(
    journeyState.dreamsigns.flatMap((dreamsign) =>
      dreamsign.id === undefined ? [] : [dreamsign.id],
    ),
  );
  const joinedTideIds = journeyState.resolvedPackage?.joinedTideIds ?? [];
  const affinityContext = buildAffinityContext({
    index: affinityIndex,
    joinedTideIds,
    deckCardUuids: effectiveDeckCards.map(({ effectiveCard }) => effectiveCard.id),
    dreamsignTideIds: [...heldDreamsignIds].flatMap(
      (id) => dreamsignById.get(id)?.tideIds ?? [],
    ),
  });
  return {
    journeySeed: journeyState.seed,
    site,
    content: journeyContent,
    tuning: journeyContent.rewardSelectionData.tuning,
    deckEntries: journeyState.deck,
    effectiveDeckCards,
    cardByUuid,
    ownedCardUuids: new Set(effectiveDeckCards.map(({ baseCard }) => baseCard.id)),
    draftPoolCardUuids: draftPoolUuids(journeyState, journeyContent.cardDatabase),
    heldDreamsignIds,
    remainingDreamsignIds: new Set(journeyState.remainingDreamsignPool),
    affinityIndex,
    affinityContext,
    selectionContentRevision: selectionContentRevision(journeyContent),
  };
}
