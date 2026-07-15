import type { OfferTileModel } from "./OfferTile";

const OFFER_TILE_LABELS: Readonly<
  Record<OfferTileModel["kind"], string>
> = {
  "add-site": "Add Site",
  "card-bundle": "Card Bundle",
  "card-draft": "Card Draft",
  "card-gift": "Card Gift",
  "category-draft": "Category Draft",
  "copies-draft": "Copies Draft",
  "dreamsign-draft": "Dreamsign Draft",
  "dreamsign-gift": "Dreamsign Gift",
  "duplicate-card": "Duplicate Card",
  "keyword-modification": "Keyword Modification",
  "purge-card": "Purge Card",
  "trade-card": "Trade Card",
  "transfigure-card": "Transfigure Card",
  "transfigure-starters": "Refine Starters",
  "transfigured-draft": "Transfigured Draft",
  "tribal-change": "Kindred Change",
};

/** The category name used by an offer tile's accessible button label. */
export function offerTileLabel(model: OfferTileModel): string {
  return OFFER_TILE_LABELS[model.kind];
}

/** Exact player-facing action copy derived from the offer's structured model. */
export function offerTileDescription(model: OfferTileModel): string {
  switch (model.kind) {
    case "card-gift":
      return "Add 1 card to your deck.";
    case "card-draft":
      return `Choose 1 of ${String(model.cards.length)} cards to add to your deck.`;
    case "category-draft":
      return `Choose 1 of ${String(model.cards.length)} cards from a shared category to add to your deck.`;
    case "transfigured-draft":
      return `Choose 1 of ${String(model.cards.length)} transfigured cards to add to your deck.`;
    case "copies-draft":
      return `Choose 1 of ${String(model.cards.length)} cards and add ${String(model.copyCount)} ${model.copyCount === 1 ? "copy" : "copies"} of it to your deck.`;
    case "card-bundle":
      return `Add all ${String(model.cards.length)} cards to your deck.`;
    case "transfigure-card":
      return "Transfigure 1 card in your deck.";
    case "keyword-modification":
      return "Modify a keyword on 1 card in your deck.";
    case "tribal-change":
      return "Change the character type of 1 card in your deck.";
    case "transfigure-starters":
      return `Transfigure ${String(model.cards.length)} starter ${model.cards.length === 1 ? "card" : "cards"} in your deck.`;
    case "purge-card":
      return "Purge 1 card from your deck.";
    case "trade-card":
      return `Purge 1 card and choose 1 of ${String(model.incoming.length)} cards to add to your deck.`;
    case "duplicate-card":
      return `Choose 1 of ${String(model.cards.length)} ${model.cards.length === 1 ? "card" : "cards"} in your deck to duplicate.`;
    case "dreamsign-gift":
      return "Add 1 dreamsign to your collection.";
    case "dreamsign-draft":
      return `Choose 1 of ${String(model.dreamsigns.length)} dreamsigns to add to your collection.`;
    case "add-site":
      return "Add 1 site to the current dreamscape.";
  }
}
