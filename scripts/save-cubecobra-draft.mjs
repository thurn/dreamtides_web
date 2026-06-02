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

import { writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const BASE = "https://cubecobra.com";

function usage(msg) {
  if (msg) console.error(`Error: ${msg}\n`);
  console.error(
    "Usage: node scripts/save-cubecobra-draft.mjs <deckUrlOrId> [targetDir]",
  );
  process.exit(msg ? 1 : 0);
}

// Accept a full deck URL or a bare draft id; return the UUID.
function parseDraftId(input) {
  const m = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(
    input,
  );
  if (!m) usage(`could not find a draft id in "${input}"`);
  return m[0].toLowerCase();
}

function slugify(name) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "deck"
  );
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": "quest-prototype-draft-saver" } });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return res.text();
}

// Pull the `window.reactProps = {...}` blob out of a deck page and parse it.
// The blob is a JS object literal (it can contain bare `undefined`), so we
// coerce those value tokens to null before JSON.parse.
function extractReactProps(html) {
  const start = html.indexOf("window.reactProps");
  if (start === -1) throw new Error("reactProps not found in page HTML");
  const eq = html.indexOf("=", start) + 1;
  const end = html.indexOf("</script>", eq);
  let raw = html.slice(eq, end).trim();
  if (raw.endsWith(";")) raw = raw.slice(0, -1);
  const jsonish = raw.replace(/([:[,])\s*undefined/g, "$1null");
  return JSON.parse(jsonish);
}

async function main() {
  const [input, targetArg] = process.argv.slice(2);
  if (!input || input === "-h" || input === "--help") usage(input ? "" : "missing <deckUrlOrId>");

  const draftId = parseDraftId(input);
  const targetDir = resolve(targetArg ?? ".");
  mkdirSync(targetDir, { recursive: true });

  // One page load gives us every seat's name plus the draft date.
  const page = await fetchText(`${BASE}/cube/deck/${draftId}?seat=0`);
  const { draft } = extractReactProps(page);
  if (!draft?.seatNames?.length) throw new Error("no seats found for this draft");

  const date = new Date(draft.date).toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  console.log(`Draft ${draftId} (${date}): ${draft.seatNames.length} seats -> ${targetDir}`);

  for (let seat = 0; seat < draft.seatNames.length; seat++) {
    const name = draft.seatNames[seat] ?? `seat-${seat}`;
    const deck = await fetchText(`${BASE}/cube/deck/download/txt/${draftId}/${seat}`);
    const lines = deck.split("\n").filter((l) => l.trim() !== "").length;
    const file = `${date}-${slugify(name)}-${draftId}.txt`;
    writeFileSync(join(targetDir, file), deck.endsWith("\n") ? deck : `${deck}\n`);
    console.log(`  seat ${seat}: ${name} (${lines} cards) -> ${file}`);
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
