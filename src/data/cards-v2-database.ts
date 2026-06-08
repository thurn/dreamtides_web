import type { CardData } from "../types/cards";
import type { GeneratedPool } from "../draft/pool";

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
 * Fetch the bundled real decklists (each seat's mainboard from
 * `docs/draft_records_adapted`, written to `/decklists-data.json` by
 * `scripts/setup-assets.mjs`) used by the `decklists`, `idf`, `idf2`, and `idf3`
 * pool variants. Each inner array is one deck's card names. Returns an empty
 * array if the bundle is missing so the harness still loads (the variant then
 * falls back to the `default` algorithm).
 */
export async function loadDecklists(): Promise<string[][]> {
  const response = await fetch("/decklists-data.json");
  if (!response.ok) return [];
  return (await response.json()) as string[][];
}

/**
 * A single human-seat entry from the adapted Cube Cobra draft corpus, bundled
 * by `scripts/setup-assets.mjs` for the record-replay draft mode. `packs` and
 * `picks` are aligned arrays of length 30 (10 picks per pack × 3 packs); their
 * entries are CURRENT display names, refreshed from each card's stable id at
 * bundle time. `packIds`/`pickIds` carry the matching cards_v2 UUIDs, aligned
 * index-for-index, so a rename-stable consumer (the `pickfit` pool variant) can
 * key on ids instead of names.
 */
export interface DraftRecord {
  id: string;
  draftId: string;
  sourceFile: string;  // adapted-record JSON filename this seat came from
  mainboard: string[];
  packs: string[][];  // 30 trimmed packs of current card names (raw order)
  picks: string[][];  // human picks aligned to packs (each 0..3 names)
  packIds: string[][];  // stable cards_v2 UUIDs aligned to `packs`
  pickIds: string[][];  // stable cards_v2 UUIDs aligned to `picks`
}

/**
 * Fetch the bundled adapted draft records (`docs/draft_records_adapted`,
 * written to `/draft-records-data.json` by `scripts/setup-assets.mjs`) used
 * by the record-replay draft mode. Returns an empty array if the bundle is
 * missing so the harness still loads.
 */
export async function loadDraftRecords(): Promise<DraftRecord[]> {
  const response = await fetch("/draft-records-data.json");
  if (!response.ok) return [];
  return (await response.json()) as DraftRecord[];
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
