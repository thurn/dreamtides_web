// Shared helpers for resolving card references by their stable cards_v2 UUID.
//
// Every maintained system that names cards in data — including the signature
// lists in `dream_avatars.toml` and adapted draft records under
// `docs/draft_records_adapted` — keys cards by their `id` UUID
// from `data/tabula/cards.toml`. The UUID is stable across display renames,
// so renaming a card in `cards.toml` keeps every one of those files in sync.
//
// The adapted draft records (`docs/draft_records_adapted/*.jsonc`) store one
// card per array entry as a `<uuid>` string with an inline `// <Card Name>`
// comment; code reads the UUID and ignores the comment, while the comment keeps
// the file human-readable.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
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
 * Strip an optional trailing `# comment` and surrounding whitespace from a
 * corpus line. Returns the leading token (a cards_v2 UUID), or "" for a
 * blank/comment-only line.
 */
export function corpusLineToken(line) {
  const hash = line.indexOf("#");
  const head = (hash === -1 ? line : line.slice(0, hash)).trim();
  return head;
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

/**
 * Strip `//` line comments from JSONC text, leaving anything inside string
 * literals untouched (escape sequences honoured). The adapted draft records use
 * `//` only for trailing card-name annotations, so this is sufficient — there
 * are no block comments. Newlines are preserved so error offsets stay aligned.
 */
export function stripJsonComments(text) {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i += 1;
      out += "\n";
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * Read every adapted draft record (`*.jsonc`) in `dir` and return one decklist
 * per seat that has a non-empty mainboard, keyed on each card's stable cards_v2
 * UUID (lowercased). This is the collision-proof corpus affiliation scoring
 * consumes: two distinct cards that happen to share a display name
 * stay distinct here because they carry different UUIDs. The same seat-filtering
 * and resolution rules apply — a token that resolves to no known card is
 * dropped, and a seat with an empty (or fully unresolved) mainboard is skipped.
 */
export function readAdaptedRecordDecklistIds(dir, { idToName }) {
  const decks = [];
  for (const filename of readdirSync(dir)
    .filter((f) => f.endsWith(".jsonc"))
    .sort()) {
    const raw = JSON.parse(
      stripJsonComments(readFileSync(join(dir, filename), "utf8")),
    );
    if (!Array.isArray(raw.seats)) continue;
    for (const seat of raw.seats) {
      if (!Array.isArray(seat.mainboard)) continue;
      const ids = [];
      for (const token of seat.mainboard) {
        if (CARD_ID_RE.test(token) && idToName.has(token)) {
          ids.push(token.toLowerCase());
        }
      }
      if (ids.length > 0) decks.push(ids);
    }
  }
  return decks;
}
