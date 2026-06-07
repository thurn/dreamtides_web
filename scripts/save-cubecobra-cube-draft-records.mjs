// Walk a Cube Cobra cube's playtest "decks" list and save each draft's complete
// pick-by-pick record via save-cubecobra-draft-records.mjs, newest first.
//
// Usage:
//   node scripts/save-cubecobra-cube-draft-records.mjs <cubeUrlOrShortId> [targetDir] [options]
//
// Examples:
//   node scripts/save-cubecobra-cube-draft-records.mjs \
//     "https://cubecobra.com/cube/playtest/synergy?view=decks" ./draft-records --limit 20
//   node scripts/save-cubecobra-cube-draft-records.mjs synergy ./draft-records
//
// Output: one JSON file per draft, named <date>-<draftId>-records.json, holding
// one entry per human seat (seats whose deck was drafted by a bot are excluded).
// See save-cubecobra-draft-records.mjs for the per-draft record shape.
//
// Options:
//   --limit N    Process at most N new drafts this run (default 10). Drafts that
//                are already present are skipped and do NOT count toward N, so
//                each run pulls down N drafts you don't yet have.
//   --delay MS   Pause between draft fetches (default 1500).
//
// Rate limiting: draft pages are fetched one at a time with a --delay gap
// between them; Scryfall name lookups are batched and self-throttled, and
// resolved names are cached in targetDir/cubecobra-card-names.json so repeated
// runs avoid re-querying Scryfall.
//
// Resuming: a draft is "already saved" when targetDir contains a file ending
// with "-<draftId>-records.json". Such drafts are skipped, so re-running grows
// the collection without redoing work. A draft that fails to reconstruct (e.g.
// an incomplete draft) is logged and skipped without aborting the batch.

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  BASE,
  fetchText,
  extractReactProps,
  sleep,
} from "./save-cubecobra-draft.mjs";
import { buildDraftRecords } from "./save-cubecobra-draft-records.mjs";

const DELAY_BETWEEN_DRAFTS_MS = 1500; // politeness gap between draft pages
const LIST_PAGE_DELAY_MS = 1000; // gap between "get more decks" pages
const NAME_CACHE_FILE = "cubecobra-card-names.json";

function usage(msg) {
  if (msg) console.error(`Error: ${msg}\n`);
  console.error(
    "Usage: node scripts/save-cubecobra-cube-draft-records.mjs <cubeUrlOrShortId> [targetDir] [--limit N] [--delay MS]",
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
        "User-Agent": "quest-prototype-draft-saver",
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

function loadJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function alreadySaved(targetDir, draftId) {
  const suffix = `-${draftId}-records.json`;
  try {
    return readdirSync(targetDir).some((f) => f.endsWith(suffix));
  } catch {
    return false; // dir doesn't exist yet
  }
}

async function main() {
  const { input, targetArg, limit, delay } = parseArgs(process.argv.slice(2));
  const shortId = parseCubeShortId(input);
  const targetDir = resolve(targetArg ?? ".");
  mkdirSync(targetDir, { recursive: true });
  const nameCacheFile = join(targetDir, NAME_CACHE_FILE);
  const nameCache = loadJson(nameCacheFile, {});

  console.log(
    `Cube "${shortId}": saving up to ${limit} new draft record(s) -> ${targetDir}`,
  );

  let saved = 0;
  let skipped = 0;
  let failed = 0;
  let seen = 0;
  for await (const deck of iterDrafts(shortId)) {
    if (saved >= limit) break;
    seen++;
    const id = deck.id;
    if (alreadySaved(targetDir, id)) {
      skipped++;
      console.log(`  skip (have it): ${deck.name ?? id} [${id}]`);
      continue;
    }
    if (saved > 0) await sleep(delay);

    let records;
    try {
      records = await buildDraftRecords(id, nameCache);
    } catch (err) {
      failed++;
      console.warn(`  skip (failed): ${deck.name ?? id} [${id}] - ${err.message ?? err}`);
      continue;
    }
    // Persist the shared name cache after each draft so progress survives Ctrl-C.
    writeFileSync(nameCacheFile, `${JSON.stringify(nameCache, null, 0)}\n`);

    const date = records.date ? records.date.slice(0, 10) : "draft";
    const file = `${date}-${id}-records.json`;
    writeFileSync(join(targetDir, file), `${JSON.stringify(records, null, 2)}\n`);
    saved++;
    const bots = records.seatCount - records.seats.length;
    console.log(
      `  saved ${saved}/${limit}: ${deck.name ?? id} [${id}] (${date}, ` +
        `${records.seats.length} human seat(s)` +
        (bots ? `, ${bots} bot(s)` : "") +
        `) -> ${file}`,
    );
  }

  console.log(
    `Done: ${saved} saved, ${skipped} skipped, ${failed} failed, ${seen} draft(s) examined.`,
  );
  if (saved < limit) {
    console.log("Reached the end of the cube's draft list before hitting the limit.");
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
