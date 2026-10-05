export const SHOP_PRESENTATION = {
  kind: "shop",
  title: "Dream Market",
  restocked: "Restocked",
  restockOffersAction: "Restock Offers",
  restockAction: "Restock",
  freePrice: "Free",
} as const;

export const DREAMSIGN_MARKET_PRESENTATION = {
  kind: "dreamsign-bazaar",
  title: "Dreamsign Bazaar",
  restocked: "Restocked",
  restockOffersAction: "Restock Offers",
  restockAction: "Restock",
  freePrice: "Free",
  replacementTitle: "Choose a Dreamsign to Replace",
} as const;

export const PURGE_PRESENTATION = {
  kind: "purge",
  title: "Purge Cards",
  instruction:
    "Choose any number of cards to remove from your deck for an essence cost",
  purgeAction: (count: number) => `Purge ${String(count)}`,
} as const;

export const DREAMSIGN_REVELATION_PRESENTATION = {
  kind: "dreamsign-revelation",
  loading: "Revealing Dreamsigns...",
  exhausted: "The Dreamsign pool is exhausted.",
} as const;
