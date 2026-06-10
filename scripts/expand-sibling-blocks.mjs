// Repair the one-to-many expansion in the adapted draft-record corpus.
//
// When a draft record is adapted from the MTG source cube, each source card is
// expanded into a contiguous, cards_v2-order block of EVERY Dreamtides card that
// shares its `mtg-name` (the bridge field). A group of N siblings therefore
// appears as N adjacent tokens wherever the source card occurred.
//
// If a sibling is added to cards_v2 AFTER the corpus was baked, its block is left
// incomplete: the older siblings appear but the new one never does. This script
// re-completes every such block so all siblings of a group are represented
// evenly again, matching the original conversion's even-split invariant.
//
// It edits the `.jsonc` files textually, inserting only the missing sibling lines
// (with the correct indentation, trailing comma, and inline `// <name>` comment)
// into each existing block. Every other byte — including the inline comments on
// untouched lines — is preserved exactly, so the diff is insertion-only.
// Idempotent: a block that already contains all siblings in order is unchanged.
//
// Usage:
//   node scripts/expand-sibling-blocks.mjs --check   # report partial groups only
//   node scripts/expand-sibling-blocks.mjs           # apply the repair

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

import { parse } from "smol-toml";

import { CARD_ID_RE, stripJsonComments } from "./lib/card-refs.mjs";
import { buildCardMaps } from "./setup-assets.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const DIR = join(ROOT, "docs", "draft_records_adapted");
const checkOnly = process.argv.slice(2).includes("--check");

const cardsV2 = parse(
  readFileSync(join(ROOT, "data", "tabula", "cards_v2.toml"), "utf8"),
).cards;
const { idToName } = buildCardMaps(cardsV2);

// mtg-name -> ordered list of cards_v2 ids that share it (cards_v2 file order).
const groupsByMtg = new Map();
for (const card of cardsV2) {
  const mtg = card["mtg-name"];
  if (!mtg) continue;
  if (!groupsByMtg.has(mtg)) groupsByMtg.set(mtg, []);
  groupsByMtg.get(mtg).push(card.id);
}

const CARD_KEYS = ["mainboard", "sideboard", "pool", "pick", "packCards"];
const files = readdirSync(DIR).filter((f) => f.endsWith(".jsonc")).sort();

// --- Pass 1: tally per-id usage across the corpus to find partial groups. ---
const usage = new Map();
for (const filename of files) {
  const record = JSON.parse(stripJsonComments(readFileSync(join(DIR, filename), "utf8")));
  if (!Array.isArray(record.seats)) continue;
  for (const seat of record.seats) {
    for (const key of ["mainboard", "sideboard", "pool"]) {
      for (const tok of seat[key] ?? []) {
        if (CARD_ID_RE.test(tok)) usage.set(tok, (usage.get(tok) ?? 0) + 1);
      }
    }
    for (const pick of seat.picks ?? []) {
      for (const key of ["pick", "packCards"]) {
        for (const tok of pick[key] ?? []) {
          if (CARD_ID_RE.test(tok)) usage.set(tok, (usage.get(tok) ?? 0) + 1);
        }
      }
    }
  }
}

// Partial groups: >1 sibling, at least one present and at least one absent.
const partial = [];
for (const [mtg, ids] of groupsByMtg) {
  if (ids.length < 2) continue;
  const present = ids.filter((id) => (usage.get(id) ?? 0) > 0);
  const absent = ids.filter((id) => (usage.get(id) ?? 0) === 0);
  if (present.length > 0 && absent.length > 0) partial.push({ mtg, ids, present, absent });
}

if (partial.length === 0) {
  console.log("No partial sibling groups found; corpus expansion is complete.");
  process.exit(0);
}

console.log(`Partial sibling groups (${partial.length}):`);
for (const g of partial) {
  console.log(`  '${g.mtg}' [${g.ids.length}]`);
  for (const id of g.ids) {
    const tag = (usage.get(id) ?? 0) === 0 ? "  <-- missing" : "";
    console.log(`      ${String(usage.get(id) ?? 0).padStart(5)}x  ${idToName.get(id)}${tag}`);
  }
}

if (checkOnly) process.exit(0);

// --- Pass 2: textual line insertion. ---
const memberToGroup = new Map();
for (const g of partial) for (const id of g.ids) memberToGroup.set(id, g);

// A card-reference array element line: leading whitespace, a quoted UUID, an
// optional trailing comma, an optional inline comment. (Object-value lines such
// as `"pickId": "<uuid>",` do not match because of the leading `"key":`.)
const CARD_LINE = /^(\s*)"([0-9a-f-]{36})"(,?)\s*(\/\/.*)?$/;

function renderLine(indent, id, withComma) {
  const name = idToName.get(id);
  return `${indent}"${id}"${withComma ? "," : ""}${name ? ` // ${name}` : ""}`;
}

let changedFiles = 0;
let insertedTokens = 0;

for (const filename of files) {
  const path = join(DIR, filename);
  const text = readFileSync(path, "utf8");
  const lines = text.split("\n");
  const out = [];
  let inserted = 0;

  for (let i = 0; i < lines.length; ) {
    const m = CARD_LINE.exec(lines[i]);
    const grp = m && CARD_ID_RE.test(m[2]) ? memberToGroup.get(m[2]) : undefined;
    if (!grp) {
      out.push(lines[i]);
      i += 1;
      continue;
    }
    // Consume the maximal run of consecutive card lines belonging to this group.
    const indent = m[1];
    let j = i;
    while (j < lines.length) {
      const mj = CARD_LINE.exec(lines[j]);
      if (!mj || !CARD_ID_RE.test(mj[2]) || memberToGroup.get(mj[2]) !== grp) break;
      j += 1;
    }
    // The run's last line carries the array's real trailing-comma state; the
    // emitted block must reproduce it on its own last line and comma every
    // earlier line. Re-emit the full cards_v2-ordered sibling block.
    const lastHadComma = CARD_LINE.exec(lines[j - 1])[3] === ",";
    for (let k = 0; k < grp.ids.length; k += 1) {
      const isLast = k === grp.ids.length - 1;
      out.push(renderLine(indent, grp.ids[k], isLast ? lastHadComma : true));
    }
    inserted += grp.ids.length - (j - i);
    i = j;
  }

  const next = out.join("\n");
  if (next !== text) {
    writeFileSync(path, next);
    changedFiles += 1;
    insertedTokens += inserted;
  }
}

console.log(
  `\nRepaired ${changedFiles} files; inserted ${insertedTokens} sibling tokens.`,
);
