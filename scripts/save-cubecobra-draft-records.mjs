// Save a complete, pick-by-pick draft record for every human seat of a Cube
// Cobra draft as a single JSON file.
//
// Usage:
//   node scripts/save-cubecobra-draft-records.mjs <deckUrlOrId> [outFileOrDir]
//
// Examples:
//   node scripts/save-cubecobra-draft-records.mjs \
//     https://cubecobra.com/cube/deck/b23cdd31-cbbb-4171-a7d8-adf3681d4add
//   node scripts/save-cubecobra-draft-records.mjs \
//     b23cdd31-cbbb-4171-a7d8-adf3681d4add ./drafts
//
// Output: one JSON file containing one entry per non-bot seat (seats whose deck
// "was drafted by a bot" are excluded). Each seat entry records, for all of the
// draft's picks, the cards that were in the pack, which card the seat selected,
// the seat's final main deck and sideboard, and assorted draft metadata.
//
// If outFileOrDir names a directory (or ends in "/"), the file is written there
// as <date>-<seatNames-slug>-<draftId>-records.json; otherwise it is treated as
// the exact output path. The default is the current directory.
//
// How each pack is reconstructed: every seat's seats[seat].pickorder lists that
// seat's picks (reverse-chronological, concatenated across packs). Replaying the
// pass rotation across every seat (bots included), the cards still in a pack
// when a given seat picks from it on step k are exactly the cards picked from
// that same pack on steps k onward. Pass direction alternates per pack (the
// convention is pack 1 one way, pack 2 the other, and so on); when Cube Cobra
// includes InitialState[seat][pack].cards (the pack each seat opened) the
// direction is validated against it. Cards carry a Scryfall id (cardID) but no
// name, so names are resolved through Scryfall's bulk collection endpoint.
//
// buildDraftRecords / reconstructSeatPicks are exported for reuse by a future
// cube-wide records script.

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  statSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  BASE,
  parseDraftId,
  fetchText,
  extractReactProps,
  sleep,
} from "./save-cubecobra-draft.mjs";

const SCRYFALL_BASE = "https://api.scryfall.com";
const SCRYFALL_BATCH = 75; // max identifiers per collection request
const SCRYFALL_DELAY_MS = 120; // gap between collection requests (Scryfall asks for >=50-100ms)
const NAME_CACHE_FILE = "cubecobra-card-names.json";

function loadJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

// Flatten Cube Cobra's nested board layout ([row][col][...cardIndices]) into a
// flat list of card indices.
function flattenBoard(board) {
  return Array.isArray(board) ? board.flat(Infinity) : [];
}

// Chronological pick list for a seat. pickorder is reverse-chronological and
// concatenates every pack, so reversing it yields pick 0..(packs*packSize-1).
function chronoPicks(seat) {
  return [...(seat.pickorder ?? [])].reverse();
}

const mod = (a, m) => ((a % m) + m) % m;

// The card indices still in the pack that seat S is looking at on pick k
// (0-based) of pack P, for pass direction dir. The pack S holds on step k was
// opened by seat S - dir*k and is held on step j (>= k) by seat S + dir*(j-k);
// the cards remaining are precisely those picked on steps k..packSize-1. The
// first entry is therefore S's own pick.
function packView(chrono, N, packSize, S, P, k, dir) {
  const remaining = [];
  for (let j = k; j < packSize; j++) {
    remaining.push(chrono[mod(S + dir * (j - k), N)][P * packSize + j]);
  }
  return remaining;
}

// The pack layout (count and size) for a draft. Uses InitialState when present;
// otherwise assumes the standard three equal packs, falling back to one.
function packLayout(draft) {
  if (draft.InitialState?.[0]?.length) {
    return {
      numPacks: draft.InitialState[0].length,
      packSize: draft.InitialState[0][0].cards.length,
    };
  }
  const total = draft.seats?.[0]?.pickorder?.length ?? 0;
  const numPacks = total > 0 && total % 3 === 0 ? 3 : 1;
  return { numPacks, packSize: total / numPacks };
}

// Resolve each pack's pass direction. The convention alternates -1, +1, -1, ...
// When InitialState is present each direction is validated by checking the
// reconstructed full pack equals the pack that seat opened; on disagreement the
// other direction is tried, and an unreconstructable pack throws.
function detectDirections(draft, chrono, N, numPacks, packSize) {
  const hasInitial = Boolean(draft.InitialState?.[0]?.length);
  const dirs = [];
  for (let P = 0; P < numPacks; P++) {
    const convention = P % 2 === 0 ? -1 : 1;
    if (!hasInitial) {
      dirs.push(convention);
      continue;
    }
    let chosen = null;
    for (const dir of [convention, -convention]) {
      let ok = true;
      for (let S = 0; S < N && ok; S++) {
        const opened = new Set(draft.InitialState[S][P].cards);
        const full = packView(chrono, N, packSize, S, P, 0, dir);
        if (full.length !== opened.size || full.some((c) => !opened.has(c))) {
          ok = false;
        }
      }
      if (ok) {
        chosen = dir;
        break;
      }
    }
    if (chosen === null) {
      throw new Error(
        `could not reconstruct pack ${P + 1}: pick data is inconsistent (incomplete draft?)`,
      );
    }
    dirs.push(chosen);
  }
  return dirs;
}

// Build the ordered pick records for one seat, as arrays of card indices.
// Returns [{ pickNumber, pack, pickInPack, packCardIdxs, pickIdx }].
export function reconstructSeatPicks(chrono, N, dirs, packSize, S) {
  const picks = [];
  for (let P = 0; P < dirs.length; P++) {
    for (let k = 0; k < packSize; k++) {
      const packCardIdxs = packView(chrono, N, packSize, S, P, k, dirs[P]);
      picks.push({
        pickNumber: P * packSize + k + 1,
        pack: P + 1,
        pickInPack: k + 1,
        packCardIdxs,
        pickIdx: chrono[S][P * packSize + k],
      });
    }
  }
  return picks;
}

// Resolve Scryfall ids to names, filling and consulting nameCache so each id is
// fetched at most once across the whole run.
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
}

// Fetch one draft and assemble the complete records object for its human seats.
// nameCache (id -> name) is mutated in place; pass {} for a single draft.
export async function buildDraftRecords(draftId, nameCache = {}) {
  const page = await fetchText(`${BASE}/cube/deck/${draftId}?seat=0`);
  const { draft } = extractReactProps(page);
  if (!draft?.seats?.length) throw new Error("no seats found for this draft");

  const N = draft.seats.length;
  const { numPacks, packSize } = packLayout(draft);
  const chrono = draft.seats.map(chronoPicks);
  const dirs = detectDirections(draft, chrono, N, numPacks, packSize);
  const packStateSource = draft.InitialState?.[0]?.length
    ? "initial-state"
    : "convention";

  // Map every card index that appears anywhere to its Scryfall name in one pass.
  const idxToId = (idx) => draft.cards[idx]?.cardID;
  const allIds = draft.cards.map((c) => c?.cardID).filter(Boolean);
  await resolveNames(allIds, nameCache);
  const nameOf = (idx) => {
    const id = idxToId(idx);
    return id ? (nameCache[id] ?? `(unknown ${id})`) : `(card ${idx})`;
  };

  const date = draft.date ? new Date(draft.date).toISOString() : null;
  const seats = [];
  for (let S = 0; S < N; S++) {
    const seat = draft.seats[S];
    if (seat.bot) continue; // exclude decks drafted by a bot
    const picks = reconstructSeatPicks(chrono, N, dirs, packSize, S).map((p) => ({
      pickNumber: p.pickNumber,
      pack: p.pack,
      pickInPack: p.pickInPack,
      pick: nameOf(p.pickIdx),
      pickId: idxToId(p.pickIdx) ?? null,
      packCards: p.packCardIdxs.map(nameOf),
    }));
    seats.push({
      seat: S,
      name: seat.name ?? draft.seatNames?.[S] ?? `seat-${S}`,
      mainboard: flattenBoard(seat.mainboard).map(nameOf),
      sideboard: flattenBoard(seat.sideboard).map(nameOf),
      pool: chrono[S].map(nameOf), // every card this seat picked, chronological
      picks,
    });
  }

  return {
    draftId,
    date,
    name: draft.name ?? null,
    cubeId: draft.cube ?? null,
    type: draft.type ?? null,
    complete: draft.complete ?? null,
    seatCount: N,
    packs: numPacks,
    packSize,
    passDirections: dirs,
    packStateSource,
    seatNames: draft.seatNames ?? null,
    seats,
  };
}

// Decide the output path from the optional second CLI argument.
function resolveOutPath(outArg, records) {
  const date = records.date ? records.date.slice(0, 10) : "draft";
  const defaultName = `${date}-${records.draftId}-records.json`;
  if (!outArg) return resolve(defaultName);
  const isDir =
    outArg.endsWith("/") ||
    (existsSync(outArg) && statSync(outArg).isDirectory());
  if (isDir) {
    mkdirSync(outArg, { recursive: true });
    return resolve(join(outArg, defaultName));
  }
  return resolve(outArg);
}

function usage(msg) {
  if (msg) console.error(`Error: ${msg}\n`);
  console.error(
    "Usage: node scripts/save-cubecobra-draft-records.mjs <deckUrlOrId> [outFileOrDir]",
  );
  process.exit(msg ? 1 : 0);
}

async function main() {
  const [input, outArg] = process.argv.slice(2);
  if (!input || input === "-h" || input === "--help") {
    usage(input ? "" : "missing <deckUrlOrId>");
  }
  const draftId = parseDraftId(input);
  if (!draftId) usage(`could not find a draft id in "${input}"`);

  // Persist resolved names beside the output so repeated runs skip Scryfall.
  const cacheBase = outArg && !outArg.endsWith(".json") ? outArg : ".";
  const nameCacheFile = join(resolve(cacheBase), NAME_CACHE_FILE);
  const nameCache = loadJson(nameCacheFile, {});

  const records = await buildDraftRecords(draftId, nameCache);
  writeFileSync(nameCacheFile, `${JSON.stringify(nameCache, null, 0)}\n`);

  const outPath = resolveOutPath(outArg, records);
  writeFileSync(outPath, `${JSON.stringify(records, null, 2)}\n`);

  const bots = records.seatCount - records.seats.length;
  console.log(
    `Draft ${draftId} (${records.date?.slice(0, 10) ?? "?"}): ` +
      `${records.seats.length} human seat(s)` +
      (bots ? `, ${bots} bot seat(s) excluded` : "") +
      ` -> ${outPath}`,
  );
  for (const s of records.seats) {
    console.log(
      `  seat ${s.seat}: ${s.name} (${s.picks.length} picks, ` +
        `${s.mainboard.length} main / ${s.sideboard.length} side)`,
    );
  }
}

// Run as a CLI only when invoked directly, not when imported.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
  });
}
