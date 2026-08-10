import type { SitePresentation } from "../../types/sites-data";

// localization-ignore: test-only fixture mirrors authored RON presentation copy.
export const SHOP_PRESENTATION = {
  kind: "shop",
  title: "Dream Market",
  restocked: "Restocked",
  restockOffersAction: "Restock Offers",
  restockAction: "Restock",
  freePrice: "Free",
} satisfies Extract<SitePresentation, { kind: "shop" }>;

// localization-ignore: test-only fixture mirrors authored RON presentation copy.
export const DREAMSIGN_MARKET_PRESENTATION = {
  kind: "dreamsign-bazaar",
  title: "Dreamsign Bazaar",
  restocked: "Restocked",
  restockOffersAction: "Restock Offers",
  restockAction: "Restock",
  freePrice: "Free",
  replacementTitle: "Choose a Dreamsign to Replace",
} satisfies Extract<SitePresentation, { kind: "dreamsign-bazaar" }>;

// localization-ignore: test-only fixture mirrors authored RON presentation copy.
export const PURGE_PRESENTATION = {
  kind: "purge",
  title: "Purge Cards",
  instruction:
    "Choose any number of cards to remove from your deck for an essence cost",
  purgeAction: "Purge {count}",
} satisfies Extract<SitePresentation, { kind: "purge" }>;

// localization-ignore: test-only fixture mirrors authored RON presentation copy.
export const DREAMSIGN_REVELATION_PRESENTATION = {
  kind: "dreamsign-revelation",
  loading: "Revealing Dreamsigns...",
  exhausted: "The Dreamsign pool is exhausted.",
} satisfies Extract<SitePresentation, { kind: "dreamsign-revelation" }>;
