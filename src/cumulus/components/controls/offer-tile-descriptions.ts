import {
  richText,
  type RichText,
} from "../card/rich-text";
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

interface DescriptionSegment {
  readonly text: string;
  readonly underline?: true;
}

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

function prose(text: string): DescriptionSegment {
  return { text };
}

function specificName(text: string): DescriptionSegment {
  return { text, underline: true };
}

function description(...segments: readonly DescriptionSegment[]): OfferTileDescription {
  const text = segments.map((segment) => segment.text).join("");
  const rich = segments.some((segment) => segment.underline === true)
    ? richText.inline(
        ...segments.map((segment) =>
          segment.underline === true
            ? richText.underline(segment.text)
            : richText.plain(segment.text),
        ),
      )
    : richText.plain(text);
  return { text, rich };
}

function cardName(card: OfferTileCard): DescriptionSegment {
  return specificName(card.displaySnapshot.name);
}

function namedCards(
  cards: readonly OfferTileCard[],
  conjunction: "and" | "or",
): readonly DescriptionSegment[] {
  if (cards.length === 1 && cards[0] !== undefined) {
    return [cardName(cards[0])];
  }
  if (cards.length === 2 && cards[0] !== undefined && cards[1] !== undefined) {
    return [cardName(cards[0]), prose(` ${conjunction} `), cardName(cards[1])];
  }
  const segments: DescriptionSegment[] = [];
  cards.forEach((card, index) => {
    if (index > 0) {
      segments.push(
        prose(index === cards.length - 1 ? `, ${conjunction} ` : ", "),
      );
    }
    segments.push(cardName(card));
  });
  return segments;
}

function indefiniteArticle(noun: string): "a" | "an" {
  return /^[aeiou]/i.test(noun) ? "an" : "a";
}

function describeOfferTile(model: OfferTileModel): OfferTileDescription {
  switch (model.kind) {
    case "card-gift":
      // Fit-card and strong-card grants intentionally share outcome-only copy.
      // The Augury UI does not expose how the granted card was selected.
      return description(prose("Add "), cardName(model.card), prose(" to your deck."));
    case "card-draft":
      // Fit-card drafts intentionally describe the choice, not its fit scoring.
      return description(prose("Choose a card to add to your deck."));
    case "category-draft":
      return description(
        prose(
          `Choose ${indefiniteArticle(model.categoryName)} ${model.categoryName} to add to your deck.`,
        ),
      );
    case "transfigured-draft":
      // Four distinct transfigurations stay on the surfaced card faces rather
      // than being repeated in the compact tile description.
      return description(prose("Choose a transfigured card to add to your deck."));
    case "copies-draft":
      // The copy count is the resulting action; candidate-selection rationale
      // intentionally remains out of the player-facing description.
      return description(
        prose(
          `Choose a card and add ${cardinal(model.copyCount)} ${model.copyCount === 1 ? "copy" : "copies"} of it to your deck.`,
        ),
      );
    case "card-bundle":
      return description(
        prose("Add "),
        ...namedCards(model.cards, "and"),
        prose(" to your deck."),
      );
    case "transfigure-card":
      return description(
        prose("Transfigure "),
        cardName(model.card),
        prose(` into its ${model.transfiguration} form.`),
      );
    case "keyword-modification":
      return description(
        prose("Reduce the Reclaim cost of "),
        cardName(model.card),
        prose(` by ${cardinal(model.reclaimReduction)}.`),
      );
    case "tribal-change":
      return description(
        prose("Change the subtype of "),
        cardName(model.card),
        prose(` to ${model.newCharacterSubtype}.`),
      );
    case "transfigure-starters":
      return description(
        prose("Transfigure "),
        ...namedCards(model.cards, "and"),
        prose("."),
      );
    case "purge-card":
      return description(prose("Purge "), cardName(model.card), prose("."));
    case "trade-card":
      // Purge-and-replace copy intentionally describes the swap without
      // exposing how its replacement candidates were selected.
      return description(
        prose("Purge "),
        cardName(model.outgoing),
        prose(" and choose a card to replace it."),
      );
    case "duplicate-card":
      if (model.cards.length === 1) {
        return description(
          prose("Duplicate "),
          ...namedCards(model.cards, "or"),
          prose("."),
        );
      }
      return model.cards.length === 2
        ? description(
            prose("Choose "),
            ...namedCards(model.cards, "or"),
            prose(" to duplicate."),
          )
        : description(
            prose(
              `Choose one of ${cardinal(model.cards.length)} cards in your deck to duplicate.`,
            ),
          );
    case "dreamsign-gift":
      // Dreamsign matching rationale and passive rules text intentionally stay
      // off the offer tile; the tile communicates only which sign is gained.
      return description(
        prose("Gain "),
        specificName(model.dreamsign.name),
        prose("."),
      );
    case "dreamsign-draft":
      // The chooser intentionally omits both matching rationale and individual
      // Dreamsign rules; those details belong to the surfaced signs themselves.
      return description(prose("Choose a dreamsign to gain."));
    case "add-site": {
      const siteName = model.site.name.toLocaleLowerCase();
      const article = /^[aeiou]/.test(siteName) ? "an" : "a";
      return description(
        prose(`Add ${article} ${siteName} site to the current dreamscape.`),
      );
    }
  }
}

/** Exact player-facing action copy derived from the offer's structured model. */
export function offerTileDescription(model: OfferTileModel): string {
  return describeOfferTile(model).text;
}

/** InfoCard copy with specific card and dreamsign names underlined. */
export function offerTileRichDescription(model: OfferTileModel): RichText {
  return describeOfferTile(model).rich;
}
