// Pure view-model builder for Tobias Tanglefur's Cumulus Card Shop.

import type { LocalizedString } from "@trox/runtime";
import { buildCardSourceDebugState } from "../../debug/card-source-debug";
import { requireGuideForSiteType } from "../../data/dreamscapes";
import {
  effectivePrice,
  type ShopPriceModifiers,
} from "../../shop/shop-generator";
import { rerollCost } from "../../shop/shop-pricing";
import type { CardData } from "../../types/cards";
import type { EconomyData } from "../../types/economy-data";
import type { TransfigurationData } from "../../types/transfiguration-data";
import type { SitesData } from "../../types/sites-data";
import type {
  DreamGuideContent,
  ResolvedDreamAvatarPackage,
} from "../../types/content";
import type {
  CardSourceDebugState,
  DreamscapeNode,
  JourneyState,
  ShopSiteRuntime,
  SiteState,
} from "../../types/journey";
import type { ArtRef } from "../../cumulus/primitives/art";
import type {
  CardShopOfferView,
  CardShopRestockView,
  CardShopSiteView,
} from "../../cumulus/screens/CardShopSiteScreen";
import { dreamscapeSceneRef } from "./dreamscape-view-model";
import { buildTransfigurationDisplay } from "../../transfiguration/transfiguration-logic";
import { projectGuideView } from "./guide-view-model";
import {
  buildShopFreePurchaseStatus,
  hasFreePurchase,
} from "./shop-free-purchase-view-model";
import type { GuideId } from "../../types/identifiers";
import type { SiteId } from "../../types/identifiers";
import { parseDeckEntryId } from "../../types/identifiers";
import type { ExplorationActionId } from "../../types/identifiers";
import { bindSourceTransport } from "../../runtime/localization/runtime";
import { SHOP_FLOW_PRESENTATION } from "./shop-flow-presentation-view-model";

/** Resolve Tobias, the resident Dream Guide for Card Shops. */
export function resolveCardShopGuide(
  guides: readonly DreamGuideContent[],
  presentingGuideId?: GuideId,
): DreamGuideContent {
  return requireGuideForSiteType(guides, "Shop", presentingGuideId);
}

/** Build Tobias's guide slice for the shared character-gallery layout. */
export function buildCardShopGuideView(
  guide: DreamGuideContent,
  guideLine: LocalizedString,
) {
  return projectGuideView(guide, guideLine);
}

/** Resolve persistent card slots into UUID-derived, effectively priced wares. */
export function buildCardShopOffers(
  transfigurationData: TransfigurationData,
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
    const transfigured =
      slot.transfiguration === undefined
        ? null
        : buildTransfigurationDisplay(
            transfigurationData,
            card,
            slot.transfiguration,
          );
    const price = effectivePrice(slot, priceModifiers);
    offers.push({
      entryId: parseDeckEntryId(`shop-slot-${String(slotIndex)}-${card.id}`),
      slotIndex,
      model:
        transfigured === null
          ? { cardId: card.id, displaySnapshot: card }
          : {
              cardId: card.id,
              displaySnapshot: transfigured.card,
              transfiguration: transfigured.display,
            },
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

/** Build the configured restock action for this visit. */
export function buildCardShopRestock(
  config: EconomyData["shop"]["reroll"],
  runtime: ShopSiteRuntime,
  site: SiteState,
  essence: number,
): CardShopRestockView {
  const price = rerollCost(config, runtime.rerollCount, site.isEnhanced);
  return {
    entryId: parseDeckEntryId(`shop-restock-${site.id}`),
    price,
    state:
      runtime.rerollCount >= config.maxPerVisit
        ? "used"
        : price <= essence
          ? "available"
          : "unaffordable",
  };
}

/** Build the debug provenance state for the cards currently on the shelf. */
export function buildCardShopDebugState(
  offers: readonly CardShopOfferView[],
  resolvedPackage: ResolvedDreamAvatarPackage | null,
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

/** UUID-only reconstruction payload for an Exploration-transfigured Shop. */
export function buildCardShopTransfiguredOfferLog(
  view: CardShopSiteView,
  source: { readonly siteId: SiteId; readonly actionId: ExplorationActionId },
) {
  return {
    sourceSiteId: source.siteId,
    sourceActionId: source.actionId,
    cards: view.offers.flatMap((offer) =>
      offer.model.transfiguration === undefined
        ? []
        : [
            {
              cardId: offer.model.cardId,
              slotIndex: offer.slotIndex,
              transfiguration: offer.model.transfiguration.type,
            },
          ],
    ),
  };
}

/** Build the complete Cumulus Card Shop view-model. */
export function buildCardShopSiteView(params: {
  state: JourneyState;
  sceneNode: DreamscapeNode | null;
  site: SiteState;
  runtime: ShopSiteRuntime;
  cardDatabase: ReadonlyMap<number, CardData>;
  guide: DreamGuideContent;
  guideLine: LocalizedString;
  economyData: EconomyData;
  transfigurationData: TransfigurationData;
  sitesData: SitesData;
}): CardShopSiteView {
  const priceModifiers: ShopPriceModifiers = {
    essenceDiscountPercent: params.state.shopModifiers.essenceDiscountPercent,
    freePurchase: hasFreePurchase(params.runtime, params.state.shopModifiers),
  };
  const scene: ArtRef | null =
    params.sceneNode !== null ? dreamscapeSceneRef(params.sceneNode) : null;
  return {
    presentation: (() => {
      const identity = params.sitesData.siteTypes.Shop.presentation as Extract<
        import("../../types/sites-data").SitePresentation,
        { kind: "shop" }
      >;
      return {
        kind: identity.kind,
        title: bindSourceTransport(identity.title),
        ...SHOP_FLOW_PRESENTATION,
      };
    })(),
    siteId: params.site.id,
    scene,
    guide: buildCardShopGuideView(params.guide, params.guideLine),
    offers: buildCardShopOffers(
      params.transfigurationData,
      params.runtime,
      params.cardDatabase,
      params.state.essence,
      priceModifiers,
    ),
    restock: buildCardShopRestock(
      params.economyData.shop.reroll,
      params.runtime,
      params.site,
      params.state.essence,
    ),
    freePurchaseStatus: buildShopFreePurchaseStatus(
      params.runtime,
      params.state.shopModifiers,
    ),
  };
}
