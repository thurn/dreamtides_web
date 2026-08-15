import { tx, type LocalizedString } from "@trox/runtime";

export interface ShopFlowPresentation {
  readonly restocked: LocalizedString;
  readonly restockOffersAction: LocalizedString;
  readonly restockAction: LocalizedString;
  readonly freePrice: LocalizedString;
}

/** Shared interaction copy used by both shop-style site screens. */
export const SHOP_FLOW_PRESENTATION: ShopFlowPresentation = {
  restocked: tx(
    "Restocked",
    "[shop] Status shown after the available shop offers have been refreshed.",
  ),
  restockOffersAction: tx(
    "Restock Offers",
    "[shop] Accessible action label for refreshing the available shop offers.",
  ),
  restockAction: tx(
    "Restock",
    "[shop] Short button label for refreshing the available shop offers.",
  ),
  freePrice: tx(
    "Free",
    "[shop] Price label shown when an offer costs no essence.",
  ),
};
