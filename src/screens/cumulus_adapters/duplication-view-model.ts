// Pure view-model builder for the Cumulus Duplication site.

import type { LocalizedString } from "@trox/runtime";
import type { ArtRef } from "../../cumulus/primitives/art";
import type {
  DuplicationCardView,
  DuplicationGuideView,
  DuplicationSiteView,
} from "../../cumulus/screens/DuplicationSiteScreen";
import { requireGuideForSiteType } from "../../data/dreamscapes";
import type { CardData } from "../../types/cards";
import type { DreamGuideContent } from "../../types/content";
import type {
  CardChoiceSiteRuntime,
  DreamscapeNode,
  JourneyState,
  SiteState,
} from "../../types/journey";
import { dreamscapeSceneRef } from "./dreamscape-view-model";
import { toDeckCardView } from "./mobile-deck-view-model";
import { projectGuideView } from "./guide-view-model";
import type { TransfigurationData } from "../../types/transfiguration-data";
import type { GuideId } from "../../types/identifiers";
import type { DeckEntryId } from "../../types/identifiers";
import type { CardId } from "../../types/card-identity";

/** Resolve Deacon Holt, the resident guide for Duplication. */
export function resolveDuplicationGuide(
  guides: readonly DreamGuideContent[],
  presentingGuideId?: GuideId,
): DreamGuideContent {
  return requireGuideForSiteType(guides, "Duplication", presentingGuideId);
}

/** Build the guide art and stable greeting used by the shared site layout. */
export function buildDuplicationGuideView(
  guide: DreamGuideContent,
  guideLine: LocalizedString,
): DuplicationGuideView {
  return projectGuideView(guide, guideLine);
}

/** Resolve the persisted concrete entry ids into their current card displays. */
export function buildDuplicationCards(
  transfigurationData: TransfigurationData,
  state: JourneyState,
  runtime: CardChoiceSiteRuntime | null,
  cardDatabase: Map<number, CardData>,
): DuplicationCardView[] {
  if (runtime === null || runtime.choiceKind !== "duplication") return [];

  const deckByEntryId = new Map(
    state.deck.map((entry) => [entry.entryId, entry]),
  );
  const cards: DuplicationCardView[] = [];
  for (const entryId of runtime.entryIds) {
    const entry = deckByEntryId.get(entryId);
    if (entry === undefined) continue;
    const card = toDeckCardView(transfigurationData, entry, cardDatabase);
    if (card === null) continue;
    cards.push({ entryId: card.entryId, model: card.model });
  }
  return cards;
}

/** UUID-addressed offer identities recorded when the persisted offer is ready. */
export function buildDuplicationOfferLog(
  state: JourneyState,
  runtime: CardChoiceSiteRuntime,
  cardDatabase: Map<number, CardData>,
): Array<{ entryId: DeckEntryId; cardId: CardId }> {
  const deckByEntryId = new Map(
    state.deck.map((entry) => [entry.entryId, entry]),
  );
  return runtime.entryIds.flatMap((entryId) => {
    const entry = deckByEntryId.get(entryId);
    const cardId =
      entry === undefined ? undefined : cardDatabase.get(entry.cardNumber)?.id;
    return cardId === undefined ? [] : [{ entryId, cardId }];
  });
}

/** Build the complete Cumulus Duplication site view. */
export function buildDuplicationSiteView(params: {
  state: JourneyState;
  sceneNode: DreamscapeNode | null;
  site: SiteState;
  runtime: CardChoiceSiteRuntime | null;
  cardDatabase: Map<number, CardData>;
  guide: DreamGuideContent;
  guideLine: LocalizedString;
  transfigurationData: TransfigurationData;
}): DuplicationSiteView {
  const scene: ArtRef | null =
    params.sceneNode === null ? null : dreamscapeSceneRef(params.sceneNode);
  return {
    siteId: params.site.id,
    scene,
    guide: buildDuplicationGuideView(params.guide, params.guideLine),
    ready: params.runtime !== null,
    alreadyAccepted: (params.runtime?.acceptedEntryIds.length ?? 0) > 0,
    isEnhanced: params.site.isEnhanced,
    cards: buildDuplicationCards(
      params.transfigurationData,
      params.state,
      params.runtime,
      params.cardDatabase,
    ),
  };
}
