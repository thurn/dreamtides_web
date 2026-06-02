// Save the 8 seat decklists of a Cube Cobra draft as MTGO plain-text files.
//
// Usage:
//   node scripts/save-cubecobra-draft.mjs <deckUrlOrId> [targetDir]
//
// Examples:
//   node scripts/save-cubecobra-draft.mjs \
//     https://cubecobra.com/cube/deck/b7f6c0c2-6adb-4ac8-98c2-a837259a94f6 ./drafts
//   node scripts/save-cubecobra-draft.mjs b7f6c0c2-6adb-4ac8-98c2-a837259a94f6
//
// One .txt file is written per seat, named
//   <draft-date>-<deck-name-slug>-<draftId>.txt   e.g.
//   2026-06-02-u-welder-b7f6c0c2-6adb-4ac8-98c2-a837259a94f6.txt
// Each file is a newline-delimited list of the seat's main-deck card names
// (one line per card, copies repeated), straight from Cube Cobra's own export.
//
// The deck-fetching logic is also exported (saveDraft, fetchText,
// extractReactProps, slugify) for reuse by save-cubecobra-cube-drafts.mjs.

import { writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const BASE = "https://cubecobra.com";

const DRAFT_ID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// Accept a full deck URL or a bare draft id; return the UUID (or null).
export function parseDraftId(input) {
  const m = DRAFT_ID_RE.exec(input ?? "");
  return m ? m[0].toLowerCase() : null;
}

export function slugify(name) {
  return (
    (name ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "deck"
  );
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "quest-prototype-draft-saver" },
  });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return res.text();
}

// Pull the `window.reactProps = {...}` blob out of a Cube Cobra page and parse
// it. The blob is a JS object literal (it can contain bare `undefined`), so we
// coerce those value tokens to null before JSON.parse.
export function extractReactProps(html) {
  const start = html.indexOf("window.reactProps");
  if (start === -1) throw new Error("reactProps not found in page HTML");
  const eq = html.indexOf("=", start) + 1;
  const end = html.indexOf("</script>", eq);
  let raw = html.slice(eq, end).trim();
  if (raw.endsWith(";")) raw = raw.slice(0, -1);
  const jsonish = raw.replace(/([:[,])\s*undefined/g, "$1null");
  return JSON.parse(jsonish);
}

// Download every seat of one draft into targetDir. Returns
// { draftId, date, seats: [{ seat, name, file, cards }] }.
// seatDelayMs spaces out the per-seat requests to stay polite.
export async function saveDraft(draftId, targetDir, { seatDelayMs = 0 } = {}) {
  mkdirSync(targetDir, { recursive: true });

  // One page load gives us every seat's name plus the draft date.
  const page = await fetchText(`${BASE}/cube/deck/${draftId}?seat=0`);
  const { draft } = extractReactProps(page);
  if (!draft?.seatNames?.length) throw new Error("no seats found for this draft");

  const date = new Date(draft.date).toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  const seats = [];
  for (let seat = 0; seat < draft.seatNames.length; seat++) {
    if (seat > 0 && seatDelayMs) await sleep(seatDelayMs);
    const name = draft.seatNames[seat] ?? `seat-${seat}`;
    const deck = await fetchText(
      `${BASE}/cube/deck/download/txt/${draftId}/${seat}`,
    );
    const cards = deck.split("\n").filter((l) => l.trim() !== "").length;
    const file = `${date}-${slugify(name)}-${draftId}.txt`;
    writeFileSync(join(targetDir, file), deck.endsWith("\n") ? deck : `${deck}\n`);
    seats.push({ seat, name, file, cards });
  }
  return { draftId, date, seats };
}

function usage(msg) {
  if (msg) console.error(`Error: ${msg}\n`);
  console.error(
    "Usage: node scripts/save-cubecobra-draft.mjs <deckUrlOrId> [targetDir]",
  );
  process.exit(msg ? 1 : 0);
}

async function main() {
  const [input, targetArg] = process.argv.slice(2);
  if (!input || input === "-h" || input === "--help") {
    usage(input ? "" : "missing <deckUrlOrId>");
  }
  const draftId = parseDraftId(input);
  if (!draftId) usage(`could not find a draft id in "${input}"`);
  const targetDir = resolve(targetArg ?? ".");

  const { date, seats } = await saveDraft(draftId, targetDir);
  console.log(`Draft ${draftId} (${date}): ${seats.length} seats -> ${targetDir}`);
  for (const { seat, name, file, cards } of seats) {
    console.log(`  seat ${seat}: ${name} (${cards} cards) -> ${file}`);
  }
}

// Run as a CLI only when invoked directly, not when imported.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
  });
}
