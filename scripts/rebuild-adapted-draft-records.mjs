// Rebuild the entire Dreamtides-adapted draft-record corpus from the MTG source
// records, deterministically, from current card data.
//
// Source: docs/draft_records/*.json — real Synergy Cube drafts whose card arrays
// hold MTG card names. Output: docs/draft_records_adapted/*.jsonc — the same
// records with every card array adapted to Dreamtides.
//
// Adaptation rule (the `mtg-name` bridge in data/tabula/cards_v2.toml is the link
// between the two pools):
//
//   * Group every cards_v2 card by its `mtg-name`. A single MTG card maps to one
//     or more Dreamtides cards (one-to-many).
//   * For each token in a source card array, look up its `mtg-name` group and
//     emit EVERY Dreamtides card id in that group, in cards_v2 file order — a
//     contiguous sibling block. Double-faced source names (front face only) match
//     the combined `front // back` mtg-name.
//   * A token whose name has no `mtg-name` (lands, mana rocks, un-adapted spells)
//     has no Dreamtides equivalent and is dropped.
//   * Every non-card field (seats, picks, ids, counts, names) is copied verbatim.
//
// Output is JSONC: each card id carries an inline `// <name>` comment from the
// current card name, and comments are stripped before parsing. Because the rule
// reads only the current cards_v2, a rebuild self-heals every kind of card-data
// drift at once: renames (comments refresh), mtg-name changes, and siblings added
// after the previous bake (their blocks complete). It is the canonical way to
// regenerate the corpus; the per-fix patch scripts are unnecessary after a run.
//
// Usage:
//   node scripts/rebuild-adapted-draft-records.mjs              # rebuild in place
//   node scripts/rebuild-adapted-draft-records.mjs --out <dir>  # write elsewhere
//   node scripts/rebuild-adapted-draft-records.mjs --check      # report, write nothing

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";

import { parse } from "smol-toml";

import { buildCardMaps } from "./setup-assets.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const SRC = join(ROOT, "docs", "draft_records");
const argv = process.argv.slice(2);
const checkOnly = argv.includes("--check");
const outIdx = argv.indexOf("--out");
const OUT = outIdx !== -1 ? resolve(argv[outIdx + 1]) : join(ROOT, "docs", "draft_records_adapted");

const cardsV2 = parse(
  readFileSync(join(ROOT, "data", "tabula", "cards_v2.toml"), "utf8"),
).cards;
const { idToName } = buildCardMaps(cardsV2);

// mtg-name -> ordered list of cards_v2 ids (cards_v2 file order). Also index each
// group by the front face of its mtg-name so a source token that stores only the
// front face of a double-faced card still resolves.
const groupByMtg = new Map();
const groupByFront = new Map();
for (const card of cardsV2) {
  const mtg = card["mtg-name"];
  if (!mtg) continue;
  if (!groupByMtg.has(mtg)) {
    groupByMtg.set(mtg, []);
    const front = mtg.split(" // ")[0];
    if (!groupByFront.has(front)) groupByFront.set(front, groupByMtg.get(mtg));
  }
  groupByMtg.get(mtg).push(card.id);
}

// Resolve a source MTG name to its ordered Dreamtides sibling-id block, or null
// if the card has no Dreamtides equivalent.
function resolveBlock(name) {
  const exact = groupByMtg.get(name);
  if (exact) return exact;
  return groupByFront.get(name.split(" // ")[0]) ?? null;
}

const CARD_KEYS = new Set(["mainboard", "sideboard", "pool", "pick", "packCards"]);

const stats = { resolved: 0, dropped: 0, expandedTo: 0 };
const droppedNames = new Map();

// Adapt one source card array: expand each name to its sibling block, drop
// names with no Dreamtides equivalent.
function adaptCardArray(names) {
  const out = [];
  for (const name of names) {
    const block = resolveBlock(name);
    if (block) {
      out.push(...block);
      stats.resolved += 1;
      stats.expandedTo += block.length;
    } else {
      stats.dropped += 1;
      droppedNames.set(name, (droppedNames.get(name) ?? 0) + 1);
    }
  }
  return out;
}

function adaptRecord(record) {
  if (!Array.isArray(record.seats)) return record;
  for (const seat of record.seats) {
    for (const key of ["mainboard", "sideboard", "pool"]) {
      if (Array.isArray(seat[key])) seat[key] = adaptCardArray(seat[key]);
    }
    for (const pick of seat.picks ?? []) {
      // A source `pick` is the single picked card as a scalar name; one-to-many
      // expansion turns it into a sibling-block array (already-array input on a
      // re-run is handled the same way).
      if (typeof pick.pick === "string") pick.pick = adaptCardArray([pick.pick]);
      else if (Array.isArray(pick.pick)) pick.pick = adaptCardArray(pick.pick);
      if (Array.isArray(pick.packCards)) pick.packCards = adaptCardArray(pick.packCards);
    }
  }
  return record;
}

// Serializer copied from add-uuids-to-draft-records.mjs so output formatting and
// inline `// <name>` comments match the rest of the corpus exactly.
function serialize(value, indent, key) {
  const pad = "  ".repeat(indent);
  const padIn = "  ".repeat(indent + 1);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const cardArray = CARD_KEYS.has(key) && value.every((v) => typeof v === "string");
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

const files = readdirSync(SRC).filter((f) => f.endsWith("-records.json")).sort();
if (!checkOnly) mkdirSync(OUT, { recursive: true });

let written = 0;
for (const filename of files) {
  const record = JSON.parse(readFileSync(join(SRC, filename), "utf8"));
  adaptRecord(record);
  if (!checkOnly) {
    writeFileSync(join(OUT, filename.replace(/\.json$/, ".jsonc")), serialize(record, 0, undefined));
    written += 1;
  }
}

console.log(
  `Source files: ${files.length}; ${checkOnly ? "would write" : "wrote"} ${checkOnly ? files.length : written} to ${OUT}`,
);
console.log(
  `Tokens: ${stats.resolved} resolved -> ${stats.expandedTo} expanded; ${stats.dropped} dropped (no Dreamtides equivalent).`,
);
console.log(`Distinct dropped MTG names: ${droppedNames.size}`);
