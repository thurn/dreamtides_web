// Pure view-model builder for Amunet's Cumulus Dreamsign Bazaar.

import { guideForSiteType } from "../../data/dreamscapes";
import { requireDreamsignId } from "../../data/dreamsigns";
import {
  effectivePrice,
  type ShopPriceModifiers,
} from "../../shop/shop-generator";
import { rerollCost } from "../../shop/shop-pricing";
import type { DreamGuideContent } from "../../types/content";
import type {
  DreamscapeNode,
  Dreamsign,
  JourneyState,
  ShopSiteRuntime,
  SiteState,
} from "../../types/journey";
import { artRef, type ArtRef } from "../../cumulus/primitives/art";
import type {
  DreamsignBazaarOfferView,
  DreamsignBazaarPurgeView,
  DreamsignBazaarRestockView,
  DreamsignBazaarSiteView,
} from "../../cumulus/screens/DreamsignBazaarSiteScreen";
import { dreamscapeSceneRef } from "./dreamscape-view-model";

const FALLBACK_GUIDE_ID = "amunet_the_tomb_keeper";
const FALLBACK_GUIDE_NAME = "Amunet, the Tomb-Keeper";
const FALLBACK_GUIDE_LINE = "The sands remember all dreams.";

/** Resolve Amunet, the resident Dream Guide for Dreamsign Markets. */
export function resolveDreamsignBazaarGuide(
  guides: readonly DreamGuideContent[],
): DreamGuideContent | null {
  return guideForSiteType(guides, "DreamsignMarket");
}

/** Build Amunet's guide slice for the shared character-gallery layout. */
export function buildDreamsignBazaarGuideView(
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

/** Resolve persistent Dreamsign slots into UUID-derived, effectively priced wares. */
export function buildDreamsignBazaarOffers(
  runtime: ShopSiteRuntime,
  state: Pick<JourneyState, "essence" | "dreamsigns" | "maxDreamsigns">,
  priceModifiers: ShopPriceModifiers,
): DreamsignBazaarOfferView[] {
  const offers: DreamsignBazaarOfferView[] = [];
  runtime.slots.forEach((slot, slotIndex) => {
    if (slot.itemType !== "dreamsign") return;
    const dreamsignId = requireDreamsignId(
      slot.dreamsign,
      "Dreamsign Bazaar offer",
    );
    const price = effectivePrice(slot, priceModifiers);
    offers.push({
      entryId: `shop-slot-${String(slotIndex)}-${dreamsignId}`,
      slotIndex,
      dreamsign: slot.dreamsign,
      price,
      state: slot.purchased
        ? "purchased"
        : price <= state.essence
          ? "available"
          : "unaffordable",
      requiresReplacement:
        !slot.purchased && state.dreamsigns.length >= state.maxDreamsigns,
    });
  });
  return offers;
}

/** Build the one-use restock action for this visit. */
export function buildDreamsignBazaarRestock(
  runtime: ShopSiteRuntime,
  site: SiteState,
  essence: number,
): DreamsignBazaarRestockView {
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

/** Build the replacement overlay shown when a purchase reaches the cap. */
export function buildDreamsignBazaarPurgeView(
  state: Pick<JourneyState, "dreamsigns" | "maxDreamsigns">,
  pendingDreamsign: Dreamsign | null,
): DreamsignBazaarPurgeView | null {
  return pendingDreamsign === null
    ? null
    : {
        pendingDreamsign,
        currentDreamsigns: state.dreamsigns,
        maxDreamsigns: state.maxDreamsigns,
      };
}

/** Build the complete Cumulus Dreamsign Bazaar view-model. */
export function buildDreamsignBazaarSiteView(params: {
  state: JourneyState;
  sceneNode: DreamscapeNode | null;
  site: SiteState;
  runtime: ShopSiteRuntime;
  guide: DreamGuideContent | null;
  guideLine: string | null;
  pendingDreamsign: Dreamsign | null;
}): DreamsignBazaarSiteView {
  const priceModifiers: ShopPriceModifiers = {
    essenceDiscountPercent: params.state.shopModifiers.essenceDiscountPercent,
  };
  const scene: ArtRef | null =
    params.sceneNode !== null ? dreamscapeSceneRef(params.sceneNode) : null;
  return {
    siteId: params.site.id,
    scene,
    guide: buildDreamsignBazaarGuideView(params.guide, params.guideLine),
    offers: buildDreamsignBazaarOffers(
      params.runtime,
      params.state,
      priceModifiers,
    ),
    restock: buildDreamsignBazaarRestock(
      params.runtime,
      params.site,
      params.state.essence,
    ),
    purge: buildDreamsignBazaarPurgeView(params.state, params.pendingDreamsign),
  };
}
