export interface ShopFlowPresentation {
  readonly restocked: string;
  readonly restockOffersAction: string;
  readonly restockAction: string;
  readonly freePrice: string;
}

/** Shared interaction copy used by both shop-style site screens. */
export const SHOP_FLOW_PRESENTATION: ShopFlowPresentation = {
  restocked: "Restocked",
  restockOffersAction: "Restock Offers",
  restockAction: "Restock",
  freePrice: "Free",
};
