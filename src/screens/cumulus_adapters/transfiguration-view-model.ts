// Pure view-model builder for Durgan Forgehammer's standard Cumulus
// Transfiguration site.

import { guideForSiteType } from "../../data/dreamscapes";
import { buildTransfigurationDisplay } from "../../transfiguration/transfiguration-logic";
import type { CardData } from "../../types/cards";
import type { DreamGuideContent } from "../../types/content";
import type {
  CardChoiceSiteRuntime,
  DreamscapeNode,
  QuestState,
  SiteState,
} from "../../types/quest";
import { TRANSFIGURATION_COLORS } from "../../runtime/transfiguration-display";
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
): DreamGuideContent | null {
  return guideForSiteType(guides, "Transfiguration");
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

/** Group the persisted flat offer rows into the three standard card choices. */
export function buildTransfigurationCandidates(
  state: QuestState,
  runtime: CardChoiceSiteRuntime | null,
  cardDatabase: ReadonlyMap<number, CardData>,
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
      if (candidates.size >= STANDARD_CANDIDATE_COUNT) continue;
      candidate = {
        entryId: entry.entryId,
        model: { cardId: card.id, displaySnapshot: card },
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
      accent: TRANSFIGURATION_COLORS[offer.type],
      previewModel: {
        cardId: card.id,
        displaySnapshot: preview.card,
        transfiguration: preview.display,
      },
    });
  }

  return [...candidates.values()].filter(
    (candidate) => candidate.forms.length > 0,
  );
}

/** Build the complete standard desktop Transfiguration site view. */
export function buildTransfigurationSiteView(params: {
  state: QuestState;
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
    alreadyAccepted:
      (params.runtime?.acceptedEntryIds.length ?? 0) > 0,
    candidates: buildTransfigurationCandidates(
      params.state,
      params.runtime,
      params.cardDatabase,
    ),
  };
}
