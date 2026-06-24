// Shared helpers for resolving card references by their stable cards_v2 UUID.
//
// Every system that names cards in data — the signature lists in
// `dreamcallers_v2.toml`, the pool metadata in `cards-v2-metadata.ts`, the
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
 * Read `cards_v2.toml` and return id<->name lookup maps. `idToName` is the
 * source of truth for resolving a reference UUID to its current display name;
 * `nameToId` lets the one-time migration (and any tolerant reader) accept a bare
 * card name and canonicalize it to a UUID.
 */
export function loadCardMaps(cardsV2TomlPath) {
  const parsed = parse(readFileSync(cardsV2TomlPath, "utf8"));
  const cards = parsed.cards;
  if (!Array.isArray(cards)) {
    throw new Error(`Expected [[cards]] array in ${cardsV2TomlPath}`);
  }
  const idToName = new Map();
  const nameToId = new Map();
  for (const card of cards) {
    if (typeof card.id !== "string") {
      throw new Error(`cards_v2 card "${String(card.name)}" is missing an id`);
    }
    idToName.set(card.id, card.name);
    // First record wins on a duplicate name. When two distinct UUIDs share a
    // display name, emit a warning so ingestion runs surface the collision: the
    // name-only source data path (cubecobra decklists) cannot disambiguate them
    // without cardNumber-tagged input.
    if (!nameToId.has(card.name)) {
      nameToId.set(card.name, card.id);
    } else if (nameToId.get(card.name) !== card.id) {
      console.warn(
        `[loadCardMaps] display-name collision: "${card.name}" is shared by UUIDs ` +
          `${nameToId.get(card.name)} (kept) and ${card.id} (ignored in nameToId). ` +
          `Name-only source data will resolve to one arbitrary card.`,
      );
    }
  }
  return { idToName, nameToId };
}

/**
 * Build id<->name lookup maps from already-loaded card records (each with an
 * `id` and `name`), e.g. the parsed `cards_v2-data.json` bundle. Avoids
 * re-reading the TOML when the caller already has the records.
 */
export function mapsFromCards(cards) {
  const idToName = new Map();
  const nameToId = new Map();
  for (const card of cards) {
    idToName.set(card.id, card.name);
    // First record wins on a duplicate name. Warn on collision so callers can
    // see which display names are shared by two distinct UUIDs.
    if (!nameToId.has(card.name)) {
      nameToId.set(card.name, card.id);
    } else if (nameToId.get(card.name) !== card.id) {
      console.warn(
        `[mapsFromCards] display-name collision: "${card.name}" is shared by UUIDs ` +
          `${nameToId.get(card.name)} (kept) and ${card.id} (ignored in nameToId). ` +
          `Name-only source data will resolve to one arbitrary card.`,
      );
    }
  }
  return { idToName, nameToId };
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
 * corpus line. Returns the leading token (a UUID, or a bare card name during
 * migration), or "" for a blank/comment-only line.
 */
export function corpusLineToken(line) {
  const hash = line.indexOf("#");
  const head = (hash === -1 ? line : line.slice(0, hash)).trim();
  return head;
}

/**
 * Resolve a single corpus token to `{ id, name }`. Accepts either a card UUID or
 * (for the one-time migration) a bare card name. Throws on a token that resolves
 * to no card, so a dangling reference fails loudly rather than silently dropping.
 */
export function resolveToken(token, { idToName, nameToId }) {
  if (CARD_ID_RE.test(token)) {
    const name = idToName.get(token);
    if (name === undefined) {
      throw new Error(`Unknown card UUID: ${token}`);
    }
    return { id: token, name };
  }
  const id = nameToId.get(token);
  if (id === undefined) {
    throw new Error(`Unknown card reference: ${JSON.stringify(token)}`);
  }
  return { id, name: token };
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
 * current card names, in order. Card tokens are stable UUIDs (a bare name is
 * also accepted, e.g. an unmigrated record); a token that resolves to no known
 * card is dropped from that decklist. Seats with an empty (or fully unresolved)
 * mainboard are skipped, as are files without a `seats` array.
 */
export function readAdaptedRecordDecklists(dir, { idToName, nameToId }) {
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
        const id = CARD_ID_RE.test(token) ? token : nameToId.get(token);
        if (id !== undefined && idToName.has(id)) names.push(idToName.get(id));
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
export function readAdaptedRecordDecklistIds(dir, { idToName, nameToId }) {
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
        const id = CARD_ID_RE.test(token) ? token : nameToId.get(token);
        if (id !== undefined && idToName.has(id)) ids.push(id.toLowerCase());
      }
      if (ids.length > 0) decks.push(ids);
    }
  }
  return decks;
}
