// Walk a Cube Cobra cube's playtest "decks" list and tally every seat's Pack 1
// Pick 1 across all drafts into a single "first_picks.txt", newest drafts first.
//
// Usage:
//   node scripts/save-cubecobra-first-picks.mjs <cubeUrlOrShortId> [targetDir] [options]
//
// Examples:
//   node scripts/save-cubecobra-first-picks.mjs \
//     "https://cubecobra.com/cube/playtest/synergy?view=decks" ./drafts --limit 20
//   node scripts/save-cubecobra-first-picks.mjs synergy ./drafts
//
// Output: targetDir/first_picks.txt, newline-delimited "<count> <card name>"
// lines (e.g. "3 Lightning Bolt"), sorted most-picked first. Every seat of every
// draft contributes its single P1P1 card, so a draft adds up to 8 picks.
//
// Options:
//   --limit N    Process at most N new drafts this run (default 10). Drafts
//                already cached are skipped and do NOT count toward N, so each
//                run folds in N drafts you don't yet have.
//   --delay MS   Pause between draft page fetches (default 1500).
//
// Resuming: each draft's P1P1 cards are cached under
// targetDir/first-pick-cache/<draftId>.json, and resolved card names are cached
// in targetDir/first-pick-cache/card-names.json. Cached drafts are skipped, and
// first_picks.txt is regenerated from every cache file on each run, so the tally
// grows without redoing work.
//
// How P1P1 is recovered: a Cube Cobra draft page (reactProps.draft) gives, per
// seat, InitialState[seat][0].cards (the 15-card pack that seat opened) and
// seats[seat].pickorder (that seat's picks in reverse-chronological order). The
// last pickorder entry is therefore the seat's very first pick, and it always
// lies in the opened pack. Cards carry a Scryfall id (cardID) but no name, so
// names are resolved through Scryfall's bulk collection endpoint.

import {
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  BASE,
  fetchText,
  extractReactProps,
  sleep,
} from "./save-cubecobra-draft.mjs";

const DELAY_BETWEEN_DRAFTS_MS = 1500; // politeness gap between draft pages
const LIST_PAGE_DELAY_MS = 1000; // gap between "get more decks" pages
const SCRYFALL_BASE = "https://api.scryfall.com";
const SCRYFALL_BATCH = 75; // max identifiers per collection request
const SCRYFALL_DELAY_MS = 120; // gap between collection requests (Scryfall asks for >=50-100ms)
const CACHE_DIR = "first-pick-cache";
const NAME_CACHE_FILE = "card-names.json";
const OUTPUT_FILE = "first_picks.txt";

function usage(msg) {
  if (msg) console.error(`Error: ${msg}\n`);
  console.error(
    "Usage: node scripts/save-cubecobra-first-picks.mjs <cubeUrlOrShortId> [targetDir] [--limit N] [--delay MS]",
  );
  process.exit(msg ? 1 : 0);
}

function parseArgs(argv) {
  const positional = [];
  let limit = 10;
  let delay = DELAY_BETWEEN_DRAFTS_MS;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") usage("");
    else if (arg === "--limit") limit = Number(argv[++i]);
    else if (arg === "--delay") delay = Number(argv[++i]);
    else positional.push(arg);
  }
  if (!positional.length) usage("missing <cubeUrlOrShortId>");
  if (!Number.isFinite(limit) || limit < 1) usage("--limit must be a positive number");
  if (!Number.isFinite(delay) || delay < 0) usage("--delay must be a non-negative number");
  return { input: positional[0], targetArg: positional[1], limit, delay };
}

// Accept a cube page URL (/cube/<section>/<shortId>...) or a bare short id.
function parseCubeShortId(input) {
  const m = /\/cube\/[^/]+\/([^/?#]+)/.exec(input);
  if (m) return decodeURIComponent(m[1]);
  if (/^[^/?#\s]+$/.test(input)) return input; // bare short id like "synergy"
  usage(`could not find a cube short id in "${input}"`);
}

// Yield { id, name } for every draft in the cube, newest first, paging through
// the "get more decks" endpoint as needed.
async function* iterDrafts(shortId) {
  const page = await fetchText(`${BASE}/cube/playtest/${shortId}?view=decks`);
  const { cube, decks, decksLastKey } = extractReactProps(page);
  const cubeId = cube?.id;
  for (const d of decks ?? []) yield d;

  let lastKey = decksLastKey;
  while (cubeId && lastKey && Object.keys(lastKey).length) {
    await sleep(LIST_PAGE_DELAY_MS);
    const res = await fetch(`${BASE}/cube/getmoredecks/${cubeId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "journey-prototype-draft-saver",
      },
      body: JSON.stringify({ cubeId, lastKey }),
    });
    if (!res.ok) throw new Error(`POST getmoredecks -> HTTP ${res.status}`);
    const data = await res.json();
    if (!data.decks?.length) break;
    for (const d of data.decks) yield d;
    lastKey = data.lastKey;
  }
}

// The cardID (Scryfall uuid) of each seat's Pack 1 Pick 1, in seat order. A
// seat with no picks (e.g. an abandoned draft) contributes nothing.
function firstPickCardIds(draft) {
  const ids = [];
  const seats = draft.seats ?? [];
  for (let s = 0; s < seats.length; s++) {
    const pickorder = seats[s].pickorder;
    if (!pickorder?.length) continue;
    const idx = pickorder[pickorder.length - 1]; // pickorder is reverse-chronological
    const card = draft.cards?.[idx];
    if (card?.cardID) ids.push(card.cardID);
  }
  return ids;
}

// Resolve Scryfall ids to card names, filling and consulting nameCache (a plain
// id -> name object) so each id is fetched at most once across the whole run.
async function resolveNames(ids, nameCache) {
  const missing = [...new Set(ids)].filter((id) => !(id in nameCache));
  for (let i = 0; i < missing.length; i += SCRYFALL_BATCH) {
    if (i > 0) await sleep(SCRYFALL_DELAY_MS);
    const batch = missing.slice(i, i + SCRYFALL_BATCH);
    const res = await fetch(`${SCRYFALL_BASE}/cards/collection`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "journey-prototype-draft-saver",
      },
      body: JSON.stringify({ identifiers: batch.map((id) => ({ id })) }),
    });
    if (!res.ok) throw new Error(`POST scryfall collection -> HTTP ${res.status}`);
    const data = await res.json();
    for (const card of data.data ?? []) nameCache[card.id] = card.name;
    for (const nf of data.not_found ?? []) {
      console.warn(`  warning: Scryfall has no card for id ${nf.id}`);
      nameCache[nf.id] = `(unknown ${nf.id})`;
    }
  }
  return ids.map((id) => nameCache[id]);
}

function loadJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

// Tally every cached draft's picks and write the sorted first_picks.txt.
function writeAggregate(cacheDir, outputFile) {
  const counts = new Map();
  let drafts = 0;
  for (const f of readdirSync(cacheDir)) {
    if (!f.endsWith(".json") || f === NAME_CACHE_FILE) continue;
    const entry = loadJson(join(cacheDir, f), null);
    if (!entry?.picks) continue;
    drafts++;
    for (const name of entry.picks) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const lines = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, n]) => `${n} ${name}`);
  writeFileSync(outputFile, lines.length ? `${lines.join("\n")}\n` : "");
  return { drafts, unique: counts.size };
}

async function main() {
  const { input, targetArg, limit, delay } = parseArgs(process.argv.slice(2));
  const shortId = parseCubeShortId(input);
  const targetDir = resolve(targetArg ?? ".");
  const cacheDir = join(targetDir, CACHE_DIR);
  mkdirSync(cacheDir, { recursive: true });
  const nameCacheFile = join(cacheDir, NAME_CACHE_FILE);
  const outputFile = join(targetDir, OUTPUT_FILE);

  console.log(
    `Cube "${shortId}": processing up to ${limit} new draft(s) -> ${outputFile}`,
  );

  const nameCache = loadJson(nameCacheFile, {});
  let processed = 0;
  let skipped = 0;
  let seen = 0;
  for await (const deck of iterDrafts(shortId)) {
    if (processed >= limit) break;
    seen++;
    const id = deck.id;
    const cacheFile = join(cacheDir, `${id}.json`);
    if (existsSync(cacheFile)) {
      skipped++;
      console.log(`  skip (have it): ${deck.name ?? id} [${id}]`);
      continue;
    }
    if (processed > 0) await sleep(delay);

    const page = await fetchText(`${BASE}/cube/deck/${id}?seat=0`);
    const { draft } = extractReactProps(page);
    const cardIds = firstPickCardIds(draft);
    const picks = await resolveNames(cardIds, nameCache);
    writeFileSync(nameCacheFile, `${JSON.stringify(nameCache, null, 0)}\n`);

    const date = draft?.date ? new Date(draft.date).toISOString().slice(0, 10) : null;
    writeFileSync(
      cacheFile,
      `${JSON.stringify({ draftId: id, date, name: draft?.name ?? null, picks }, null, 0)}\n`,
    );
    processed++;
    console.log(
      `  saved ${processed}/${limit}: ${deck.name ?? id} [${id}] (${picks.length} first picks)`,
    );
  }

  const { drafts, unique } = writeAggregate(cacheDir, outputFile);
  console.log(
    `Done: ${processed} processed, ${skipped} skipped, ${seen} draft(s) examined.`,
  );
  console.log(
    `Aggregated ${drafts} cached draft(s) into ${unique} unique first pick(s) -> ${outputFile}`,
  );
  if (processed < limit) {
    console.log("Reached the end of the cube's draft list before hitting the limit.");
  }
}

// Run as a CLI only when invoked directly, not when imported.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
  });
}
