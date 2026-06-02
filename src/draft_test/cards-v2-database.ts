import type { CardData } from "../types/cards";
import type { GeneratedPool } from "./color-pool";

/**
 * Fetches the experimental v2 card pool (generated from `cards_v2.toml` by
 * `scripts/setup-assets.mjs`) and returns a Map keyed by card number. Served
 * from the public directory at `/cards_v2-data.json`, separate from the
 * runtime `/card-data.json`.
 */
export async function loadCardsV2Database(): Promise<Map<number, CardData>> {
  const response = await fetch("/cards_v2-data.json");
  if (!response.ok) {
    throw new Error(
      `Failed to load cards_v2 data: ${String(response.status)} ${response.statusText}`,
    );
  }
  const cards = (await response.json()) as CardData[];
  const database = new Map<number, CardData>();
  for (const card of cards) {
    database.set(card.cardNumber, card);
  }
  return database;
}

/**
 * Build a card-name -> card-number index from a v2 database. When two records
 * share a name the first wins; the draft pool only needs one representative
 * per name.
 */
export function buildNameIndex(
  database: Map<number, CardData>,
): Map<string, number> {
  const index = new Map<string, number>();
  for (const card of database.values()) {
    if (!index.has(card.name)) {
      index.set(card.name, card.cardNumber);
    }
  }
  return index;
}

/** A generated pool resolved against the v2 card database. */
export interface ResolvedPool {
  /** Fixed draft multiset keyed by card number (as string), values 1 or 2. */
  draftPoolCopiesByCard: Record<string, number>;
  /** Pool names that had no matching card in the v2 database. */
  unresolvedNames: string[];
}

/**
 * Map a generated pool's card *names* onto v2 card numbers, producing the
 * `draftPoolCopiesByCard` multiset the draft engine consumes. Names absent
 * from the database are collected in `unresolvedNames` and dropped from the
 * pool.
 */
export function resolvePool(
  pool: GeneratedPool,
  nameIndex: Map<string, number>,
): ResolvedPool {
  const draftPoolCopiesByCard: Record<string, number> = {};
  const unresolvedNames: string[] = [];

  for (const [name, copies] of pool.counts) {
    const cardNumber = nameIndex.get(name);
    if (cardNumber === undefined) {
      unresolvedNames.push(name);
      continue;
    }
    draftPoolCopiesByCard[String(cardNumber)] = Math.min(2, copies);
  }

  return { draftPoolCopiesByCard, unresolvedNames };
}
