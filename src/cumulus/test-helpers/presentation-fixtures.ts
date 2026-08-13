import { assertLocalized } from "@trox/runtime";

// localization-ignore: test-only fixture mirrors authored RON presentation copy.
export const SHOP_PRESENTATION = {
  kind: "shop",
  title: assertLocalized("Dream Market"),
  restocked: assertLocalized("Restocked"),
  restockOffersAction: assertLocalized("Restock Offers"),
  restockAction: assertLocalized("Restock"),
  freePrice: assertLocalized("Free"),
} as const;

// localization-ignore: test-only fixture mirrors authored RON presentation copy.
export const DREAMSIGN_MARKET_PRESENTATION = {
  kind: "dreamsign-bazaar",
  title: assertLocalized("Dreamsign Bazaar"),
  restocked: assertLocalized("Restocked"),
  restockOffersAction: assertLocalized("Restock Offers"),
  restockAction: assertLocalized("Restock"),
  freePrice: assertLocalized("Free"),
  replacementTitle: assertLocalized("Choose a Dreamsign to Replace"),
} as const;

// localization-ignore: test-only fixture mirrors authored RON presentation copy.
export const PURGE_PRESENTATION = {
  kind: "purge",
  title: assertLocalized("Purge Cards"),
  instruction: assertLocalized(
    "Choose any number of cards to remove from your deck for an essence cost",
  ),
  purgeAction: (count: number) => assertLocalized(`Purge ${String(count)}`),
} as const;

// localization-ignore: test-only fixture mirrors authored RON presentation copy.
export const DREAMSIGN_REVELATION_PRESENTATION = {
  kind: "dreamsign-revelation",
  loading: assertLocalized("Revealing Dreamsigns..."),
  exhausted: assertLocalized("The Dreamsign pool is exhausted."),
} as const;
