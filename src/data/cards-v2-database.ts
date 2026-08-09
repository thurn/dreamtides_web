import type { CardId } from "../types/card-identity";
import type { CardData } from "../types/cards";
import type { GeneratedPool, Tides4DecksJson } from "../draft/pool";
import { validateTides4Decks } from "../draft/pool";

/**
 * Fetches the experimental v2 card pool (generated from `cards.toml` by
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
 * Fetch the id-keyed real decklists. Each inner array contains stable cards_v2
 * UUIDs, lowercased, written to `/decklist-ids-data.json` by
 * `scripts/setup-assets.mjs`. Affiliation reweighting scores on this corpus so two distinct
 * cards that share a display name stay distinct.
 */
export async function loadDecklistIds(): Promise<string[][]> {
  const response = await fetch("/decklist-ids-data.json");
  if (!response.ok) {
    throw new Error(
      `Failed to load decklist ids: ${String(response.status)} ${response.statusText}`,
    );
  }
  return (await response.json()) as string[][];
}

/**
 * A single human-seat entry from the adapted Cube Cobra draft corpus, bundled
 * by `scripts/setup-assets.mjs` for corpus-based scoring. `packs` and
 * `picks` are aligned arrays of length 30 (10 picks per pack × 3 packs); their
 * entries are CURRENT display names, refreshed from each card's stable id at
 * bundle time. `packIds`/`pickIds` carry the matching cards_v2 UUIDs, aligned
 * index-for-index.
 */
export interface DraftRecord {
  id: string;
  draftId: string;
  sourceFile: string; // adapted-record JSON filename this seat came from
  mainboard: string[];
  mainboardIds: string[]; // stable cards_v2 UUIDs aligned to `mainboard`
  packs: string[][]; // 30 trimmed packs of current card names (raw order)
  picks: string[][]; // human picks aligned to packs (each 0..3 names)
  packIds: string[][]; // stable cards_v2 UUIDs aligned to `packs`
  pickIds: string[][]; // stable cards_v2 UUIDs aligned to `picks`
}

/**
 * Fetch the bundled adapted draft records (`docs/draft_records_adapted`,
 * written to `/draft-records-data.json` by `scripts/setup-assets.mjs`) used
 * by opponent deck construction and shared corpus scoring.
 */
export async function loadDraftRecords(): Promise<DraftRecord[]> {
  const response = await fetch("/draft-records-data.json");
  if (!response.ok) {
    throw new Error(
      `Failed to load draft records: ${String(response.status)} ${response.statusText}`,
    );
  }
  return (await response.json()) as DraftRecord[];
}

/**
 * A curated human-seat entry from the known-good decklists corpus, bundled by
 * `scripts/setup-assets.mjs` for the corpus opponent-deck algorithm. Each entry
 * represents a high-quality example deck drawn from the adapted Cube Cobra draft
 * corpus and curated in `docs/known_good_decklists.json`. Only `mainboardIds` is
 * used for algorithmic work — `name` is display-only metadata.
 */
export interface KnownGoodDecklist {
  id: string; // `${draftId}#${seat}`
  draftId: string;
  seat: number;
  name: string; // display-only
  mainboardIds: string[]; // stable cards_v2 UUIDs (lowercased)
}

/**
 * Fetch the bundled known-good decklists corpus (`docs/known_good_decklists.json`
 * projected through the adapted draft records, written to
 * `/known-good-decklists-data.json` by `scripts/setup-assets.mjs`) used by the
 * corpus opponent-deck algorithm.
 */
export async function loadKnownGoodDecklists(): Promise<KnownGoodDecklist[]> {
  const response = await fetch("/known-good-decklists-data.json");
  if (!response.ok) {
    throw new Error(
      `Failed to load known-good decklists: ${String(response.status)} ${response.statusText}`,
    );
  }
  return (await response.json()) as KnownGoodDecklist[];
}

/**
 * Fetch the browser projection compiled from `data/tides.ron` and
 * `data/dream_avatar_tide_pools.ron` to
 * `/tides4-data.json` by `scripts/setup-assets.mjs`. The `tides4` pool variant
 * combines into pools — the signature, facet, and neutral tide decks and the
 * per-DreamAvatar tide pools in one file. Returns `null` if the asset is missing
 * so the caller can surface a clear configuration error when the variant runs.
 */
export async function loadTides4Decks(): Promise<Tides4DecksJson | null> {
  const response = await fetch("/tides4-data.json");
  if (!response.ok) return null;
  return validateTides4Decks(await response.json());
}

/**
 * Build a card-UUID -> card-number index from a v2 database, keyed on the
 * lowercased stable card id. Card ids are unique (one per card), so there is no
 * collision to resolve: two cards that share a display name keep distinct id
 * keys here. This is the rename-stable index the corpus fit model and
 * draft-record helpers translate card numbers against, so a same-name collision
 * never blends two distinct cards.
 */
export function buildIdIndex(
  database: Map<number, CardData>,
): Map<string, number> {
  const index = new Map<string, number>();
  for (const card of database.values()) {
    index.set(card.id.toLowerCase(), card.cardNumber);
  }
  return index;
}

/** A generated pool resolved against the v2 card database. */
export interface ResolvedPool {
  /** Fixed draft multiset keyed by card number (as string), values 1 or 2. */
  draftPoolCopiesByCard: Record<string, number>;
  /**
   * Pool card ids ({@link CardId}) that had no matching card in the v2 database
   * (a card no longer in the catalog). Surfaced so the caller can log them as a
   * resolution anomaly.
   */
  unresolvedIds: CardId[];
  /**
   * Card numbers two distinct pool ids both resolved to. The id index is
   * collision-free (one card number per id), so this is always empty in
   * practice; it is surfaced so the caller can log an anomaly if a stale or
   * duplicate id ever maps two pool entries onto one card.
   */
  collidedCardNumbers: number[];
  /** Card numbers whose generated count exceeded their resolved copy cap. */
  cappedCardNumbers: number[];
}

/**
 * Map a generated pool's {@link CardId} keys onto v2 card numbers, producing the
 * `draftPoolCopiesByCard` multiset the draft engine consumes. Resolution goes
 * through the stable-UUID `idIndex` only — the single collision-free identity
 * index — so two distinct cards that share a display name can never merge into
 * one pool entry. A pool key absent from `idIndex` (a card dropped from the
 * catalog) is collected in `unresolvedIds` and left out of the pool.
 *
 * Cards use `defaultCopyCap` unless `copyCapsByCardNumber` supplies a stricter
 * rarity-authored override.
 */
export function resolvePool(
  pool: GeneratedPool,
  idIndex: ReadonlyMap<string, number>,
  defaultCopyCap: number = 2,
  copyCapsByCardNumber: ReadonlyMap<number, number> = new Map<number, number>(),
): ResolvedPool {
  const draftPoolCopiesByCard: Record<string, number> = {};
  const unresolvedIds: CardId[] = [];
  const collidedCardNumbers: number[] = [];
  const cappedCardNumbers: number[] = [];

  for (const [key, copies] of pool.counts) {
    const cardNumber = idIndex.get(key);
    if (cardNumber === undefined) {
      unresolvedIds.push(key);
      continue;
    }
    const cap = copyCapsByCardNumber.get(cardNumber) ?? defaultCopyCap;
    if (copies > cap) {
      cappedCardNumbers.push(cardNumber);
    }
    // The id index maps one card number per id, so two distinct pool ids cannot
    // resolve to the same card number under normal data. Record it if it ever
    // does (a stale or duplicate id) so the caller can log the anomaly, then sum
    // and cap rather than silently overwrite.
    const existing = draftPoolCopiesByCard[String(cardNumber)] ?? 0;
    if (existing > 0) collidedCardNumbers.push(cardNumber);
    draftPoolCopiesByCard[String(cardNumber)] = Math.min(
      cap,
      existing + copies,
    );
  }

  return {
    draftPoolCopiesByCard,
    unresolvedIds,
    collidedCardNumbers,
    cappedCardNumbers,
  };
}
