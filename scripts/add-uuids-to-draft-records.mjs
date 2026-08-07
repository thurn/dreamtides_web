// Rewrite every adapted draft record under `docs/draft_records_adapted` so each
// card array (`mainboard`, `sideboard`, `pool`, and each pick's `pick` /
// `packCards`) stores the card's stable cards_v2 UUID instead of its display
// name, with the name kept as an inline `//` comment for human readability. This
// makes the corpus rename-proof: the canonical token is the id, which never
// changes, while the comment (and the downstream bundle's display name) is
// refreshed from the id whenever the card is renamed.
//
// Names are resolved against the CURRENT cards_v2 name->id map. A name that does
// not resolve (a card removed/renamed before this migration) is left as a bare
// name string with no comment; `buildDraftRecords` drops such tokens at bundle
// time, exactly as before.
//
// The corpus files are JSONC (`.jsonc`, JSON + `//` line comments);
// `buildDraftRecords` strips the comments before parsing. Idempotent: a token
// already in UUID form is kept and re-commented from the current name, so
// re-running only refreshes comments.
//
// Usage:
//   node scripts/add-uuids-to-draft-records.mjs            # migrate all files
//   node scripts/add-uuids-to-draft-records.mjs --limit 1  # migrate the first N

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

import { parse } from "smol-toml";

import { CARD_ID_RE } from "./lib/card-refs.mjs";
import { buildCardMaps, stripJsonComments } from "./setup-assets.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const DIR = join(ROOT, "docs", "draft_records_adapted");
const argv = process.argv.slice(2);
const limitIdx = argv.indexOf("--limit");
const limit = limitIdx !== -1 ? Number(argv[limitIdx + 1]) : Infinity;

const cardsV2 = parse(
  readFileSync(join(ROOT, "data", "cards.toml"), "utf8"),
).cards;
const { idToName } = buildCardMaps(cardsV2);

// This migration is the one place that resolves a bare display name to a UUID,
// so it owns its own name->id map. First record wins on a duplicate display
// name; an ambiguous or unknown name is left as a bare token (see `toIds`) and
// `buildDraftRecords` drops it at bundle time.
const nameToId = new Map();
for (const card of cardsV2) {
  if (typeof card.id === "string" && !nameToId.has(card.name)) {
    nameToId.set(card.name, card.id);
  }
}

// Card-array keys whose string elements are card references (and get inline name
// comments). `pickId` and other UUID-shaped fields are NOT card references, so
// they are left untouched.
const CARD_KEYS = new Set(["mainboard", "sideboard", "pool", "pick", "packCards"]);

let resolved = 0;
let unresolved = 0;
const unresolvedNames = new Set();

// Map an array of card tokens (names, or ids on a re-run) to canonical ids,
// keeping unresolved names verbatim.
function toIds(tokens) {
  return tokens.map((tok) => {
    if (CARD_ID_RE.test(tok)) return tok;
    const id = nameToId.get(tok);
    if (id !== undefined) {
      resolved += 1;
      return id;
    }
    unresolved += 1;
    unresolvedNames.add(tok);
    return tok;
  });
}

// Recursively serialize to JSONC with 2-space indent, appending ` // <name>` to
// each element of a card-reference array. Scalars go through JSON.stringify so
// string escaping matches standard JSON.
function serialize(value, indent, key) {
  const pad = "  ".repeat(indent);
  const padIn = "  ".repeat(indent + 1);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const cardArray =
      CARD_KEYS.has(key) && value.every((v) => typeof v === "string");
    const lines = value.map((v, i) => {
      const comma = i < value.length - 1 ? "," : "";
      if (cardArray) {
        const name = idToName.get(v);
        return padIn + JSON.stringify(v) + comma + (name ? ` // ${name}` : "");
      }
      return padIn + serialize(v, indent + 1, undefined) + comma;
    });
    return `[\n${lines.join("\n")}\n${pad}]`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length === 0) return "{}";
    const lines = keys.map((k, i) => {
      const comma = i < keys.length - 1 ? "," : "";
      return `${padIn}${JSON.stringify(k)}: ${serialize(value[k], indent + 1, k)}${comma}`;
    });
    return `{\n${lines.join("\n")}\n${pad}}`;
  }
  return JSON.stringify(value);
}

const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".jsonc"))
  .sort()
  .slice(0, limit);

let written = 0;
for (const filename of files) {
  const path = join(DIR, filename);
  const record = JSON.parse(stripJsonComments(readFileSync(path, "utf8")));
  if (!Array.isArray(record.seats)) continue;

  for (const seat of record.seats) {
    for (const key of ["mainboard", "sideboard", "pool"]) {
      if (Array.isArray(seat[key])) seat[key] = toIds(seat[key]);
    }
    for (const pick of seat.picks ?? []) {
      if (Array.isArray(pick.pick)) pick.pick = toIds(pick.pick);
      if (Array.isArray(pick.packCards)) pick.packCards = toIds(pick.packCards);
    }
  }

  writeFileSync(path, serialize(record, 0, undefined));
  written += 1;
}

console.log(
  `Migrated ${written} files; ${resolved} name->id resolutions, ` +
    `${unresolved} unresolved (${unresolvedNames.size} distinct).`,
);
if (unresolvedNames.size > 0) {
  console.log("Distinct unresolved names (left as bare names, dropped at bundle time):");
  for (const n of [...unresolvedNames].sort()) console.log(`  ${n}`);
}
