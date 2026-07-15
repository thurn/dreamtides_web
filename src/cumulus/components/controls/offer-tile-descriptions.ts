import type { OfferTileCard, OfferTileModel } from "./OfferTile";

const SMALL_CARDINALS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
] as const;

const TENS_CARDINALS = [
  "",
  "",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
] as const;

/** Spell the small, non-negative quantities carried by offer models. */
function cardinal(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) {
    return "the selected number of";
  }
  if (value < SMALL_CARDINALS.length) {
    return SMALL_CARDINALS[value] ?? "zero";
  }
  if (value < 100) {
    const tens = Math.floor(value / 10);
    const remainder = value % 10;
    const tensWord = TENS_CARDINALS[tens] ?? "";
    return remainder === 0
      ? tensWord
      : `${tensWord}-${SMALL_CARDINALS[remainder] ?? "zero"}`;
  }
  return "many";
}

function cardName(card: OfferTileCard): string {
  return card.displaySnapshot.name;
}

function namedCards(
  cards: readonly OfferTileCard[],
  conjunction: "and" | "or",
): string {
  if (cards.length === 1 && cards[0] !== undefined) {
    return cardName(cards[0]);
  }
  if (cards.length === 2 && cards[0] !== undefined && cards[1] !== undefined) {
    return `${cardName(cards[0])} ${conjunction} ${cardName(cards[1])}`;
  }
  return `${cardinal(cards.length)} cards`;
}

/** Exact player-facing action copy derived from the offer's structured model. */
export function offerTileDescription(model: OfferTileModel): string {
  switch (model.kind) {
    case "card-gift":
      return `Add ${cardName(model.card)} to your deck.`;
    case "card-draft":
    case "category-draft":
    case "transfigured-draft":
      return "Choose a card to add to your deck.";
    case "copies-draft":
      return `Choose a card and add ${cardinal(model.copyCount)} ${model.copyCount === 1 ? "copy" : "copies"} of it to your deck.`;
    case "card-bundle":
      return model.cards.length <= 2
        ? `Add ${namedCards(model.cards, "and")} to your deck.`
        : `Add all ${cardinal(model.cards.length)} cards to your deck.`;
    case "transfigure-card":
      return `Transfigure ${cardName(model.card)}.`;
    case "keyword-modification":
      return `Modify a keyword on ${cardName(model.card)}.`;
    case "tribal-change":
      return `Change the character type of ${cardName(model.card)}.`;
    case "transfigure-starters":
      return `Transfigure ${namedCards(model.cards, "and")}.`;
    case "purge-card":
      return `Purge ${cardName(model.card)}.`;
    case "trade-card":
      return `Purge ${cardName(model.outgoing)} and choose a card to replace it.`;
    case "duplicate-card":
      if (model.cards.length === 1) {
        return `Duplicate ${namedCards(model.cards, "or")}.`;
      }
      return model.cards.length === 2
        ? `Choose ${namedCards(model.cards, "or")} to duplicate.`
        : `Choose one of ${cardinal(model.cards.length)} cards in your deck to duplicate.`;
    case "dreamsign-gift":
      return "Add one dreamsign to your collection.";
    case "dreamsign-draft":
      return "Choose a dreamsign to add to your collection.";
    case "add-site":
      return "Add one site to the current dreamscape.";
  }
}
