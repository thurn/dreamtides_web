import type { CardData } from "../types/cards";
import type { TransfigurationType } from "../types/quest";

/** Color hex value for each transfiguration type. */
export const TRANSFIGURATION_COLORS: Readonly<
  Record<TransfigurationType, string>
> = {
  Viridian: "#10b981",
  Golden: "#f59e0b",
  Scarlet: "#ef4444",
  Azure: "#3b82f6",
  Bronze: "#d97706",
  Magenta: "#d946ef",
  Rose: "#f43f5e",
  Prismatic: "#a855f7",
};

/** A prepared transfiguration offer with pre-computed preview and description. */
export interface TransfigurationOffer {
  type: TransfigurationType;
  description: string;
  previewCard: CardData;
}

/** Returns true if the card is eligible for Viridian transfiguration. */
export function isViridianEligible(card: CardData): boolean {
  return card.energyCost !== null && card.energyCost > 0;
}

/** Returns true if the card's rules text contains at least one digit. */
export function isGoldenEligible(card: CardData): boolean {
  return /\d/.test(card.renderedText);
}

/** Returns true if the card is a Character (eligible for Scarlet). */
export function isScarletEligible(card: CardData): boolean {
  return card.cardType === "Character";
}

/** Returns true if the card is an Event (eligible for Azure). */
export function isAzureEligible(card: CardData): boolean {
  return card.cardType === "Event";
}

/** Returns true if the card is an Event (eligible for Bronze). */
export function isBronzeEligible(card: CardData): boolean {
  return card.cardType === "Event";
}

/**
 * Returns true if the card has a named trigger (materialized, dawn, or
 * once-per-turn) whose frequency Magenta can increase.
 */
export function isMagentaEligible(card: CardData): boolean {
  return /materializ|\bdawn\b|once per turn/i.test(card.renderedText);
}

/**
 * Returns true if the card has an activated ability whose energy cost Rose
 * can reduce.
 */
export function isRoseEligible(card: CardData): boolean {
  return /activated/i.test(card.renderedText);
}

/**
 * Returns true if the card is eligible for two or more of the other
 * transfigurations — the requirement for Prismatic.
 */
export function isPrismaticEligible(card: CardData): boolean {
  return eligibleNonPrismaticTransfigurations(card).length >= 2;
}

/** Eligibility check functions for every non-Prismatic transfiguration. */
const NON_PRISMATIC_CHECKS: ReadonlyArray<
  [Exclude<TransfigurationType, "Prismatic">, (card: CardData) => boolean]
> = [
  ["Viridian", isViridianEligible],
  ["Golden", isGoldenEligible],
  ["Scarlet", isScarletEligible],
  ["Azure", isAzureEligible],
  ["Bronze", isBronzeEligible],
  ["Magenta", isMagentaEligible],
  ["Rose", isRoseEligible],
];

function eligibleNonPrismaticTransfigurations(
  card: CardData,
): Exclude<TransfigurationType, "Prismatic">[] {
  return NON_PRISMATIC_CHECKS.filter(([, check]) => check(card)).map(
    ([type]) => type,
  );
}

/** Returns the list of transfiguration types the card is eligible for. */
export function eligibleTransfigurations(
  card: CardData,
): TransfigurationType[] {
  const types: TransfigurationType[] = eligibleNonPrismaticTransfigurations(
    card,
  );
  if (isPrismaticEligible(card)) {
    types.push("Prismatic");
  }
  return types;
}

/**
 * Applies a transfiguration to a card, returning the modified card. This is
 * deterministic so the same badge produces the same battle card every time.
 * Prismatic applies every other transfiguration the card is eligible for.
 */
export function applyTransfigurationToCard(
  card: CardData,
  type: TransfigurationType,
): CardData {
  switch (type) {
    case "Viridian": {
      if (card.energyCost === null) {
        return card;
      }
      return { ...card, energyCost: Math.round(card.energyCost / 2) };
    }
    case "Scarlet": {
      const oldSpark = card.spark ?? 0;
      return { ...card, spark: oldSpark === 0 ? 1 : oldSpark * 2 };
    }
    case "Azure":
      return { ...card, renderedText: appendClause(card.renderedText, "Draw a card.") };
    case "Bronze":
      return { ...card, renderedText: appendClause(card.renderedText, "Reclaim.") };
    case "Golden": {
      const match = /\d+/.exec(card.renderedText);
      if (match === null) {
        return card;
      }
      const newNum = parseInt(match[0], 10) + 1;
      return {
        ...card,
        renderedText: card.renderedText.replace(match[0], String(newNum)),
      };
    }
    case "Magenta": {
      if (/once per turn/i.test(card.renderedText)) {
        return {
          ...card,
          renderedText: card.renderedText.replace(
            /once per turn/gi,
            "any number of times per turn",
          ),
        };
      }
      return {
        ...card,
        renderedText: appendClause(
          card.renderedText,
          "Its named trigger fires more often.",
        ),
      };
    }
    case "Rose":
      return {
        ...card,
        renderedText: appendClause(
          card.renderedText,
          "Its activated ability costs 1 less.",
        ),
      };
    case "Prismatic": {
      let result = card;
      for (const transfigurationType of eligibleNonPrismaticTransfigurations(
        card,
      )) {
        result = applyTransfigurationToCard(result, transfigurationType);
      }
      return result;
    }
  }
}

function appendClause(text: string, clause: string): string {
  return text + (text.length > 0 ? " " : "") + clause;
}

/** Builds the preview card and description for a given transfiguration type. */
function buildOffer(
  card: CardData,
  type: TransfigurationType,
): TransfigurationOffer {
  const previewCard = applyTransfigurationToCard(card, type);
  switch (type) {
    case "Viridian":
      return {
        type,
        description: `Energy cost: ${String(card.energyCost ?? 0)} → ${String(previewCard.energyCost ?? 0)}`,
        previewCard,
      };
    case "Scarlet":
      return {
        type,
        description: `Spark: ${String(card.spark ?? 0)} → ${String(previewCard.spark ?? 0)}`,
        previewCard,
      };
    case "Azure":
      return { type, description: "Adds: Draw a card.", previewCard };
    case "Bronze":
      return { type, description: "Adds: Reclaim.", previewCard };
    case "Golden": {
      const match = /\d+/.exec(card.renderedText);
      if (match === null) {
        return {
          type,
          description: "Modifies a number in rules text.",
          previewCard,
        };
      }
      const num = parseInt(match[0], 10);
      return {
        type,
        description: `Number in text: ${String(num)} → ${String(num + 1)}`,
        previewCard,
      };
    }
    case "Magenta":
      return {
        type,
        description: "Its named triggers fire more often.",
        previewCard,
      };
    case "Rose":
      return {
        type,
        description: "Activated ability costs 1 less.",
        previewCard,
      };
    case "Prismatic":
      return {
        type,
        description: "Applies every available transfiguration.",
        previewCard,
      };
  }
}

/**
 * Assigns a random eligible transfiguration to a card and returns
 * the complete offer with pre-computed preview and description.
 * Returns null if the card already has a transfiguration or no types
 * are eligible.
 */
export function assignTransfiguration(
  card: CardData,
  existingTransfiguration: TransfigurationType | null,
): TransfigurationOffer | null {
  if (existingTransfiguration !== null) {
    return null;
  }
  const eligible = eligibleTransfigurations(card);
  if (eligible.length === 0) {
    return null;
  }
  const chosen = eligible[Math.floor(Math.random() * eligible.length)];
  return buildOffer(card, chosen);
}

/** Returns a human-readable description of what a transfiguration does to a card. */
export function describeTransfiguration(
  card: CardData,
  type: TransfigurationType,
): string {
  return buildOffer(card, type).description;
}

/** Returns a record of the specific fields modified by a transfiguration offer. */
export function transfigurationEffectDetails(
  offer: TransfigurationOffer,
  originalCard: CardData,
): Record<string, unknown> {
  const details: Record<string, unknown> = {};
  if (offer.previewCard.energyCost !== originalCard.energyCost) {
    details.energyCost = {
      from: originalCard.energyCost,
      to: offer.previewCard.energyCost,
    };
  }
  if (offer.previewCard.spark !== originalCard.spark) {
    details.spark = {
      from: originalCard.spark,
      to: offer.previewCard.spark,
    };
  }
  if (offer.previewCard.renderedText !== originalCard.renderedText) {
    details.renderedText = {
      from: originalCard.renderedText,
      to: offer.previewCard.renderedText,
    };
  }
  return details;
}
