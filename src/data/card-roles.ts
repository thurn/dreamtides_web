import cardRoleJson from "../generated/config/card-role-data.json";
import { parseCardId, type CardId } from "../types/card-identity";
import type { CardData } from "../types/cards";
import {
  parseContentHash,
  parseFoldHash,
  type ContentHash,
  type FoldHash,
} from "../types/content-hash";

const SHA256 = /^[0-9a-f]{64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

export interface CardRoleData {
  schemaVersion: 1;
  contentHash: ContentHash;
  foldHash: FoldHash;
  starterDeckCardIds: readonly CardId[];
  nightmare: Readonly<{
    cardId: CardId;
    historicalCardNumber: number;
    displayName: string;
  }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseCardRoleData(value: unknown): CardRoleData {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    typeof value.contentHash !== "string" ||
    !SHA256.test(value.contentHash) ||
    value.foldHash !== value.contentHash ||
    !Array.isArray(value.starterDeckCardIds) ||
    value.starterDeckCardIds.length === 0 ||
    value.starterDeckCardIds.some(
      (cardId) => typeof cardId !== "string" || !UUID.test(cardId),
    ) ||
    new Set(value.starterDeckCardIds).size !==
      value.starterDeckCardIds.length ||
    !isRecord(value.nightmare) ||
    typeof value.nightmare.cardId !== "string" ||
    !UUID.test(value.nightmare.cardId) ||
    typeof value.nightmare.historicalCardNumber !== "number" ||
    !Number.isInteger(value.nightmare.historicalCardNumber) ||
    typeof value.nightmare.displayName !== "string" ||
    value.nightmare.displayName.trim() === ""
  ) {
    throw new Error("Failed to load RON-derived card role data");
  }
  return {
    schemaVersion: 1,
    contentHash: parseContentHash(value.contentHash),
    foldHash: parseFoldHash(value.contentHash),
    starterDeckCardIds: value.starterDeckCardIds.map((cardId) =>
      parseCardId(cardId as string),
    ),
    nightmare: {
      cardId: parseCardId(value.nightmare.cardId),
      historicalCardNumber: value.nightmare.historicalCardNumber,
      displayName: value.nightmare.displayName,
    },
  };
}

export const CARD_ROLE_DATA = parseCardRoleData(cardRoleJson);
export const STARTER_CARD_IDS = CARD_ROLE_DATA.starterDeckCardIds;

/** Resolve the RON-authored starter-deck UUID order against a loaded catalog. */
export function resolveStarterCardNumbers(
  idIndex: ReadonlyMap<CardId, number>,
  starterCardIds: readonly CardId[] = STARTER_CARD_IDS,
): number[] {
  return starterCardIds.map((cardId) => {
    const cardNumber = idIndex.get(cardId);
    if (cardNumber === undefined) {
      throw new Error(`Starter deck references missing card UUID ${cardId}`);
    }
    return cardNumber;
  });
}

/** Derive the starter deck from explicit roles on the loaded RON card catalog. */
export function resolveCatalogStarterCardNumbers(
  cards: Iterable<CardData>,
): number[] {
  const catalog = [...cards];
  const starterCardIds = catalog
    .filter((card) => card.roles?.includes("starter-deck") === true)
    .map((card) => card.id);
  if (starterCardIds.length === 0) {
    throw new Error("Loaded card catalog has no starter-deck roles");
  }
  return resolveStarterCardNumbers(
    new Map(catalog.map((card) => [card.id, card.cardNumber])),
    starterCardIds,
  );
}
