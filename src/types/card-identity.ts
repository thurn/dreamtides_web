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
 * parsers below at the boundaries where they enter (card-data load, network
 * payloads, route params, deck-entry ids, and test-fixture minting).
 */

declare const cardIdBrand: unique symbol;
declare const cardNameBrand: unique symbol;
declare const cardSubtypeBrand: unique symbol;

/** A card's stable UUID. The only safe key for card-identity data structures. */
export type CardId = string & { readonly [cardIdBrand]: "CardId" };

/**
 * A card's human-facing display name. Safe to render, never safe to key on:
 * distinct cards share display names. Resolve a `CardName` from a {@link CardId}
 * only at the final render boundary.
 */
export type CardName = string & { readonly [cardNameBrand]: "CardName" };

/**
 * Canonical source-locale subtype text carried by a card. The subtype catalog
 * is author-extensible: currently known values form a named vocabulary while
 * newly authored values receive the nominal extension at a catalog/editor
 * decoder. Events carry the deliberate empty subtype.
 */
export const KNOWN_CARD_SUBTYPES = [
  "",
  "*",
  "Agent",
  "Ancient",
  "Child",
  "Companions",
  "Detective",
  "Elemental",
  "Ember",
  "Emissary",
  "Entity",
  "Ethereal",
  "Explorer",
  "Guide",
  "Hacker",
  "Legion",
  "Mage",
  "Monster",
  "Monstrosity",
  "Musician",
  "Noble",
  "Outsider",
  "Renegade",
  "Shadow",
  "Spirit Animal",
  "Squad",
  "Super",
  "Survivor",
  "Synth",
  "Thopter",
  "Tinkerer",
  "Universal",
  "Vehicle",
  "Visionary",
  "Visitor",
  "Warrior",
  "Wraith",
  "X",
] as const;

export type KnownCardSubtype = (typeof KNOWN_CARD_SUBTYPES)[number];
type AuthoredCardSubtype = string & {
  readonly [cardSubtypeBrand]: "CardSubtype";
};
export type CardSubtype = KnownCardSubtype | AuthoredCardSubtype;

/** Loose UUID shape check (8-4-4-4-12 hex, case-insensitive). */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a raw string has the shape of a card UUID. */
export function isCardId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function brandCardId(value: string): CardId {
  return value as CardId;
}

/** Decode a JSON/network value as an internal card identity. */
export function cardIdFromUnknown(value: unknown): CardId | null {
  try {
    return parseCardId(value);
  } catch {
    return null;
  }
}

/**
 * Brands a raw string as a {@link CardId} after asserting it is UUID-shaped.
 *
 * Throws on a malformed value rather than letting a fake id propagate.
 */
export function parseCardId(value: unknown): CardId {
  if (typeof value !== "string" || !isCardId(value)) {
    throw new Error(
      `parseCardId: expected a card UUID but got ${JSON.stringify(value)}. ` +
        `Card identity must be a UUID, never a display name.`,
    );
  }
  return brandCardId(value.toLowerCase());
}

/**
 * Parses a non-empty source-locale card name at the catalog boundary.
 * Player-facing consumers localize the catalog value before rendering it.
 */
export function parseCardName(value: unknown): CardName {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Card name must be a non-empty string.");
  }
  return value as CardName;
}

export function parseCardSubtype(value: unknown): CardSubtype {
  if (typeof value !== "string") {
    throw new Error("Card subtype must be source text.");
  }
  return value as CardSubtype;
}

/** Canonical subtype carried by Event cards. */
export const EVENT_CARD_SUBTYPE = parseCardSubtype("");

/** Decode an optional transport/editor value without throwing. */
export function cardSubtypeFromUnknown(value: unknown): CardSubtype | null {
  return typeof value === "string" ? parseCardSubtype(value) : null;
}
