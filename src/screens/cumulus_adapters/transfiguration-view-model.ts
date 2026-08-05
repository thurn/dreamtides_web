// Pure view-model builder for Durgan Forgehammer's standard Cumulus
// Transfiguration site.

import { guideForSiteType } from "../../data/dreamscapes";
import { buildTransfigurationDisplay } from "../../transfiguration/transfiguration-logic";
import type { CardData } from "../../types/cards";
import type { DreamGuideContent } from "../../types/content";
import type {
  CardChoiceSiteRuntime,
  DreamscapeNode,
  JourneyState,
  SiteState,
} from "../../types/journey";
import { artRef, type ArtRef } from "../../cumulus/primitives/art";
import type {
  TransfigurationCandidateView,
  TransfigurationGuideView,
  TransfigurationSiteView,
} from "../../cumulus/screens/TransfigurationSiteScreen";
import { dreamscapeSceneRef } from "./dreamscape-view-model";

const FALLBACK_GUIDE_ID = "durgan_forgehammer";
const FALLBACK_GUIDE_NAME = "Durgan Forgehammer";
const FALLBACK_GUIDE_LINE = "Stoke the forge — let's reshape it.";
const STANDARD_CANDIDATE_COUNT = 3;

/** Resolve Durgan, the resident guide for Transfiguration. */
export function resolveTransfigurationGuide(
  guides: readonly DreamGuideContent[],
  guideIdOverride?: string,
): DreamGuideContent | null {
  return guideForSiteType(guides, "Transfiguration", guideIdOverride);
}

/** Build the guide art and one stable greeting for the site layout. */
export function buildTransfigurationGuideView(
  guide: DreamGuideContent | null,
  guideLine: string | null,
): TransfigurationGuideView {
  const id = guide?.id ?? FALLBACK_GUIDE_ID;
  return {
    id,
    name: guide?.name ?? FALLBACK_GUIDE_NAME,
    line: guideLine ?? guide?.dialog[0] ?? FALLBACK_GUIDE_LINE,
    art: artRef.dreamGuide(id),
  };
}

/** Group persisted form rows into card choices for the active visit mode. */
export function buildTransfigurationCandidates(
  state: JourneyState,
  runtime: CardChoiceSiteRuntime | null,
  cardDatabase: ReadonlyMap<number, CardData>,
  isEnhanced: boolean,
): TransfigurationCandidateView[] {
  if (runtime === null || runtime.choiceKind !== "transfiguration") return [];

  const deckByEntryId = new Map(
    state.deck.map((entry) => [entry.entryId, entry]),
  );
  const candidates = new Map<string, TransfigurationCandidateView>();

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

    const preview = buildTransfigurationDisplay(card, offer.type);
    candidate.forms.push({
      type: offer.type,
      description: offer.effectDescription,
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
    const reforged = buildTransfigurationDisplay(card, entry.transfiguration);
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
  guide: DreamGuideContent | null;
  guideLine: string | null;
}): TransfigurationSiteView {
  const scene: ArtRef | null =
    params.sceneNode === null ? null : dreamscapeSceneRef(params.sceneNode);
  return {
    siteId: params.site.id,
    scene,
    guide: buildTransfigurationGuideView(params.guide, params.guideLine),
    ready: params.runtime !== null,
    isEnhanced: params.site.isEnhanced,
    alreadyAccepted: (params.runtime?.acceptedEntryIds.length ?? 0) > 0,
    candidates: buildTransfigurationCandidates(
      params.state,
      params.runtime,
      params.cardDatabase,
      params.site.isEnhanced,
    ),
  };
}
