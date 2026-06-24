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
    isInterrupt:
      booleanRawField(card.raw, "isInterrupt", "is-interrupt") ?? false,
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

/**
 * Returns `CardData` previews for every card whose display name appears
 * (single-quoted) in `text`, in first-mention order.
 *
 * Multiple distinct cards can share the same display name (different UUIDs,
 * different rules). To avoid silently surfacing the wrong card, this function
 * returns ALL cards that match each scraped name, so the hover preview shows
 * every candidate rather than arbitrarily collapsing to one.
 *
 * --- Why name-scraping is still used here ---
 * The journey text is a rendered flat string (`JourneyOption.text` /
 * `JourneyTreeBranch.text`). Structured per-option card-UUID references are not
 * threaded from the cost/reward template `render()` functions into the manifest
 * today; doing so would require adding `referencedCardIds` to both manifest
 * types and plumbing it through every shape fill. Until that migration happens,
 * this name-based lookup is the only available mechanism. The residual risk
 * (multiple candidates shown for a shared name) is preferable to the prior
 * silent last-writer-wins collapse.
 */
export function findReferencedCardPreviews(
  text: string,
  cards: readonly CardContent[],
): CardData[] {
  // Group all cards by display name. Cards with the same name get different
  // UUID-keyed entries; we emit all of them when the name appears in the text.
  const cardsByName = new Map<string, CardContent[]>();
  for (const card of cards) {
    const group = cardsByName.get(card.name);
    if (group === undefined) {
      cardsByName.set(card.name, [card]);
    } else {
      group.push(card);
    }
  }

  return quotedNames(text).flatMap((name) => {
    const group = cardsByName.get(name);
    return group === undefined ? [] : group.map(cardContentToDisplayData);
  });
}
