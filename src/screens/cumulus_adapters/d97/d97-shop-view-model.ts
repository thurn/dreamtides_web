// The pure view-model builders for a Dreamtides 97 shop: its stock as the
// shared card-shop view (each slot's fixed quote, bought slots empty, slots
// the player cannot afford disabled, and this visit's one restock), and the
// sell panel (every owned copy captioned with what the shop pays for it,
// under the resale guard). Card UUIDs resolve to cards only here.

import type { D97ShopTuning } from "../../../content/d97/shop";
import type { CardShopSiteView } from "../../../cumulus/screens/CardShopSiteScreen";
import type { SiteLayoutGuideView } from "../../../cumulus/components/layout/SiteLayout";
import type { D97ShopSellCardView, D97ShopSellView } from "../../../cumulus/screens/d97/D97ShopSellPanel";
import { copiesInZone } from "../../../d97/collection/collection";
import type { D97CopyZone } from "../../../d97/collection/types";
import { cardBaseValue, cardPriceFactsOf, restockPrice, saleQuote } from "../../../d97/shop/pricing";
import type { D97Run, D97Shop } from "../../../rules/d97/d97-state";
import type { CardId } from "../../../types/card-identity";
import type { CardData } from "../../../types/cards";
import { parseDeckEntryId, parseSiteId, type DreamAnchorId } from "../../../types/identifiers";
import { SHOP_FLOW_PRESENTATION } from "../shop-flow-presentation-view-model";

/** The shared card-shop view of a D97 shop. Slots of unknown cards are hidden. */
export function buildD97ShopView(input: {
  readonly anchorId: DreamAnchorId;
  readonly shop: D97Shop;
  readonly essence: number;
  readonly cards: ReadonlyMap<CardId, CardData>;
  readonly title: string;
  readonly guide: SiteLayoutGuideView;
  readonly tuning: D97ShopTuning;
}): CardShopSiteView {
  const { anchorId, shop, essence, cards, tuning } = input;
  const restock = restockPrice(tuning.priceBand, tuning);
  return {
    presentation: { kind: "shop", title: input.title, ...SHOP_FLOW_PRESENTATION },
    siteId: parseSiteId(`d97-shop-${anchorId}`),
    scene: null,
    guide: input.guide,
    offers: shop.slots.flatMap((slot, slotIndex) => {
      const card = cards.get(slot.cardId);
      if (card === undefined) return [];
      return [
        {
          entryId: parseDeckEntryId(`d97-shop-slot-${String(shop.rolls)}-${String(slotIndex)}-${card.id}`),
          slotIndex,
          model: { cardId: card.id, displaySnapshot: card },
          price: slot.price,
          state: slot.purchased ? "purchased" : slot.price <= essence ? "available" : "unaffordable",
        } as const,
      ];
    }),
    restock: {
      entryId: parseDeckEntryId(`d97-shop-restock-${anchorId}`),
      price: restock,
      state: shop.restockedThisVisit ? "used" : restock <= essence ? "available" : "unaffordable",
    },
    freePurchaseStatus: { freeNextShopSource: null, freePurchasesRemaining: 0 },
  };
}

/** The sell panel view of `run`'s collection. Copies of unknown cards are hidden. */
export function buildD97ShopSellView(input: {
  readonly run: D97Run;
  readonly cards: ReadonlyMap<CardId, CardData>;
  readonly collectionFloor: number;
  readonly tuning: D97ShopTuning;
}): D97ShopSellView {
  const { run, cards, tuning } = input;
  const zone = (name: D97CopyZone): D97ShopSellCardView[] =>
    copiesInZone(run.collection, name).flatMap((copy) => {
      const card = cards.get(copy.cardId);
      if (card === undefined) return [];
      const price = saleQuote(copy, cardBaseValue(cardPriceFactsOf(card), tuning), tuning.priceBand, tuning);
      return [
        {
          entryId: copy.copyId,
          model: { cardId: card.id, displaySnapshot: card },
          caption: { kind: "essence", amount: price },
          testId: `d97-shop-sell-card-${copy.copyId}`,
        },
      ];
    });
  return {
    reserve: zone("reserve"),
    deck: zone("deck"),
    collectionFloor: input.collectionFloor,
    atFloor: run.collection.copies.length <= input.collectionFloor,
  };
}
