// Pure view-model builder for Durgan Forgehammer's standard Cumulus
// Transfiguration site.

import type { LocalizedString } from "@trox/runtime";
import { requireGuideForSiteType } from "../../data/dreamscapes";
import { buildTransfigurationDisplay } from "../../transfiguration/transfiguration-logic";
import type { CardData } from "../../types/cards";
import type { DreamGuideContent } from "../../types/content";
import type {
  CardChoiceSiteRuntime,
  DreamscapeNode,
  JourneyState,
  SiteState,
} from "../../types/journey";
import type { ArtRef } from "../../cumulus/primitives/art";
import type { TransfigurationData } from "../../types/transfiguration-data";
import type { DeckEntryId } from "../../types/identifiers";
import { transfigurationForm } from "../../data/transfiguration-data";
import type {
  TransfigurationCandidateView,
  TransfigurationGuideView,
  TransfigurationSiteView,
} from "../../cumulus/screens/TransfigurationSiteScreen";
import { dreamscapeSceneRef } from "./dreamscape-view-model";
import { projectGuideView } from "./guide-view-model";
import { localizedTransfigurationPresentation } from "../../cumulus/components/controls/transfiguration-presentation";
import type { GuideId } from "../../types/identifiers";
const STANDARD_CANDIDATE_COUNT = 3;

/** Resolve Durgan, the resident guide for Transfiguration. */
export function resolveTransfigurationGuide(
  guides: readonly DreamGuideContent[],
  presentingGuideId?: GuideId,
): DreamGuideContent {
  return requireGuideForSiteType(guides, "Transfiguration", presentingGuideId);
}

/** Build the guide art and one stable greeting for the site layout. */
export function buildTransfigurationGuideView(
  guide: DreamGuideContent,
  guideLine: LocalizedString,
): TransfigurationGuideView {
  return projectGuideView(guide, guideLine);
}

/** Group persisted form rows into card choices for the active visit mode. */
export function buildTransfigurationCandidates(
  transfigurationData: TransfigurationData,
  state: JourneyState,
  runtime: CardChoiceSiteRuntime | null,
  cardDatabase: ReadonlyMap<number, CardData>,
  isEnhanced: boolean,
): TransfigurationCandidateView[] {
  if (runtime === null || runtime.choiceKind !== "transfiguration") return [];

  const deckByEntryId = new Map(
    state.deck.map((entry) => [entry.entryId, entry]),
  );
  const candidates = new Map<DeckEntryId, TransfigurationCandidateView>();

  for (const offer of runtime.transfigurationOffers) {
    const entry = deckByEntryId.get(offer.entryId);
    if (entry === undefined || entry.transfiguration !== null) continue;
    const card = cardDatabase.get(entry.cardNumber);
    if (card === undefined) continue;

    let candidate = candidates.get(entry.entryId);
    if (candidate === undefined) {
      if (!isEnhanced && candidates.size >= STANDARD_CANDIDATE_COUNT) continue;
      candidate = {
        entryId: entry.entryId,
        model: { cardId: card.id, displaySnapshot: card },
        availability: "available",
        reforgedType: null,
        forms: [],
      };
      candidates.set(entry.entryId, candidate);
    }

    const preview = buildTransfigurationDisplay(
      transfigurationData,
      card,
      offer.type,
    );
    candidate.forms.push({
      type: offer.type,
      presentation: localizedTransfigurationPresentation(
        transfigurationForm(transfigurationData, offer.type),
      ),
      effectDetails: offer.effectDetails,
      essenceCost: offer.essenceCost,
      affordable: offer.essenceCost <= state.essence,
      previewModel: {
        cardId: card.id,
        displaySnapshot: preview.card,
        transfiguration: preview.display,
      },
    });
  }

  const available = [...candidates.values()].filter(
    (candidate) => candidate.forms.length > 0,
  );
  if (!isEnhanced) return available;

  const availableByEntryId = new Map(
    available.map((candidate) => [candidate.entryId, candidate]),
  );
  const wholeDeck: TransfigurationCandidateView[] = [];
  for (const entry of state.deck) {
    const candidate = availableByEntryId.get(entry.entryId);
    if (candidate !== undefined) {
      wholeDeck.push(candidate);
      continue;
    }
    if (entry.transfiguration === null) continue;
    const card = cardDatabase.get(entry.cardNumber);
    if (card === undefined) continue;
    const reforged = buildTransfigurationDisplay(
      transfigurationData,
      card,
      entry.transfiguration,
    );
    wholeDeck.push({
      entryId: entry.entryId,
      model: {
        cardId: card.id,
        displaySnapshot: reforged.card,
        transfiguration: reforged.display,
      },
      availability: "reforged",
      reforgedType: entry.transfiguration,
      forms: [],
    });
  }
  return wholeDeck;
}

/** Build the complete standard desktop Transfiguration site view. */
export function buildTransfigurationSiteView(params: {
  state: JourneyState;
  sceneNode: DreamscapeNode | null;
  site: SiteState;
  runtime: CardChoiceSiteRuntime | null;
  cardDatabase: ReadonlyMap<number, CardData>;
  guide: DreamGuideContent;
  guideLine: LocalizedString;
  transfigurationData: TransfigurationData;
}): TransfigurationSiteView {
  const scene: ArtRef | null =
    params.sceneNode === null ? null : dreamscapeSceneRef(params.sceneNode);
  return {
    siteId: params.site.id,
    scene,
    guide: buildTransfigurationGuideView(params.guide, params.guideLine),
    ready: params.runtime !== null,
    isEnhanced: params.site.isEnhanced,
    candidates: buildTransfigurationCandidates(
      params.transfigurationData,
      params.state,
      params.runtime,
      params.cardDatabase,
      params.site.isEnhanced,
    ),
  };
}
