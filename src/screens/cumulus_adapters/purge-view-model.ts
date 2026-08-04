// Pure view-model builder for the Cumulus Purge site.

import { guideForSiteType } from "../../data/dreamscapes";
import {
  MAX_PURGE_PER_VISIT,
  maxAffordablePurgeCount,
  purgeVisitCost,
  type PurgePriceModifiers,
} from "../../purge/purge-pricing";
import type { CardData } from "../../types/cards";
import type {
  DeckEntry,
  DreamscapeNode,
  JourneyState,
  SiteState,
} from "../../types/journey";
import { artRef, type ArtRef } from "../../cumulus/primitives/art";
import type {
  PurgeCardView,
  PurgeGuideView,
  PurgeSiteView,
} from "../../cumulus/screens/PurgeSiteScreen";
import type { DreamGuideContent } from "../../types/content";
import type { TutorialSiteConfiguration } from "../../types/tutorial";
import { toDeckCardView } from "./mobile-deck-view-model";
import { dreamscapeSceneRef } from "./dreamscape-view-model";
import { buildFirstVisitSiteTutorialView } from "./site-tutorial-view-model";

const FALLBACK_GUIDE_ID = "takeshi";
const FALLBACK_GUIDE_NAME = "Master Takeshi";
const FALLBACK_GUIDE_LINE = "A precise cut leaves the dream lighter.";

/** Resolve Master Takeshi, the resident guide for Purge. */
export function resolvePurgeGuide(
  guides: readonly DreamGuideContent[],
): DreamGuideContent | null {
  return guideForSiteType(guides, "Purge");
}

/** Build the guide slice shown at the top of the purge screen. */
export function buildPurgeGuideView(
  guide: DreamGuideContent | null,
  guideLine: string | null,
): PurgeGuideView {
  const id = guide?.id ?? FALLBACK_GUIDE_ID;
  return {
    id,
    name: guide?.name ?? FALLBACK_GUIDE_NAME,
    line: guideLine ?? guide?.dialog[0] ?? FALLBACK_GUIDE_LINE,
    art: artRef.dreamGuide(id),
  };
}

/** Resolve every deck entry into the card view used by the purge grid. */
export function buildPurgeCardViews(
  deck: readonly DeckEntry[],
  cardDatabase: Map<number, CardData>,
): PurgeCardView[] {
  const cards: PurgeCardView[] = [];
  for (const entry of deck) {
    const view = toDeckCardView(entry, cardDatabase);
    if (view === null) continue;
    cards.push({
      ...view,
      purgeCostKind: entry.isBane ? "free" : "paid",
    });
  }
  return cards;
}

/** Build the visit-cost ladder for selected paid-card counts. */
export function buildPurgeVisitCosts(modifiers: PurgePriceModifiers): number[] {
  const costs: number[] = [];
  for (let count = 0; count <= MAX_PURGE_PER_VISIT; count += 1) {
    costs.push(purgeVisitCost(count, modifiers));
  }
  return costs;
}

/** Build the complete Cumulus purge-site view-model. */
export function buildPurgeSiteView(params: {
  state: JourneyState;
  sceneNode: DreamscapeNode | null;
  site: SiteState;
  cardDatabase: Map<number, CardData>;
  guide: DreamGuideContent | null;
  guideLine: string | null;
  tutorialConfiguration?: TutorialSiteConfiguration;
}): PurgeSiteView {
  const modifiers: PurgePriceModifiers = {
    isEnhanced: params.site.isEnhanced,
    essenceDiscountPercent: params.state.shopModifiers.essenceDiscountPercent,
  };
  const paidCardCount = params.state.deck.filter(
    (entry) => !entry.isBane,
  ).length;
  const maxPaidSelections = Math.min(
    maxAffordablePurgeCount(
      params.state.essence,
      MAX_PURGE_PER_VISIT,
      modifiers,
    ),
    paidCardCount,
  );
  const scene: ArtRef | null =
    params.sceneNode !== null ? dreamscapeSceneRef(params.sceneNode) : null;

  return {
    siteId: params.site.id,
    scene,
    guide: buildPurgeGuideView(params.guide, params.guideLine),
    tutorial: buildFirstVisitSiteTutorialView(
      params.state,
      "Purge",
      params.tutorialConfiguration,
    ),
    cards: buildPurgeCardViews(params.state.deck, params.cardDatabase),
    visitCosts: buildPurgeVisitCosts(modifiers),
    maxPaidSelections,
  };
}
