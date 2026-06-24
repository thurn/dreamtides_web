/**
 * Branded string types for card identity.
 *
 * In Dreamtides a card's stable identity is its UUID, never its display name:
 * dozens of distinct cards (different UUIDs, different rules) share a display
 * name, so any map, set, dedup key, or lookup keyed on a name silently merges
 * those cards. The two strings are nonetheless structurally identical (`string`
 * and `string`), so the compiler cannot tell them apart and the entire class of
 * "keyed on name" / "passed a name where a UUID belongs" bugs type-checks
 * cleanly.
 *
 * These branded aliases give the two strings distinct nominal types. A
 * `Map<CardName, …>` now stands out in the type itself, `card.name === someId`
 * stops compiling, and a function that wants a `CardId` rejects a `CardName`
 * argument. The brands cost nothing at runtime — both values are still plain
 * strings; the only friction is that raw strings must be funnelled through the
 * helpers below at the boundaries where they enter (card-data load, network
 * payloads, route params, deck-entry ids, test fixtures). That friction is the
 * feature: every cast is a place that asserts "this string is a card id", and
 * the casts are greppable for audit.
 */

declare const cardIdBrand: unique symbol;
declare const cardNameBrand: unique symbol;

/** A card's stable UUID. The only safe key for card-identity data structures. */
export type CardId = string & { readonly [cardIdBrand]: "CardId" };

/**
 * A card's human-facing display name. Safe to render, never safe to key on:
 * distinct cards share display names. Resolve a `CardName` from a {@link CardId}
 * only at the final render boundary.
 */
export type CardName = string & { readonly [cardNameBrand]: "CardName" };

/** Loose UUID shape check (8-4-4-4-12 hex, case-insensitive). */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a raw string has the shape of a card UUID. */
export function isCardId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * Brands a raw string as a {@link CardId}.
 *
 * This is the ergonomic, no-runtime-cost helper for the common case: a string
 * already known to be a card id (a deck-entry `cardId`, a value read back from a
 * card record, a synthetic id in a test fixture). It performs no validation, so
 * it is safe on hot paths and on the synthetic non-UUID ids tests use.
 *
 * At a genuine *external* trust boundary — a payload off the network, a route
 * param, raw user input — prefer {@link parseCardId}, which rejects a value that
 * is not UUID-shaped (and so catches a display name passed where an id belongs).
 */
export function asCardId(value: string): CardId {
  return value as CardId;
}

/**
 * Brands a raw string as a {@link CardId} after asserting it is UUID-shaped.
 *
 * Use at genuine external trust boundaries where a non-UUID would indicate a
 * real bug (a name leaked into an id channel). Throws on a malformed value
 * rather than letting a fake id propagate. Do not use on internal lookup paths
 * that tests exercise with synthetic ids — use {@link asCardId} there.
 */
export function parseCardId(value: string): CardId {
  if (!isCardId(value)) {
    throw new Error(
      `parseCardId: expected a card UUID but got ${JSON.stringify(value)}. ` +
        `Card identity must be a UUID, never a display name.`,
    );
  }
  return value as CardId;
}

/**
 * Brands a raw string as a {@link CardName}. Use at the boundary where display
 * names enter the system (card-data load, content adapter, test fixtures).
 * Performs no validation; any string is a valid display name.
 */
export function asCardName(value: string): CardName {
  return value as CardName;
}
