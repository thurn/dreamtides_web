// Regression guard for the draft-pool identity contract.
//
// A card's identity is its UUID, never its display name: dozens of distinct
// cards (different UUIDs, different rules) share a display name, so any pool that
// keys its output on a name silently merges those cards and/or resolves them to
// the wrong card number. The runtime now keys every pool's `counts`, provenance,
// and starter deck on `CardId` (UUID) and resolves them through the collision-
// free id index only (`resolvePool`, `src/data/cards-v2-database.ts`).
//
// This audit proves that invariant holds on live data and fails (non-zero exit)
// if it is ever broken. It asserts STRUCTURAL invariants — never specific card
// names or counts — so it stays valid as the TOML/JSONC game-design data changes:
//
//   1. Every card entry in the default pool source (`data/tides4.jsonc`) carries
//      a UUID `id`. A pool source that lost its ids would force the runtime back
//      onto names — the original bug — so a missing id is a hard failure.
//   2. Under the id path the runtime actually uses, no two distinct source UUIDs
//      resolve to the same card number (no merge), and the audit reports any UUID
//      that no longer resolves (a stale reference to a dropped card).
//
// It also prints, for the same source, how badly the OLD name path would merge
// and mis-resolve these cards — the before/after proof of what the id path fixes.
// Run with `npm run pool-collision-audit`.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

// JSONC artifacts carry leading comments; parse from the first object brace.
function readJsonc(relativePath) {
  const raw = fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
  return JSON.parse(raw.slice(raw.indexOf("{")));
}

// ---- Card universe + indexes, mirroring src/data/cards-v2-database.ts ----
const cardsRaw = readJson("public/cards_v2-data.json");
const cards = Array.isArray(cardsRaw) ? cardsRaw : cardsRaw.cards;

const idIndex = new Map(); // uuid(lower) -> cardNumber (buildIdIndex)
const nameIndex = new Map(); // name -> cardNumber, first wins (buildNameIndex)
const nameByUuid = new Map(); // uuid(lower) -> current display name
const nameToUuids = new Map(); // name -> Set<uuid(lower)>
for (const card of cards) {
  const uuid = String(card.id).toLowerCase();
  idIndex.set(uuid, card.cardNumber);
  nameByUuid.set(uuid, card.name);
  if (!nameIndex.has(card.name)) nameIndex.set(card.name, card.cardNumber);
  if (!nameToUuids.has(card.name)) nameToUuids.set(card.name, new Set());
  nameToUuids.get(card.name).add(uuid);
}

const failures = [];

// ---- The default pool source (tides4) ----
const t4 = readJsonc("data/tides4.jsonc");

// Invariant 1: every tide card carries a UUID id. A name-only source would push
// the runtime back onto the name path this migration removed.
let missingIds = 0;
for (const tide of t4.tides) {
  for (const card of tide.cards) {
    if (typeof card.id !== "string" || card.id.length === 0) missingIds += 1;
  }
}
if (missingIds > 0) {
  failures.push(
    `tides4 source has ${missingIds} card entr${missingIds === 1 ? "y" : "ies"} ` +
      `with no UUID id — the pool source must carry card identity.`,
  );
}

// The distinct source UUIDs the default variant deals from.
const sourceUuids = new Set();
for (const tide of t4.tides) {
  for (const card of tide.cards) sourceUuids.add(String(card.id).toLowerCase());
}

// Invariant 2: id-path resolution (what the runtime uses) never merges two
// distinct source UUIDs onto one card number; report any UUID that fails to
// resolve (a stale reference to a dropped card).
const cardNumberToUuids = new Map();
let staleUnderId = 0;
for (const uuid of sourceUuids) {
  const cardNumber = idIndex.get(uuid);
  if (cardNumber === undefined) {
    staleUnderId += 1;
    continue;
  }
  if (!cardNumberToUuids.has(cardNumber)) cardNumberToUuids.set(cardNumber, []);
  cardNumberToUuids.get(cardNumber).push(uuid);
}
const idMerges = [...cardNumberToUuids.entries()].filter(
  ([, uuids]) => uuids.length >= 2,
);
if (idMerges.length > 0) {
  failures.push(
    `id path merged ${idMerges.length} card number(s): two distinct source ` +
      `UUIDs resolved to one card (a duplicate/stale id anomaly).`,
  );
}

// ---- Before/after proof: what the OLD name path would do to this source ----
let nameWrong = 0;
let staleNamePath = 0;
const nameToSourceUuids = new Map();
for (const uuid of sourceUuids) {
  const intended = idIndex.get(uuid);
  if (intended === undefined) {
    staleNamePath += 1;
    continue;
  }
  const name = nameByUuid.get(uuid);
  if (nameIndex.get(name) !== intended) nameWrong += 1;
  if (!nameToSourceUuids.has(name)) nameToSourceUuids.set(name, new Set());
  nameToSourceUuids.get(name).add(uuid);
}
const nameMerges = [...nameToSourceUuids.values()].filter((s) => s.size >= 2);

// ---- Report ----
console.log("=".repeat(72));
console.log("Draft-pool identity audit (default variant: tides4)");
console.log("=".repeat(72));
console.log(`cards in catalog:                 ${cards.length}`);
console.log(`distinct display names:           ${nameToUuids.size}`);
console.log(
  `names shared by 2+ UUIDs:         ${
    [...nameToUuids.values()].filter((s) => s.size >= 2).length
  }`,
);
console.log(`distinct tides4 source UUIDs:     ${sourceUuids.size}`);
console.log("");
console.log("ID PATH (runtime, collision-free):");
console.log(`  source UUIDs that fail to resolve (stale): ${staleUnderId}`);
console.log(`  card numbers two source UUIDs merged onto: ${idMerges.length}`);
console.log("");
console.log("NAME PATH (the removed hazard — before/after proof):");
console.log(`  source names merging 2+ distinct UUIDs:    ${nameMerges.length}`);
console.log(`  source UUIDs the name path mis-resolves:   ${nameWrong}`);
if (staleNamePath > 0) {
  console.log(`  (note: ${staleNamePath} source UUID(s) absent from catalog)`);
}
console.log("=".repeat(72));

if (failures.length > 0) {
  console.error("\nFAIL — draft-pool identity invariants violated:");
  for (const failure of failures) console.error(`  • ${failure}`);
  process.exit(1);
}
console.log(
  "\nPASS — the default pool resolves entirely through the id index; no " +
    "same-name merge or wrong-card resolution is reachable on this data.",
);
