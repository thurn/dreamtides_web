// Pure view-model builder for the Cumulus Duplication site.

import { artRef, type ArtRef } from "../../cumulus/primitives/art";
import type {
  DuplicationCardView,
  DuplicationGuideView,
  DuplicationSiteView,
} from "../../cumulus/screens/DuplicationSiteScreen";
import { guideForSiteType } from "../../data/dreamscapes";
import type { CardData } from "../../types/cards";
import type { DreamGuideContent } from "../../types/content";
import type {
  CardChoiceSiteRuntime,
  DreamscapeNode,
  QuestState,
  SiteState,
} from "../../types/quest";
import { dreamscapeSceneRef } from "./dreamscape-view-model";
import { toDeckCardView } from "./mobile-deck-view-model";

const FALLBACK_GUIDE_ID = "deacon_holt";
const FALLBACK_GUIDE_NAME = "Deacon Holt";
const FALLBACK_GUIDE_LINE = "Pick one, and I'll make another.";

/** Resolve Deacon Holt, the resident guide for Duplication. */
export function resolveDuplicationGuide(
  guides: readonly DreamGuideContent[],
): DreamGuideContent | null {
  return guideForSiteType(guides, "Duplication");
}

/** Build the guide art and stable greeting used by the shared site layout. */
export function buildDuplicationGuideView(
  guide: DreamGuideContent | null,
  guideLine: string | null,
): DuplicationGuideView {
  const id = guide?.id ?? FALLBACK_GUIDE_ID;
  return {
    id,
    name: guide?.name ?? FALLBACK_GUIDE_NAME,
    line: guideLine ?? guide?.dialog[0] ?? FALLBACK_GUIDE_LINE,
    art: artRef.dreamGuide(id),
  };
}

/** Resolve the persisted concrete entry ids into their current card displays. */
export function buildDuplicationCards(
  state: QuestState,
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
    const card = toDeckCardView(entry, cardDatabase);
    if (card === null) continue;
    cards.push({ entryId: card.entryId, model: card.model });
  }
  return cards;
}

/** Build the complete Cumulus Duplication site view. */
export function buildDuplicationSiteView(params: {
  state: QuestState;
  sceneNode: DreamscapeNode | null;
  site: SiteState;
  runtime: CardChoiceSiteRuntime | null;
  cardDatabase: Map<number, CardData>;
  guide: DreamGuideContent | null;
  guideLine: string | null;
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
      params.state,
      params.runtime,
      params.cardDatabase,
    ),
  };
}
