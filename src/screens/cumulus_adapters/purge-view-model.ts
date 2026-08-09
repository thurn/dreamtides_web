// Pure view-model builder for the Cumulus Purge site.

import { requireGuideForSiteType } from "../../data/dreamscapes";
import {
  maxAffordablePurgeCount,
  purgeVisitCost,
  type PurgePriceModifiers,
} from "../../purge/purge-pricing";
import type { CardData } from "../../types/cards";
import type { EconomyData } from "../../types/economy-data";
import type {
  DeckEntry,
  DreamscapeNode,
  JourneyState,
  SiteState,
} from "../../types/journey";
import type { ArtRef } from "../../cumulus/primitives/art";
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
import { projectGuideView } from "./guide-view-model";
import type { TransfigurationData } from "../../types/transfiguration-data";

/** Resolve Master Takeshi, the resident guide for Purge. */
export function resolvePurgeGuide(
  guides: readonly DreamGuideContent[],
  guideIdOverride?: string,
): DreamGuideContent {
  return requireGuideForSiteType(guides, "Purge", guideIdOverride);
}

/** Build the guide slice shown at the top of the purge screen. */
export function buildPurgeGuideView(
  guide: DreamGuideContent,
  guideLine: string,
): PurgeGuideView {
  return projectGuideView(guide, guideLine);
}

/** Resolve every deck entry into the card view used by the purge grid. */
export function buildPurgeCardViews(
  transfigurationData: TransfigurationData,
  deck: readonly DeckEntry[],
  cardDatabase: Map<number, CardData>,
): PurgeCardView[] {
  const cards: PurgeCardView[] = [];
  for (const entry of deck) {
    const view = toDeckCardView(transfigurationData, entry, cardDatabase);
    if (view === null) continue;
    cards.push({
      ...view,
      purgeCostKind: entry.isBane ? "free" : "paid",
    });
  }
  return cards;
}

/** Build the visit-cost ladder for selected paid-card counts. */
export function buildPurgeVisitCosts(
  config: EconomyData["purge"],
  modifiers: PurgePriceModifiers,
): number[] {
  const costs: number[] = [];
  for (let count = 0; count <= config.marginalCosts.length; count += 1) {
    costs.push(purgeVisitCost(config, count, modifiers));
  }
  return costs;
}

/** Build the complete Cumulus purge-site view-model. */
export function buildPurgeSiteView(params: {
  state: JourneyState;
  sceneNode: DreamscapeNode | null;
  site: SiteState;
  cardDatabase: Map<number, CardData>;
  transfigurationData: TransfigurationData;
  guide: DreamGuideContent;
  guideLine: string;
  tutorialConfiguration?: TutorialSiteConfiguration;
  economyData: EconomyData;
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
      params.economyData.purge,
      params.state.essence,
      params.economyData.purge.marginalCosts.length,
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
    cards: buildPurgeCardViews(
      params.transfigurationData,
      params.state.deck,
      params.cardDatabase,
    ),
    visitCosts: buildPurgeVisitCosts(params.economyData.purge, modifiers),
    maxPaidSelections,
  };
}
