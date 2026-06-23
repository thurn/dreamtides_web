import type { CardData } from "../types/cards";
import type {
  AffinityCorpus,
  GeneratedPool,
  TideDecksJson,
  TideRelationshipsJson,
  Tides3DecksJson,
  Tides4DecksJson,
  Tides5DecksJson,
} from "../draft/pool";
import {
  deserializeCorpus,
  validateTideDecks,
  validateTideRelationships,
  validateTides3Decks,
  validateTides4Decks,
  validateTides5Decks,
} from "../draft/pool";
import type { AffinityCorpusJson } from "../draft/pool";

/**
 * Fetches the experimental v2 card pool (generated from `cards_v2.toml` by
 * `scripts/setup-assets.mjs`) and returns a Map keyed by card number. Served
 * from the public directory at `/cards_v2-data.json`, which carries the
 * draft-pool metadata merged in alongside the base card fields.
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
  mainboardIds: string[];  // stable cards_v2 UUIDs aligned to `mainboard`
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
 * Fetch the committed affinity corpus (`data/affinity_corpus.jsonc`, copied to
 * `/affinity-corpus-data.json` by `scripts/setup-assets.mjs`) and reconstruct the
 * {@link AffinityCorpus} the `embedded` pool variant grows from. Returns `null`
 * if the asset is missing so the caller can surface a clear configuration error
 * when the variant runs.
 */
export async function loadAffinityCorpus(): Promise<AffinityCorpus | null> {
  const response = await fetch("/affinity-corpus-data.json");
  if (!response.ok) return null;
  const json = (await response.json()) as AffinityCorpusJson;
  return deserializeCorpus(json);
}

/**
 * Fetch the committed tide decks (`data/tides.jsonc`, copied to
 * `/tides-data.json` by `scripts/setup-assets.mjs`) the `tides` pool variant
 * combines into pools. Returns `null` if the asset is missing so the caller
 * can surface a clear configuration error when the variant runs.
 */
export async function loadTideDecks(): Promise<TideDecksJson | null> {
  const response = await fetch("/tides-data.json");
  if (!response.ok) return null;
  return validateTideDecks(await response.json());
}

/**
 * Fetch the committed `tides2` tide decks (`data/tides2.jsonc`, copied to
 * `/tides2-data.json` by `scripts/setup-assets.mjs`) the `tides2` pool variant
 * combines into pools. Returns `null` if the asset is missing so the caller can
 * surface a clear configuration error when the variant runs.
 */
export async function loadTides2Decks(): Promise<TideDecksJson | null> {
  const response = await fetch("/tides2-data.json");
  if (!response.ok) return null;
  return validateTideDecks(await response.json());
}

/**
 * Fetch the committed `tides3` artifact (`data/tides3.jsonc`, copied to
 * `/tides3-data.json` by `scripts/setup-assets.mjs`) the `tides3` pool variant
 * combines into pools — the 32 tide decks and the per-Dreamcaller tide pools in
 * one file. Returns `null` if the asset is missing so the caller can surface a
 * clear configuration error when the variant runs.
 */
export async function loadTides3Decks(): Promise<Tides3DecksJson | null> {
  const response = await fetch("/tides3-data.json");
  if (!response.ok) return null;
  return validateTides3Decks(await response.json());
}

/**
 * Fetch the committed `tides4` artifact (`data/tides4.jsonc`, copied to
 * `/tides4-data.json` by `scripts/setup-assets.mjs`) the `tides4` pool variant
 * combines into pools — the signature, facet, and neutral tide decks and the
 * per-Dreamcaller tide pools in one file. Returns `null` if the asset is missing
 * so the caller can surface a clear configuration error when the variant runs.
 */
export async function loadTides4Decks(): Promise<Tides4DecksJson | null> {
  const response = await fetch("/tides4-data.json");
  if (!response.ok) return null;
  return validateTides4Decks(await response.json());
}

/**
 * Fetch the committed `tides5` artifact (`data/tides5.jsonc`, copied to
 * `/tides5-data.json` by `scripts/setup-assets.mjs`) the `tides5` pool variant
 * combines into pools — the signature, facet, and neutral tide decks and the
 * per-Dreamcaller tide pools in one file, baked only from the known-good
 * decklists. Returns `null` if the asset is missing so the caller can surface a
 * clear configuration error when the variant runs.
 */
export async function loadTides5Decks(): Promise<Tides5DecksJson | null> {
  const response = await fetch("/tides5-data.json");
  if (!response.ok) return null;
  return validateTides5Decks(await response.json());
}

/**
 * Fetch the committed `tides2` relationships (`data/tides2_relationships.jsonc`,
 * copied to `/tides2-relationships-data.json` by `scripts/setup-assets.mjs`) the
 * `tides2` pool variant steers selection by, validated against the tide ids in
 * `tideDecks`. Returns `null` if the asset is missing so the caller can surface
 * a clear configuration error when the variant runs. A dangling tide id (e.g. a
 * relationships file stale against a re-baked `tides2.jsonc`) throws.
 */
export async function loadTides2Relationships(
  tideDecks: TideDecksJson,
): Promise<TideRelationshipsJson | null> {
  const response = await fetch("/tides2-relationships-data.json");
  if (!response.ok) return null;
  const tideIds = new Set(tideDecks.tides.map((t) => t.id));
  return validateTideRelationships(await response.json(), tideIds);
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

/**
 * Build the set of card numbers whose rarity is `Legendary`. Used by
 * {@link resolvePool} to cap legendary cards at a single copy per pool while
 * ordinary cards keep the standard two-copy allowance.
 */
export function buildLegendaryCardNumbers(
  database: Map<number, CardData>,
): Set<number> {
  const legendary = new Set<number>();
  for (const card of database.values()) {
    if (card.rarity === "Legendary") {
      legendary.add(card.cardNumber);
    }
  }
  return legendary;
}

/** A generated pool resolved against the v2 card database. */
export interface ResolvedPool {
  /** Fixed draft multiset keyed by card number (as string), values 1 or 2. */
  draftPoolCopiesByCard: Record<string, number>;
  /** Pool names that had no matching card in the v2 database. */
  unresolvedNames: string[];
  /**
   * Card numbers whose copy count was reduced to one because the card is
   * `Legendary` and the generated pool asked for more than one copy. Surfaced
   * so callers can log which legendaries hit the single-copy cap.
   */
  cappedLegendaryCardNumbers: number[];
}

/**
 * Map a generated pool's card *names* onto v2 card numbers, producing the
 * `draftPoolCopiesByCard` multiset the draft engine consumes. Names absent
 * from the database are collected in `unresolvedNames` and dropped from the
 * pool.
 *
 * Ordinary cards are capped at two copies. Legendary cards (those whose card
 * number appears in `legendaryCardNumbers`) are capped at one copy, so a pool
 * never contains a duplicate legendary.
 */
export function resolvePool(
  pool: GeneratedPool,
  nameIndex: Map<string, number>,
  legendaryCardNumbers: ReadonlySet<number> = new Set<number>(),
): ResolvedPool {
  const draftPoolCopiesByCard: Record<string, number> = {};
  const unresolvedNames: string[] = [];
  const cappedLegendaryCardNumbers: number[] = [];

  for (const [name, copies] of pool.counts) {
    const cardNumber = nameIndex.get(name);
    if (cardNumber === undefined) {
      unresolvedNames.push(name);
      continue;
    }
    const isLegendary = legendaryCardNumbers.has(cardNumber);
    const cap = isLegendary ? 1 : 2;
    if (isLegendary && copies > 1) {
      cappedLegendaryCardNumbers.push(cardNumber);
    }
    draftPoolCopiesByCard[String(cardNumber)] = Math.min(cap, copies);
  }

  return {
    draftPoolCopiesByCard,
    unresolvedNames,
    cappedLegendaryCardNumbers,
  };
}
