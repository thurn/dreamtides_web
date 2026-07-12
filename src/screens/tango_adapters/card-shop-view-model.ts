// Pure view-model builder for Tobias Tanglefur's Tango Card Shop.

import { buildCardSourceDebugState } from "../../debug/card-source-debug";
import { guideForSiteType } from "../../data/dreamscapes";
import {
  effectivePrice,
  rerollCost,
  type ShopPriceModifiers,
} from "../../shop/shop-generator";
import type { CardData } from "../../types/cards";
import type {
  DreamGuideContent,
  ResolvedDreamcallerPackage,
} from "../../types/content";
import type {
  CardSourceDebugState,
  DreamscapeNode,
  QuestState,
  ShopSiteRuntime,
  SiteState,
} from "../../types/quest";
import { artRef, type ArtRef } from "../../tango/primitives/art";
import type {
  CardShopOfferView,
  CardShopRestockView,
  CardShopSiteView,
} from "../../tango/screens/CardShopSiteScreen";
import {
  dreamscapeSceneRef,
} from "./dreamscape-view-model";

const FALLBACK_GUIDE_ID = "tobias_tanglefur";
const FALLBACK_GUIDE_NAME = "Tobias Tanglefur";
const FALLBACK_GUIDE_LINE = "Welcome, friend! Browse a while.";

/** Resolve Tobias, the resident Dream Guide for Card Shops. */
export function resolveCardShopGuide(
  guides: readonly DreamGuideContent[],
): DreamGuideContent | null {
  return guideForSiteType(guides, "Shop");
}

/** Build Tobias's guide slice for the shared character-gallery layout. */
export function buildCardShopGuideView(
  guide: DreamGuideContent | null,
  guideLine: string | null,
) {
  const id = guide?.id ?? FALLBACK_GUIDE_ID;
  return {
    id,
    name: guide?.name ?? FALLBACK_GUIDE_NAME,
    line: guideLine ?? guide?.dialog[0] ?? FALLBACK_GUIDE_LINE,
    art: artRef.dreamGuide(id),
  };
}

/** Resolve persistent card slots into UUID-derived, effectively priced wares. */
export function buildCardShopOffers(
  runtime: ShopSiteRuntime,
  cardDatabase: ReadonlyMap<number, CardData>,
  essence: number,
  priceModifiers: ShopPriceModifiers,
): CardShopOfferView[] {
  const offers: CardShopOfferView[] = [];
  runtime.slots.forEach((slot, slotIndex) => {
    if (slot.itemType !== "card") return;
    const card = cardDatabase.get(slot.cardNumber);
    if (card === undefined) return;
    const price = effectivePrice(slot, priceModifiers);
    offers.push({
      entryId: `shop-slot-${String(slotIndex)}-${card.id}`,
      slotIndex,
      model: { cardId: card.id, displaySnapshot: card },
      price,
      state: slot.purchased
        ? "purchased"
        : price <= essence
          ? "available"
          : "unaffordable",
    });
  });
  return offers;
}

/** Build the one-use restock action for this visit. */
export function buildCardShopRestock(
  runtime: ShopSiteRuntime,
  site: SiteState,
  essence: number,
): CardShopRestockView {
  const price = rerollCost(0, site.isEnhanced);
  return {
    entryId: `shop-restock-${site.id}`,
    price,
    state:
      runtime.rerollCount > 0
        ? "used"
        : price <= essence
          ? "available"
          : "unaffordable",
  };
}

/** Build the debug provenance state for the cards currently on the shelf. */
export function buildCardShopDebugState(
  offers: readonly CardShopOfferView[],
  resolvedPackage: ResolvedDreamcallerPackage | null,
): CardSourceDebugState | null {
  return buildCardSourceDebugState(
    "Shop Offers",
    "Shop",
    offers
      .filter((offer) => offer.state !== "purchased")
      .map((offer) => offer.model.displaySnapshot),
    resolvedPackage,
  );
}

/** Build the complete Tango Card Shop view-model. */
export function buildCardShopSiteView(params: {
  state: QuestState;
  sceneNode: DreamscapeNode | null;
  site: SiteState;
  runtime: ShopSiteRuntime;
  cardDatabase: ReadonlyMap<number, CardData>;
  guide: DreamGuideContent | null;
  guideLine: string | null;
}): CardShopSiteView {
  const priceModifiers: ShopPriceModifiers = {
    essenceDiscountPercent: params.state.shopModifiers.essenceDiscountPercent,
  };
  const scene: ArtRef | null =
    params.sceneNode !== null ? dreamscapeSceneRef(params.sceneNode) : null;
  return {
    siteId: params.site.id,
    scene,
    guide: buildCardShopGuideView(params.guide, params.guideLine),
    offers: buildCardShopOffers(
      params.runtime,
      params.cardDatabase,
      params.state.essence,
      priceModifiers,
    ),
    restock: buildCardShopRestock(
      params.runtime,
      params.site,
      params.state.essence,
    ),
  };
}
