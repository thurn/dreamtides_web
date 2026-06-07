// Shared helpers for resolving card references by their stable cards_v2 UUID.
//
// Every system that names cards in data — the signature lists in
// `dreamcallers_v2.toml`, the pool metadata in `cards-v2-metadata.ts`, the
// build-around metadata in `buildaround_support.json`, and the real-decklist
// corpora under `docs/drafts_anon` / `docs/drafts_dt` — keys cards by their
// `id` UUID from `data/tabula/cards_v2.toml`. The UUID is stable across display
// renames, so renaming a card in `cards_v2.toml` no longer desynchronizes any of
// those files.
//
// Corpus files store one card per line as `<uuid> # <Card Name>`: code reads the
// UUID and ignores the trailing comment, while the comment keeps the file
// human-readable. `setup-assets.mjs` regenerates the comment from the current
// card name on every build, so it never goes stale.

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
    // First record wins on a duplicate name; references only need one
    // representative card per name.
    if (!nameToId.has(card.name)) nameToId.set(card.name, card.id);
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
    if (!nameToId.has(card.name)) nameToId.set(card.name, card.id);
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

/** Render a canonical corpus line: `<uuid> # <Card Name>`. */
export function corpusLine(id, name) {
  return `${id} # ${name}`;
}

/**
 * Read a corpus `.txt` deck file and return the resolved card entries
 * (`{ id, name }`) for its non-blank lines, in order. Throws on any unresolved
 * reference.
 */
export function readCorpusDeck(path, maps) {
  const out = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const token = corpusLineToken(line);
    if (token.length === 0) continue;
    out.push(resolveToken(token, maps));
  }
  return out;
}

/** Read a corpus deck file and return just the current card names, in order. */
export function readCorpusDeckNames(path, maps) {
  return readCorpusDeck(path, maps).map((c) => c.name);
}

/** List the `.txt` deck filenames in a corpus directory, sorted. */
export function corpusFiles(dir) {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".txt"))
    .sort();
}

/** Convenience: absolute path to a corpus deck file. */
export function corpusPath(dir, filename) {
  return join(dir, filename);
}
