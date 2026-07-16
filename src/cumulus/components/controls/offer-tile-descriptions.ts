import {
  richText,
  type RichText,
} from "../card/rich-text";
import type { OfferTileModel } from "./OfferTile";

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

interface OfferTileDescription {
  readonly text: string;
  readonly rich: RichText;
}

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

function description(text: string): OfferTileDescription {
  return { text, rich: richText.plain(text) };
}

function describeOfferTile(model: OfferTileModel): OfferTileDescription {
  switch (model.kind) {
    case "card-gift":
      // Fit-card and strong-card grants intentionally share outcome-only copy.
      // The Augury UI does not expose how the granted card was selected.
      return description("Add a card to your deck.");
    case "card-draft":
      // Fit-card drafts intentionally describe the choice, not its fit scoring.
      return description("Choose a card to add to your deck.");
    case "category-draft":
      return description("Choose a card from the shown category to add to your deck.");
    case "transfigured-draft":
      // Four distinct transfigurations stay on the surfaced card faces rather
      // than being repeated in the compact tile description.
      return description("Choose a transfigured card to add to your deck.");
    case "copies-draft":
      // The copy count is the resulting action; candidate-selection rationale
      // intentionally remains out of the player-facing description.
      return description(
        `Choose a card and add ${cardinal(model.copyCount)} ${model.copyCount === 1 ? "copy" : "copies"} of it to your deck.`,
      );
    case "card-bundle":
      return description(
        `Add ${cardinal(model.cards.length)} cards to your deck.`,
      );
    case "transfigure-card":
      return description("Transfigure a card in your deck.");
    case "keyword-modification":
      return description("Reduce the Reclaim cost of a card.");
    case "tribal-change":
      return description("Change the subtype of a card.");
    case "transfigure-starters":
      return description(
        model.cards.length === 1
          ? "Transfigure a starter card."
          : "Transfigure your starter cards.",
      );
    case "purge-card":
      return description("Purge a card from your deck.");
    case "trade-card":
      // Purge-and-replace copy intentionally describes the swap without
      // exposing how its replacement candidates were selected.
      return description("Purge a card and choose a card to replace it.");
    case "duplicate-card":
      if (model.cards.length === 1) {
        return description("Duplicate a card in your deck.");
      }
      return description("Choose a card in your deck to duplicate.");
    case "dreamsign-gift":
      // Dreamsign matching rationale and passive rules text intentionally stay
      // off the offer tile; the tile communicates only that a sign is gained.
      return description("Gain a dreamsign.");
    case "dreamsign-draft":
      // The chooser intentionally omits both matching rationale and individual
      // Dreamsign rules; those details belong to the surfaced signs themselves.
      return description("Choose a dreamsign to gain.");
    case "add-site":
      return description("Add a site to the current dreamscape.");
  }
}

/** Exact player-facing action copy derived from the offer's structured model. */
export function offerTileDescription(model: OfferTileModel): string {
  return describeOfferTile(model).text;
}

/** Nonspecific InfoCard copy derived from the offer's structured model. */
export function offerTileRichDescription(model: OfferTileModel): RichText {
  return describeOfferTile(model).rich;
}
