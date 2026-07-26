// Shared helpers for resolving card references by their stable cards_v2 UUID.
//
// Every system that names cards in data — the signature lists in
// `dream_avatars_v2.toml`, the pool metadata in `cards-v2-metadata.ts`, the
// build-around metadata in `buildaround_support.json`, and the adapted draft
// records under `docs/draft_records_adapted` — keys cards by their `id` UUID
// from `data/tabula/cards_v2.toml`. The UUID is stable across display renames,
// so renaming a card in `cards_v2.toml` keeps every one of those files in sync.
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
 * Read `cards_v2.toml` and return the `idToName` lookup map: a card's stable
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

// Per-`meta` cache of the build-around support entries indexed by current card
// name. `buildaround_support.json` is keyed by card-id UUID with a `name` field;
// the experiment harness works in card-name space, so it looks entries up by
// name through this index.
const supportByNameCache = new WeakMap();

/**
 * Look up a `buildaround_support.json` card entry by current card name. The
 * name index is built once per `meta` object and cached.
 */
export function supportEntryByName(meta, name) {
  let byName = supportByNameCache.get(meta);
  if (byName === undefined) {
    byName = new Map();
    // Index by the entry's current card name. Fall back to the object key when an
    // entry carries no `name` field (e.g. synthetic fixtures keyed by name).
    for (const [key, entry] of Object.entries(meta.cards ?? {})) {
      byName.set(typeof entry.name === "string" ? entry.name : key, entry);
    }
    supportByNameCache.set(meta, byName);
  }
  return byName.get(name);
}

/**
 * Look up a `buildaround_support.json` card entry directly by its cards_v2
 * UUID (case-insensitive). `buildaround_support.json` is natively keyed by
 * lowercase UUID, so this is an O(1) lookup that avoids the name-index
 * altogether — and is safe when two distinct cards share a display name.
 *
 * Returns `undefined` when the UUID is not in the support metadata (neutral
 * cards are simply absent from the file).
 */
export function supportEntryById(meta, id) {
  return (meta.cards ?? {})[id.toLowerCase()];
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
 * per seat that has a non-empty mainboard: the seat's `mainboard` resolved to
 * current card names, in order. Card tokens are stable cards_v2 UUIDs; a token
 * that is not a UUID for a known card is dropped from that decklist. Seats with
 * an empty (or fully unresolved) mainboard are skipped, as are files without a
 * `seats` array.
 */
export function readAdaptedRecordDecklists(dir, { idToName }) {
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
      const names = [];
      for (const token of seat.mainboard) {
        if (CARD_ID_RE.test(token) && idToName.has(token)) {
          names.push(idToName.get(token));
        }
      }
      if (names.length > 0) decks.push(names);
    }
  }
  return decks;
}

/**
 * Read every adapted draft record (`*.jsonc`) in `dir` and return one decklist
 * per seat that has a non-empty mainboard, exactly like
 * {@link readAdaptedRecordDecklists}, but keyed on each card's stable cards_v2
 * UUID (lowercased) rather than its current display name. This is the
 * rename-proof, collision-proof corpus the IDF-cosine pool engine and its
 * affiliations score on: two distinct cards that happen to share a display name
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
