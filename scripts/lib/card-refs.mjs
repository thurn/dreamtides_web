// Shared helpers for resolving card references by their stable cards_v2 UUID.
//
// Every maintained system that names cards in data keys cards by their stable
// UUID from `data/cards.toml`.

import { readFileSync } from "node:fs";
import { parse } from "smol-toml";

/** Matches a canonical UUID (case-insensitive). */
export const CARD_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * Read `cards.toml` and return the `idToName` lookup map: a card's stable
 * UUID resolved to its current display name. Every card-reference system keys on
 * the UUID, so this map is the source of truth for resolving a reference to the
 * name shown in the UI.
 */
export function loadCardMaps(cardsV2TomlPath) {
  const parsed = parse(readFileSync(cardsV2TomlPath, "utf8"));
  const cards = parsed.cards;
  if (!Array.isArray(cards)) {
    throw new Error(`Expected [[cards]] array in ${cardsV2TomlPath}`);
  }
  const idToName = new Map();
  for (const card of cards) {
    if (typeof card.id !== "string") {
      throw new Error(`cards_v2 card "${String(card.name)}" is missing an id`);
    }
    idToName.set(card.id, card.name);
  }
  return { idToName };
}

/**
 * Build the `idToName` lookup map from already-loaded card records (each with an
 * `id` and `name`), e.g. the parsed `cards_v2-data.json` bundle. Avoids
 * re-reading the TOML when the caller already has the records.
 */
export function mapsFromCards(cards) {
  const idToName = new Map();
  for (const card of cards) {
    idToName.set(card.id, card.name);
  }
  return { idToName };
}

/**
 * Resolve a single corpus token to `{ id, name }`. The token must be a cards_v2
 * UUID; a bare card name or any other non-UUID token throws, so an ambiguous or
 * dangling reference fails loudly rather than silently resolving to one of the
 * cards that share a display name.
 */
export function resolveToken(token, { idToName }) {
  if (!CARD_ID_RE.test(token)) {
    throw new Error(
      `Card reference must be a cards_v2 UUID, got: ${JSON.stringify(token)}`,
    );
  }
  const name = idToName.get(token);
  if (name === undefined) {
    throw new Error(`Unknown card UUID: ${token}`);
  }
  return { id: token, name };
}
