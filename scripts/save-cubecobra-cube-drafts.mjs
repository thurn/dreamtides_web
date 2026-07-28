// Walk a Cube Cobra cube's playtest "decks" list and save each draft's seat
// decklists via save-cubecobra-draft.mjs, newest first.
//
// Usage:
//   node scripts/save-cubecobra-cube-drafts.mjs <cubeUrlOrShortId> [targetDir] [options]
//
// Examples:
//   node scripts/save-cubecobra-cube-drafts.mjs \
//     "https://cubecobra.com/cube/playtest/synergy?view=decks" ./drafts --limit 20
//   node scripts/save-cubecobra-cube-drafts.mjs synergy ./drafts
//
// Options:
//   --limit N    Download at most N drafts this run (default 10). Drafts that
//                are already present are skipped and do NOT count toward N, so
//                each run pulls down N drafts you don't yet have.
//   --delay MS   Pause between draft downloads (default 1500).
//
// Resuming: a draft is "already downloaded" when targetDir contains any file
// whose name ends with "-<draftId>.txt" (the per-seat files all carry it).
// Such drafts are skipped, so re-running grows the collection without redoing
// work.

import { readdirSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  BASE,
  fetchText,
  extractReactProps,
  saveDraft,
  sleep,
} from "./save-cubecobra-draft.mjs";

const DELAY_BETWEEN_DECKS_MS = 1500; // politeness gap between drafts
const SEAT_DELAY_MS = 250; // gap between a draft's 8 seat requests
const LIST_PAGE_DELAY_MS = 1000; // gap between "get more decks" pages

function usage(msg) {
  if (msg) console.error(`Error: ${msg}\n`);
  console.error(
    "Usage: node scripts/save-cubecobra-cube-drafts.mjs <cubeUrlOrShortId> [targetDir] [--limit N] [--delay MS]",
  );
  process.exit(msg ? 1 : 0);
}

function parseArgs(argv) {
  const positional = [];
  let limit = 10;
  let delay = DELAY_BETWEEN_DECKS_MS;
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

function alreadyDownloaded(targetDir, draftId) {
  const suffix = `-${draftId}.txt`;
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

  console.log(`Cube "${shortId}": downloading up to ${limit} new draft(s) -> ${targetDir}`);

  let downloaded = 0;
  let skipped = 0;
  let seen = 0;
  for await (const deck of iterDrafts(shortId)) {
    if (downloaded >= limit) break;
    seen++;
    const id = deck.id;
    if (alreadyDownloaded(targetDir, id)) {
      skipped++;
      console.log(`  skip (have it): ${deck.name ?? id} [${id}]`);
      continue;
    }
    if (downloaded > 0) await sleep(delay);
    const { date, seats } = await saveDraft(id, targetDir, { seatDelayMs: SEAT_DELAY_MS });
    downloaded++;
    console.log(
      `  saved ${downloaded}/${limit}: ${deck.name ?? id} [${id}] (${date}, ${seats.length} seats)`,
    );
  }

  console.log(
    `Done: ${downloaded} downloaded, ${skipped} skipped, ${seen} draft(s) examined.`,
  );
  if (downloaded < limit) {
    console.log("Reached the end of the cube's draft list before hitting the limit.");
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
