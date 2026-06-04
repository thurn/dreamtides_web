import type { CardData, CardType, Rarity } from "../../types/cards";
import type { CardContent } from "../content/types";

const QUOTED_NAME_RE = /'([^']+)'/gu;

function stringRawField(
  raw: Record<string, unknown>,
  ...keys: readonly string[]
): string | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string") {
      return value;
    }
  }
  return undefined;
}

function numberRawField(
  raw: Record<string, unknown>,
  ...keys: readonly string[]
): number | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function booleanRawField(
  raw: Record<string, unknown>,
  ...keys: readonly string[]
): boolean | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "boolean") {
      return value;
    }
  }
  return undefined;
}

function normalizeCardType(cardType: string): CardType {
  return cardType === "Character" ? "Character" : "Event";
}

function normalizeRarityForDisplay(rawRarity: string | undefined): Rarity | undefined {
  if (
    rawRarity === "Legendary" ||
    rawRarity === "Starter" ||
    rawRarity === "Special"
  ) {
    return rawRarity;
  }
  return undefined;
}

export function cardContentToDisplayData(card: CardContent): CardData {
  const renderedText =
    stringRawField(card.raw, "renderedText", "rendered-text", "rulesText", "text", "description") ??
    "";
  const imageNumber =
    numberRawField(card.raw, "imageNumber", "image-number") ?? card.cardNumber;
  const isStarter =
    booleanRawField(card.raw, "isStarter", "is-starter") ?? card.rarity === "Starter";

  return {
    id: card.id,
    name: card.name,
    cardNumber: card.cardNumber,
    cardType: normalizeCardType(card.cardType),
    subtype: stringRawField(card.raw, "subtype") ?? "",
    isStarter,
    rarity: normalizeRarityForDisplay(stringRawField(card.raw, "rarity")),
    energyCost: card.energyCost === "*" ? null : card.energyCost,
    spark: typeof card.spark === "number" ? card.spark : null,
    sparkVariable: card.spark === "*",
    isFast: booleanRawField(card.raw, "isFast", "is-fast") ?? false,
    renderedText,
    imageNumber,
    artOwned: booleanRawField(card.raw, "artOwned", "art-owned") ?? true,
  };
}

function quotedNames(text: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(QUOTED_NAME_RE)) {
    const name = match[1]?.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }

  return names;
}

export function findReferencedCardPreviews(
  text: string,
  cards: readonly CardContent[],
): CardData[] {
  const cardsByName = new Map(cards.map((card) => [card.name, card]));

  return quotedNames(text).flatMap((name) => {
    const card = cardsByName.get(name);
    return card === undefined ? [] : [cardContentToDisplayData(card)];
  });
}
