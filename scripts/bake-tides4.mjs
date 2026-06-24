// Bake the committed `tides4` artifact the `tides4` pool variant combines into
// draft pools.
//
//   node scripts/bake-tides4.mjs           # writes data/tides4.jsonc + docs/cards2/tides4_decklists.md
//   node scripts/bake-tides4.mjs --out /tmp/tides4.jsonc --doc /tmp/tides4.md
//
// `tides4` is the human-legible counterpart of `sigseed`, built to reproduce the
// run-to-run VARIETY `sigseed` gets from growing each pool from a fresh random
// SUBSET of a Dreamcaller's signature cards. `tides3` bakes only the deterministic
// CENTRE of that variety (one all-signatures pool per Dreamcaller) and so ships
// nearly the same pool every run; `tides4` instead bakes the AXES of the variety
// as separate decks and recombines a random few per run, the way `sigseed`
// recombines a random subset of signature anchors. This bake derives those decks
// from the exact corpus and affinity grower `sigseed` uses:
//
//   1. Build the pick-affinity corpus `sigseed` grows from (`buildSigSeedCorpus`).
//   2. SIGNATURE tides — one per signatured Dreamcaller: its signature cards
//      themselves, at `starterCopies` copies each. This is the always-joined
//      identity floor, standing in for the signature anchors `sigseed` always
//      seeds with.
//   3. FACET tides — a shared library of single-anchor `sigseed` pools, one per
//      selected anchor card. Each facet is the coherent "lean" that one
//      signature-region card grows into. Drawing a random few of a Dreamcaller's
//      facets each run is the direct analogue of `sigseed`'s random signature
//      subset. The facet anchors are chosen from the union of every signatured
//      Dreamcaller's signature cards by per-Dreamcaller round-robin (most-played
//      first), so every Dreamcaller's strongest signature cards become facets and
//      the library stays within `facetBudget` decks.
//   4. NEUTRAL tides — broad, format-spanning decks grown from farthest-point seed
//      cards, the kind of pool `sigseed` reduces to (plain `pickcohere`) for a
//      signatureless Dreamcaller; also the generic tail that tops a pool up.
//   5. tidePoolByDreamcaller — per Dreamcaller, its starter (its signature tide,
//      or null), the on-identity facets a random subset is drawn from, and the
//      broad neutral tail. A signatured Dreamcaller draws its subset from its own
//      on-identity facets; a signatureless Dreamcaller draws from the whole facet
//      library, so each run leans toward a random coherent archetype.
//
// The bake is a pure function of the bundled cards + draft records + signatures
// (no randomness; sorted tie-breaks throughout): re-baking the same inputs yields
// a byte-identical body. Cards are keyed by their stable cards_v2 UUID; `name`
// fields are informational, refreshed at bake time. Run `npm run setup-assets`
// first (it builds the public/ inputs this reads, and afterwards copies the baked
// artifact to public/tides4-data.json for the app).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildPoolData } from "../src/draft/pool/pool-data.ts";
import { growAffinityPoolFromSeeds } from "../src/draft/pool/affinity-grower.ts";
import { buildSigSeedCorpus, SIGSEED } from "../src/draft/pool/variant-sigseed.ts";
import {
  buildSignatureAffinity,
  resolveSignatureToCorpus,
} from "../src/draft/pool/variant-picksig.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// --- Tuning ------------------------------------------------------------------
// The one-stop dial block. Re-bake + `npm run pool-metrics -- --variant tides4`
// (against `--variant sigseed`) after editing.
const TUNING = {
  // Copies in a Dreamcaller's signature (starter) tide — its full-signature
  // `sigseed` pool, grown from all its signature cards at once. This is the dense,
  // on-theme CORE every one of the Dreamcaller's pools is built on (it is exactly
  // `tides3`'s signature tide), always joined; the facets perturb the lean on top
  // of it. Sized below `sigseed`'s 150 so a few facet cards always join, which is
  // where the run-to-run variety comes from.
  starterSize: 110,
  // Copies in a facet tide — one single-anchor `sigseed` pool, the coherent lean
  // one signature-region card grows into. Small, so drawing a random few of them
  // perturbs the starter's lean (the variety engine) without swamping its
  // on-theme core. A few join every pool to top it past `sigseed`'s 150.
  facetSize: 45,
  // How many facet tides to bake (the shared library spanning the signature
  // anchors). Capped so the player-facing deck count stays small.
  facetBudget: 32,
  // The most on-identity facets a signatured Dreamcaller lists (a random subset is
  // drawn from these each run). Wider than the runtime subset size so the subset
  // draw has room for run-to-run variety.
  facetsPerDreamcaller: 8,
  // A facet is on a Dreamcaller's identity when its anchor's normalised signature
  // affinity clears this floor. Keeps a Dreamcaller's facet list on-theme rather
  // than pulling in distant leans.
  facetAffinityFloor: 0.15,
  // Copies in a neutral (broad) tide.
  neutralTideSize: 30,
  // How many neutral tides to bake (the format-spanning decks).
  neutralTideCount: 12,
  // Only cards whose play-rate prior is at least this fraction of the maximum
  // prior are eligible as a neutral tide's farthest-point seed, so neutral decks
  // anchor on genuinely-played cards rather than fringe singletons.
  neutralSeedPriorFloor: 0.25,
};

// The five deck colors, in the canonical order the runtime schema validates
// against (see TIDES4_COLORS in tides4-io.ts).
const DEFAULT_TIDE_COLORS = ["purple", "green", "yellow", "blue", "orange"];

// A deterministic default deck color for a tide, spread across the five colors by
// a stable hash of the tide id. This is only a FLOOR so a freshly-baked artifact
// validates (the runtime schema requires a color); a hand-authored `color`
// annotation always overrides it, so a curator's deliberate colors win.
function defaultTideColor(id) {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return DEFAULT_TIDE_COLORS[h % DEFAULT_TIDE_COLORS.length];
}

/**
 * Read the hand-authored identity annotations (shortName/summary/description)
 * from a previously baked tides4 artifact, keyed by stable tide id. Returns an
 * empty map when the file is absent (a first bake). The artifact is JSONC: the
 * `//` header comments are stripped before parsing.
 */
export function readTideAnnotations(outPath) {
  const map = new Map();
  if (!existsSync(outPath)) return map;
  const body = readFileSync(outPath, "utf8").replace(/^\s*\/\/.*$/gm, "");
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return map;
  }
  for (const tide of parsed.tides ?? []) {
    if (!tide || typeof tide.id !== "string") continue;
    const anno = {};
    for (const key of [
      "shortName",
      "displayName",
      "displayDescription",
      "summary",
      "description",
      "color",
    ]) {
      if (typeof tide[key] === "string" && tide[key] !== "") anno[key] = tide[key];
    }
    // `claims` ({ tribe, mechanics }) anchors a tide's label to its archetype for
    // the annotation consistency gate; preserved across bakes by tide id like the
    // text annotations.
    if (tide.claims && typeof tide.claims === "object") anno.claims = tide.claims;
    if (Object.keys(anno).length > 0) map.set(tide.id, anno);
  }
  return map;
}

function str(argv, flag, fallback) {
  const i = argv.indexOf(flag);
  if (i !== -1 && argv[i + 1] != null) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith(`${flag}=`));
  return eq ? eq.slice(flag.length + 1) : fallback;
}

function num(argv, flag, fallback) {
  const i = argv.indexOf(flag);
  if (i !== -1 && argv[i + 1] != null) return Number(argv[i + 1]);
  const eq = argv.find((a) => a.startsWith(`${flag}=`));
  return eq ? Number(eq.slice(flag.length + 1)) : fallback;
}

// --- Affinity helpers (operate in the corpus's UUID key space) ----------------

// A card's strongest partnership to another card, in either direction (affinity
// rows are normalised per source card). Used for the neutral-seed farthest-point
// spread.
function pairAffinity(corpus, a, b) {
  const fromA = corpus.affinity.get(a)?.get(b) ?? 0;
  const fromB = corpus.affinity.get(b)?.get(a) ?? 0;
  return fromA > fromB ? fromA : fromB;
}

// Choose `count` neutral-tide seed cards by farthest-point sampling: start from
// the highest-prior card, then repeatedly add the eligible card whose nearest
// already-chosen seed is the most distant (1 - affinity). Eligible cards clear a
// play-rate-prior floor so neutral decks anchor on played cards. Deterministic
// ties: higher prior, then id ascending.
function chooseNeutralSeeds(corpus, count, priorFloor) {
  let maxPrior = 0;
  for (const c of corpus.cards) {
    const p = corpus.prior.get(c) ?? 0;
    if (p > maxPrior) maxPrior = p;
  }
  const floor = maxPrior * priorFloor;
  const eligible = corpus.cards
    .filter((c) => (corpus.prior.get(c) ?? 0) >= floor)
    .sort((a, b) => (a < b ? -1 : 1));
  const priorOf = (c) => corpus.prior.get(c) ?? 0;

  let first = eligible[0];
  for (const c of eligible) if (priorOf(c) > priorOf(first)) first = c;
  const seeds = [first];

  while (seeds.length < count && seeds.length < eligible.length) {
    let best = null;
    let bestDist = -Infinity;
    let bestPrior = -Infinity;
    for (const c of eligible) {
      if (seeds.includes(c)) continue;
      let nearest = Infinity;
      for (const s of seeds) {
        const d = 1 - pairAffinity(corpus, c, s);
        if (d < nearest) nearest = d;
      }
      const p = priorOf(c);
      if (
        nearest > bestDist ||
        (nearest === bestDist &&
          (p > bestPrior || (p === bestPrior && best !== null && c < best)))
      ) {
        bestDist = nearest;
        bestPrior = p;
        best = c;
      }
    }
    if (best === null) break;
    seeds.push(best);
  }
  return seeds;
}

// Grow one tide and turn the UUID-keyed counts into `{ id, name, subtype?, text,
// copies }` card entries (id = the corpus UUID key, name from `cardNameById`,
// subtype/text from `detailOf`), ordered by descending copies then by id
// ascending, dropping any key with no current name. `subtype` (the character
// subtype) is informational and omitted when blank; `text` is the rendered rules
// text. These extra fields are for human reading only — the runtime schema
// ignores them.
function growTideCards(corpus, seedKeys, size, nameOf, detailOf) {
  const { counts } = growAffinityPoolFromSeeds(corpus, seedKeys, size, SIGSEED);
  const cards = [];
  for (const [id, copies] of counts) {
    const name = nameOf(id);
    if (name === undefined) continue;
    const detail = detailOf(id) ?? {};
    const entry = { id, name };
    if (detail.subtype) entry.subtype = detail.subtype;
    entry.text = detail.text ?? "";
    entry.copies = copies;
    cards.push(entry);
  }
  cards.sort((a, b) => b.copies - a.copies || (a.id < b.id ? -1 : 1));
  return cards;
}

// Cosine similarity between two tides' card multisets (copies as weights), keyed
// by card id. Used to order a signatured Dreamcaller's broad neutral tail.
function tideCosine(a, b) {
  const va = new Map(a.cards.map((c) => [c.id, c.copies]));
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const v of va.values()) na += v * v;
  for (const c of b.cards) {
    nb += c.copies * c.copies;
    const w = va.get(c.id);
    if (w) dot += w * c.copies;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// Select up to `budget` facet-anchor cards from the per-Dreamcaller resolved
// signature lists by round-robin: in round r, each Dreamcaller (in id order)
// contributes its r-th most-played not-yet-chosen anchor. This guarantees every
// Dreamcaller's strongest signature cards become facets before any Dreamcaller's
// weaker ones, and shared anchors are baked once. Deterministic throughout.
function chooseFacetAnchors(dcAnchors, priorOf, budget) {
  // Each Dreamcaller's anchors, most-played first (tie: id ascending).
  const ranked = dcAnchors.map(({ dcId, keys }) => ({
    dcId,
    keys: [...keys].sort((a, b) => priorOf(b) - priorOf(a) || (a < b ? -1 : 1)),
  }));
  ranked.sort((a, b) => (a.dcId < b.dcId ? -1 : 1));
  const chosen = [];
  const chosenSet = new Set();
  const maxRounds = Math.max(0, ...ranked.map((r) => r.keys.length));
  for (let round = 0; round < maxRounds && chosen.length < budget; round++) {
    for (const r of ranked) {
      if (chosen.length >= budget) break;
      const key = r.keys[round];
      if (key !== undefined && !chosenSet.has(key)) {
        chosen.push(key);
        chosenSet.add(key);
      }
    }
  }
  return chosen;
}

// --- Serialization ------------------------------------------------------------

const HEADER = `// data/tides4.jsonc — the committed tide decks the \`tides4\` draft-pool variant
// combines into draft pools.
//
// GENERATED FILE. Regenerated by \`npm run bake-tides4\` from the bundled cards,
// draft records (public/draft-records-data.json) and Dreamcaller signatures — do
// not hand-edit the JSON body. The human-readable rendering of the same data is
// docs/cards2/tides4_decklists.md.
//
// Player-facing contract: a draft pool is built by combining a few tides — the
// Dreamcaller's signature tide, plus a random subset of its theme (facet) tides,
// shuffled together and topped up with broad tides until there are enough cards,
// then dealing the first 150 (never more than 2 copies of a card). \`tides4\` is
// the human-legible counterpart of \`sigseed\`: each facet tide is a single-anchor
// \`sigseed\` pool, and drawing a random subset of them reproduces the variety
// \`sigseed\` gets from a random signature subset.
//
// Cards are keyed by stable cards_v2 UUID; \`name\` fields are informational,
// refreshed at bake time. Each tide may also carry hand-authored identity
// annotations — \`shortName\` (a 1-3 word mechanical label), \`displayName\` (a
// narrative, thematic name) and \`displayDescription\` (a 10-20 word player-facing
// blurb) for the player-facing tide screens, \`summary\` (one sentence),
// \`description\` (one paragraph), \`color\` (one of the five deck colors:
// purple, green, yellow, blue, orange), and \`claims\` (\`{ tribe, mechanics }\`,
// the archetype the label is built around) — which a re-bake preserves by stable
// tide id. The annotation consistency gate (npm run check-tide-annotations)
// validates \`claims\` against the deck so a label that drifts off its cards fails.
// \`tidePoolByDreamcaller\` is keyed by Dreamcaller UUID; each
// entry has \`starter\` (the always-joined signature tide, or null), \`facets\` (a
// random subset is drawn each run) and \`neutral\` (the broad tail).
//
// Curated card tweaks (designed combos that the affinity grow scatters, one-off
// add/remove) live in data/tides4-overrides.jsonc and are re-applied on every bake.
//
// To update: edit the tuning block in scripts/bake-tides4.mjs or the curated tweaks
// in data/tides4-overrides.jsonc (or let new draft records / signature changes flow
// in), then:
//   npm run bake-tides4       # rewrites this file + the markdown rendering
//   npm run setup-assets      # copies it to public/tides4-data.json
//   npm run pool-metrics -- --variant tides4   # measures it against sigseed`;

// Canonical one-line serialization of a tide's `claims` annotation, e.g.
// `      "claims": {"tribe": "Survivor", "mechanics": ["abandon","figment"]},`.
// Tribe then mechanics, so any authored key order round-trips identically.
function serializeClaims(claims) {
  const parts = [];
  if (typeof claims.tribe === "string") {
    parts.push(`"tribe": ${JSON.stringify(claims.tribe)}`);
  }
  if (Array.isArray(claims.mechanics)) {
    parts.push(`"mechanics": ${JSON.stringify(claims.mechanics)}`);
  }
  return `      "claims": {${parts.join(", ")}},`;
}

export function serializeArtifact(json, header = HEADER) {
  const tideLines = json.tides.map((tide, t) => {
    const cards = tide.cards.map(
      (c, i) =>
        `        ${JSON.stringify(c)}${i < tide.cards.length - 1 ? "," : ""}`,
    );
    // Hand-authored identity annotations (preserved across bakes by tide id) are
    // emitted right after `name` when present, so the deck body stays readable.
    const anno = [];
    for (const key of [
      "shortName",
      "displayName",
      "displayDescription",
      "summary",
      "description",
      "color",
    ]) {
      if (typeof tide[key] === "string" && tide[key] !== "") {
        anno.push(`      ${JSON.stringify(key)}: ${JSON.stringify(tide[key])},`);
      }
    }
    // `claims` ({ tribe, mechanics }) is emitted after the text annotations in a
    // canonical one-line form (tribe then mechanics) so it round-trips byte-for-byte
    // regardless of authored key order.
    if (tide.claims && typeof tide.claims === "object") {
      anno.push(serializeClaims(tide.claims));
    }
    // Provenance UUIDs (preserved across bakes): a signature tide carries the
    // `dreamcallerId` it belongs to, and a facet/neutral tide carries the
    // `leanCardId` it is themed around. Emitted after `role` so the deck body
    // stays last. Cards are referenced only by stable UUID, never by name.
    const provenance = [];
    for (const key of ["dreamcallerId", "leanCardId"]) {
      if (typeof tide[key] === "string" && tide[key] !== "") {
        provenance.push(
          `      ${JSON.stringify(key)}: ${JSON.stringify(tide[key])},`,
        );
      }
    }
    return [
      "    {",
      `      "id": ${JSON.stringify(tide.id)},`,
      `      "name": ${JSON.stringify(tide.name)},`,
      ...anno,
      `      "role": ${JSON.stringify(tide.role)},`,
      ...provenance,
      `      "cards": [`,
      ...cards,
      "      ]",
      `    }${t < json.tides.length - 1 ? "," : ""}`,
    ].join("\n");
  });
  const pools = Object.entries(json.tidePoolByDreamcaller).map(
    ([dc, entry], i, arr) =>
      `    ${JSON.stringify(dc)}: ${JSON.stringify(entry)}${i < arr.length - 1 ? "," : ""}`,
  );
  return (
    [
      header,
      "{",
      `  "version": ${json.version},`,
      `  "tides": [`,
      ...tideLines,
      "  ],",
      `  "tidePoolByDreamcaller": {`,
      ...pools,
      "  }",
      "}",
    ].join("\n") + "\n"
  );
}

function renderMarkdown(json, dreamcallers) {
  const tideById = new Map(json.tides.map((t) => [t.id, t]));
  const dcById = new Map(dreamcallers.map((d) => [d.id, d]));
  const lines = [];
  lines.push("# Tides4 decklists");
  lines.push("");
  lines.push(
    "The preconstructed decks (\"tides\") the `?algo=tides4` draft-pool variant",
    "combines into draft pools. A pool is built by combining a few tides: the",
    "Dreamcaller's signature tide is always joined, a random subset of its theme",
    "(facet) tides is drawn, and broad tides top the pool up; the combined bag is",
    "shuffled and the first 150 cards are dealt (never more than 2 copies of a",
    "card). `tides4` is the human-legible counterpart of `sigseed` — each facet tide",
    "is a single-anchor `sigseed` pool, and drawing a random subset of a",
    "Dreamcaller's facets reproduces the variety `sigseed` gets from growing each",
    "pool from a random subset of its signature cards. A signatureless Dreamcaller",
    "draws its subset from the whole facet library, so each run leans toward a",
    "different coherent archetype.",
    "",
    "GENERATED FILE — regenerated by `npm run bake-tides4` together with",
    "`data/tides4.jsonc` (the machine-readable artifact, keyed by card UUID).",
    "",
  );
  lines.push("## Tide pools by Dreamcaller");
  lines.push("");
  lines.push("| Dreamcaller | Starter | Facets (random subset drawn) | Neutral tail |");
  lines.push("| --- | --- | --- | --- |");
  const nameOfTide = (id) => tideById.get(id)?.name ?? id;
  for (const dc of dreamcallers) {
    const entry = json.tidePoolByDreamcaller[dc.id] ?? {
      starter: null,
      facets: [],
      neutral: [],
    };
    const starter = entry.starter ? nameOfTide(entry.starter) : "(none)";
    const facets =
      entry.facets.length > 4
        ? `${entry.facets.slice(0, 4).map(nameOfTide).join("; ")}; … (${entry.facets.length})`
        : entry.facets.map(nameOfTide).join("; ");
    const neutral =
      entry.neutral.length > 3
        ? `${entry.neutral.length} broad tides`
        : entry.neutral.map(nameOfTide).join("; ");
    lines.push(
      `| ${dc.name} | ${starter} | ${facets || "(none)"} | ${neutral || "(none)"} |`,
    );
  }
  lines.push("");
  for (const tide of json.tides) {
    const copies = tide.cards.reduce((s, c) => s + c.copies, 0);
    const owner = tide.dreamcallerId
      ? dcById.get(tide.dreamcallerId)?.name
      : undefined;
    lines.push(`## ${tide.name}${tide.shortName ? ` — ${tide.shortName}` : ""}`);
    lines.push("");
    lines.push(
      `\`${tide.id}\` — ${tide.role} tide, ${String(tide.cards.length)} distinct cards, ` +
        `${String(copies)} copies` +
        (owner ? `, ${owner}'s signature` : ""),
    );
    lines.push("");
    if (tide.summary) {
      lines.push(`*${tide.summary}*`);
      lines.push("");
    }
    if (tide.description) {
      lines.push(tide.description);
      lines.push("");
    }
    for (const card of tide.cards) {
      lines.push(`- ${String(card.copies)}× ${card.name}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

// --- Manual override layer ----------------------------------------------------
// The affinity grow has no notion of designed multi-card combos, so a combo's
// halves scatter across tides independently. `data/tides4-overrides.jsonc` is the
// curated layer applied AFTER every tide is grown (so it survives each re-bake):
// declarative `comboPairings` keep a combo's two halves together or strip the
// orphaned half, and imperative `tideCardOverrides` add/remove specific cards.

// Strip `//` line comments and `/* */` block comments (and trailing commas) from a
// JSONC document, respecting string literals, before JSON.parse. Tolerant of the
// hand-authored override file's inline `// name` annotations after card UUIDs.
function stripJsonc(text) {
  let out = "";
  let inStr = false;
  let strCh = "";
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (inLine) {
      if (c === "\n") {
        inLine = false;
        out += c;
      }
      continue;
    }
    if (inBlock) {
      if (c === "*" && n === "/") {
        inBlock = false;
        i++;
      }
      continue;
    }
    if (inStr) {
      out += c;
      if (c === "\\") {
        out += n ?? "";
        i++;
        continue;
      }
      if (c === strCh) inStr = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = true;
      strCh = c;
      out += c;
      continue;
    }
    if (c === "/" && n === "/") {
      inLine = true;
      i++;
      continue;
    }
    if (c === "/" && n === "*") {
      inBlock = true;
      i++;
      continue;
    }
    out += c;
  }
  return out.replace(/,(\s*[}\]])/g, "$1");
}

// Read the override document, or null when it is absent (the layer is optional).
export function readOverrides(rel, rootDir = ROOT) {
  const path = resolve(rootDir, rel);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(stripJsonc(readFileSync(path, "utf8")));
  } catch (err) {
    throw new Error(`Failed to parse ${rel}: ${err.message}`);
  }
}

// Build a card entry for an injected card, resolving its current name/detail (same
// shape as `growTideCards`). Bails if the UUID has no current name (a stale id).
function makeCardEntry(id, copies, nameOf, detailOf) {
  const name = nameOf(id);
  if (name === undefined) {
    throw new Error(
      `data/tides4-overrides.jsonc references unknown card UUID ${id} (no current ` +
        `name in cards_v2.toml). Fix or remove that UUID in the overrides file.`,
    );
  }
  const detail = detailOf(id) ?? {};
  const entry = { id, name };
  if (detail.subtype) entry.subtype = detail.subtype;
  entry.text = detail.text ?? "";
  entry.copies = copies;
  return entry;
}

function sortTideCards(tide) {
  tide.cards.sort((a, b) => b.copies - a.copies || (a.id < b.id ? -1 : 1));
}

// Add a card to a tide (or raise its copies if already present). Returns true when
// a new distinct card was introduced.
function addCardToTide(tide, id, copies, nameOf, detailOf) {
  const existing = tide.cards.find((c) => c.id === id);
  if (existing) {
    existing.copies = Math.max(existing.copies, copies);
    return false;
  }
  tide.cards.push(makeCardEntry(id, copies, nameOf, detailOf));
  return true;
}

function removeCardsFromTide(tide, idSet) {
  const before = tide.cards.length;
  tide.cards = tide.cards.filter((c) => !idSet.has(c.id));
  return before - tide.cards.length;
}

// Apply the override layer in place over the grown tides. Deterministic; reports
// every decision through `logger` so a bake's curation is reconstructable from its
// output (pass a noop logger to stay silent, e.g. from the staleness check).
function applyOverrides(tides, overrides, nameOf, detailOf, logger = () => {}) {
  if (!overrides) {
    logger("[overrides] none (data/tides4-overrides.jsonc absent).");
    return;
  }
  const tideById = new Map(tides.map((t) => [t.id, t]));

  // Combo pairings: co-locate each combo's halves in exactly `targetTides` tides
  // and strip the orphaned half everywhere else, so zero tides are a one-half
  // "trap". Ranking and selection are fully deterministic (see the override file).
  for (const pairing of overrides.comboPairings ?? []) {
    const enablers = new Set(pairing.enablers ?? []);
    const payoffs = new Set(pairing.payoffs ?? []);
    const combo = new Set([...enablers, ...payoffs]);
    const target = pairing.targetTides ?? 0;
    const primaryEnabler = pairing.primaryEnabler ?? pairing.enablers?.[0];
    const primaryPayoff = pairing.payoffs?.[0];
    const addCopies = pairing.addCopies ?? 2;

    const distinctIn = (tide, set) => {
      let n = 0;
      const seen = new Set();
      for (const c of tide.cards) {
        if (set.has(c.id) && !seen.has(c.id)) {
          seen.add(c.id);
          n++;
        }
      }
      return n;
    };
    const copiesIn = (tide, set) =>
      tide.cards.reduce((s, c) => (set.has(c.id) ? s + c.copies : s), 0);
    const hasE = (t) => distinctIn(t, enablers) > 0;
    const hasP = (t) => distinctIn(t, payoffs) > 0;

    // Candidate homes = every tide holding either half. Rank: already-both first
    // (least churn), then payoff richness, then payoff copies, then id.
    const candidates = tides
      .filter((t) => hasE(t) || hasP(t))
      .map((t) => ({
        t,
        both: hasE(t) && hasP(t),
        payoffDistinct: distinctIn(t, payoffs),
        payoffCopies: copiesIn(t, payoffs),
      }))
      .sort(
        (a, b) =>
          Number(b.both) - Number(a.both) ||
          b.payoffDistinct - a.payoffDistinct ||
          b.payoffCopies - a.payoffCopies ||
          (a.t.id < b.t.id ? -1 : 1),
      );

    const homes = candidates.slice(0, target).map((x) => x.t);
    const homeIds = new Set(homes.map((t) => t.id));
    if (candidates.length < target) {
      logger(
        `[overrides] combo "${pairing.name}": only ${candidates.length} candidate ` +
          `tides hold a combo half; wanted ${target}. All become homes.`,
      );
    }

    let enablerAdds = 0;
    const promoted = [];
    let strippedTides = 0;
    let strippedCards = 0;
    for (const t of homes) {
      if (!hasE(t) && primaryEnabler) {
        if (addCardToTide(t, primaryEnabler, addCopies, nameOf, detailOf)) {
          enablerAdds++;
          promoted.push(t.id);
        }
        sortTideCards(t);
      }
      // Rare: a home that held only an enabler would itself be a trap; seed a payoff.
      if (!hasP(t) && primaryPayoff) {
        if (addCardToTide(t, primaryPayoff, addCopies, nameOf, detailOf)) {
          sortTideCards(t);
        }
      }
    }
    for (const t of tides) {
      if (homeIds.has(t.id)) continue;
      const removed = removeCardsFromTide(t, combo);
      if (removed > 0) {
        strippedTides++;
        strippedCards += removed;
      }
    }

    logger(
      `[overrides] combo "${pairing.name}": ${homes.length} home tide(s) ` +
        `[${homes.map((t) => t.id).join(", ")}]; added enabler to ${enablerAdds} ` +
        `[${promoted.join(", ") || "none"}]; stripped ${strippedCards} orphaned ` +
        `card(s) from ${strippedTides} tide(s).`,
    );
  }

  // Imperative per-tide tweaks (final word over the pairings above).
  for (const [tideId, ops] of Object.entries(overrides.tideCardOverrides ?? {})) {
    const tide = tideById.get(tideId);
    if (!tide) {
      throw new Error(
        `data/tides4-overrides.jsonc tideCardOverrides references unknown tide id ` +
          `"${tideId}". Valid tide ids are tide-sig-NN / tide-fac-NN / tide-neu-NN ` +
          `as listed in data/tides4.jsonc.`,
      );
    }
    let changed = false;
    if (ops.remove?.length) {
      const removed = removeCardsFromTide(tide, new Set(ops.remove));
      if (removed > 0) changed = true;
    }
    for (const { id, copies } of ops.add ?? []) {
      if (addCardToTide(tide, id, copies ?? 2, nameOf, detailOf)) changed = true;
    }
    if (changed) sortTideCards(tide);
    logger(`[overrides] tideCardOverrides applied to ${tideId}.`);
  }
}

// --- Reusable build API -------------------------------------------------------
// `run()` (the CLI bake) and `scripts/lib/tides4-check.mjs` (the staleness guard)
// share these so the guard re-bakes through the EXACT generator, never a copy.

const BAKE_INPUT_FILES = {
  cards: "public/cards_v2-data.json",
  decklists: "public/decklists-data.json",
  draftRecords: "public/draft-records-data.json",
  dreamcallers: "public/dreamcallers-v2-data.json",
};

// Load the four bundled bake inputs from `public/`. Throws (rather than exiting)
// with a clear remedy when an input is missing, so callers — including the test —
// can surface it.
export function loadBakeInputs(rootDir = ROOT) {
  const out = {};
  for (const [key, rel] of Object.entries(BAKE_INPUT_FILES)) {
    const path = resolve(rootDir, rel);
    if (!existsSync(path)) {
      throw new Error(
        `Missing bake input ${rel}. Run \`npm run setup-assets\` first to build the ` +
          `public assets the tides4 bake reads.`,
      );
    }
    out[key] = JSON.parse(readFileSync(path, "utf8"));
  }
  return out;
}

/**
 * Pure core of the bake: turn the four inputs (+ the optional override layer and
 * the carried-forward annotations) into the serializable `json` plus the richer
 * `tides` array the markdown render needs. No file IO; routes progress/override
 * messages through `logger` (default noop). Throws on bad inputs/overrides.
 */
export function buildTides4({
  cards,
  decklists,
  draftRecords,
  dreamcallers,
  overrides = null,
  priorAnnotations = new Map(),
  logger = () => {},
}) {
  const pickRecords = draftRecords.map((r) => ({ packs: r.packIds, picks: r.pickIds }));
  const poolData = buildPoolData(cards, decklists, pickRecords);
  const corpus = buildSigSeedCorpus(poolData);
  if (!corpus || corpus.cards.length === 0) {
    throw new Error("Empty pick-affinity corpus (no usable draft records).");
  }
  const nameOf = (id) => poolData.cardNameById?.get(id);
  const priorOf = (id) => corpus.prior.get(id) ?? 0;
  // Card subtype + rendered rules text by UUID, for the informational `subtype`
  // and `text` fields on each baked card entry (human reading only).
  const cardDetailById = new Map(
    cards.map((c) => [c.id, { subtype: c.subtype ?? "", text: c.renderedText ?? "" }]),
  );
  const detailOf = (id) => cardDetailById.get(id);
  logger(`Corpus: ${corpus.cards.length} cards from the draft records.`);

  const tides = [];

  // SIGNATURE (starter) tides — one per signatured Dreamcaller: its signature
  // cards at `starterCopies` copies each. Records the resolved anchor keys per
  // Dreamcaller for facet selection and per-Dreamcaller facet ranking.
  const starterByDreamcaller = new Map();
  const anchorsByDreamcaller = new Map(); // dcId -> resolved corpus keys (sorted)
  const noSignal = [];
  let sigIdx = 0;
  for (const dc of dreamcallers) {
    const signature = dc.signatureCardIds ?? [];
    if (signature.length === 0) continue;
    const keys = [...resolveSignatureToCorpus(corpus, signature)].sort();
    if (keys.length === 0) {
      noSignal.push(dc.name);
      continue;
    }
    anchorsByDreamcaller.set(dc.id, keys);
    sigIdx += 1;
    const id = `tide-sig-${String(sigIdx).padStart(2, "0")}`;
    // The starter is the full-signature `sigseed` pool — the dense on-theme core.
    const cardsList = growTideCards(corpus, keys, TUNING.starterSize, nameOf, detailOf);
    tides.push({
      id,
      name: `${dc.name} signature`,
      role: "signature",
      dreamcallerId: dc.id,
      cards: cardsList,
    });
    starterByDreamcaller.set(dc.id, id);
  }

  // FACET tides — a shared library of single-anchor `sigseed` pools. Anchors are
  // chosen from the union of all signatures by per-Dreamcaller round-robin so
  // every Dreamcaller's strongest cards become facets within the budget.
  const dcAnchors = [...anchorsByDreamcaller.entries()].map(([dcId, keys]) => ({
    dcId,
    keys,
  }));
  const facetAnchors = chooseFacetAnchors(dcAnchors, priorOf, TUNING.facetBudget);
  const facetTideByAnchor = new Map();
  facetAnchors.forEach((anchor, i) => {
    const id = `tide-fac-${String(i + 1).padStart(2, "0")}`;
    const cardsList = growTideCards(corpus, [anchor], TUNING.facetSize, nameOf, detailOf);
    tides.push({
      id,
      name: `Lean: ${nameOf(anchor) ?? anchor}`,
      role: "facet",
      anchorKey: anchor,
      // The single signature-region card this facet pool is grown from, by stable
      // UUID. Serialized as `leanCardId` so player-facing and editor screens can
      // show the themed card without re-resolving it from the (non-unique) name.
      leanCardId: anchor,
      cards: cardsList,
    });
    facetTideByAnchor.set(anchor, id);
  });
  const facetTides = tides.filter((t) => t.role === "facet");

  // NEUTRAL tides — broad, format-spanning decks (the `pickcohere`-style pools
  // `sigseed` reduces to for signatureless Dreamcallers, and the generic tail).
  const neutralSeeds = chooseNeutralSeeds(
    corpus,
    TUNING.neutralTideCount,
    TUNING.neutralSeedPriorFloor,
  );
  const neutralTides = [];
  neutralSeeds.forEach((seed, i) => {
    const id = `tide-neu-${String(i + 1).padStart(2, "0")}`;
    const cardsList = growTideCards(corpus, [seed], TUNING.neutralTideSize, nameOf, detailOf);
    const top = cardsList.slice(0, 2).map((c) => c.name).join(" / ");
    // The farthest-point seed this broad pool is grown from, by stable UUID,
    // serialized as `leanCardId` so the editor can feature its themed card.
    const tide = {
      id,
      name: `Broad: ${top}`,
      role: "neutral",
      leanCardId: seed,
      cards: cardsList,
    };
    tides.push(tide);
    neutralTides.push(tide);
  });
  const neutralIds = neutralTides.map((t) => t.id);
  const allFacetIds = facetTides.map((t) => t.id);

  // Manual override layer — applied after every tide is grown (so curated combos
  // survive each affinity re-bake) and before the per-Dreamcaller pools are mapped
  // (so the neutral-tail cosine ordering reflects the final card contents).
  applyOverrides(tides, overrides, nameOf, detailOf, logger);

  // tidePoolByDreamcaller — starter + on-identity facets + broad neutral tail.
  //   * a SIGNATURED Dreamcaller's facets are the library facets whose anchor
  //     clears its signature-affinity floor (always including its own anchors'
  //     facets), most on-theme first, capped at `facetsPerDreamcaller`; its
  //     neutral tail is the broad tides nearest its starter by cosine.
  //   * a SIGNATURELESS Dreamcaller draws its subset from the whole facet library
  //     (so each run leans a random coherent archetype) and its tail is every
  //     broad tide — mirroring how `sigseed` reduces to `pickcohere`.
  const tidePoolByDreamcaller = {};
  const facetById = new Map(facetTides.map((t) => [t.id, t]));
  for (const dc of dreamcallers) {
    const starter = starterByDreamcaller.get(dc.id) ?? null;
    const anchors = anchorsByDreamcaller.get(dc.id);
    if (starter && anchors) {
      const sigAff = buildSignatureAffinity(corpus, dc.signatureCardIds ?? []);
      const ownAnchorSet = new Set(anchors);
      const ranked = facetTides
        .map((t) => ({
          id: t.id,
          // Own-anchor facets sit at affinity 1 (anchors are in the signature
          // set), so they always rank first and are always included.
          aff: sigAff.get(t.anchorKey) ?? 0,
          own: ownAnchorSet.has(t.anchorKey),
        }))
        .filter((x) => x.own || x.aff >= TUNING.facetAffinityFloor)
        .sort((a, b) => b.aff - a.aff || (a.id < b.id ? -1 : 1));
      // Guarantee a non-empty facet list even if the floor excludes everything.
      const facets = (ranked.length > 0 ? ranked : facetTides.map((t) => ({ id: t.id })))
        .slice(0, TUNING.facetsPerDreamcaller)
        .map((x) => x.id);
      const starterTide = tides.find((t) => t.id === starter);
      const neutral = neutralTides
        .map((t) => ({ id: t.id, s: tideCosine(starterTide, t) }))
        .sort((a, b) => b.s - a.s || (a.id < b.id ? -1 : 1))
        .map((x) => x.id);
      tidePoolByDreamcaller[dc.id] = { starter, facets, neutral };
    } else {
      tidePoolByDreamcaller[dc.id] = {
        starter: null,
        facets: [...allFacetIds],
        neutral: [...neutralIds],
      };
    }
  }

  // Color floor: every tide gets a deterministic default deck color so the artifact
  // is valid from its very first bake (the runtime schema requires every tide to
  // carry one of the five deck colors). The hand-authored `color` annotation,
  // carried forward below by stable tide id, OVERRIDES this — so curated colors
  // always win and a fully-annotated artifact (every tide already has a hand color,
  // e.g. data/tides4.jsonc) is left byte-identical by this floor.
  for (const tide of tides) {
    tide.color = defaultTideColor(tide.id);
  }

  // Hand-authored identity annotations (shortName/summary/description/color) are
  // carried forward from the prior bake by stable tide id, so re-baking from fresh
  // draft records keeps the curated text. They describe a tide's mechanical
  // identity; a large content shift for a tide may warrant re-annotating it.
  for (const tide of tides) {
    const anno = priorAnnotations.get(tide.id);
    if (anno) Object.assign(tide, anno);
  }

  // Strip the bake-only `dreamcallerId`/`anchorKey` from the serialized tides (the
  // runtime schema carries id/name/role/cards plus optional annotations); the doc
  // render keeps them.
  const json = {
    version: 1,
    tides: tides.map(
      ({
        id,
        name,
        shortName,
        displayName,
        displayDescription,
        summary,
        description,
        color,
        claims,
        role,
        dreamcallerId,
        leanCardId,
        cards,
      }) => {
      const out = { id, name };
      if (shortName !== undefined) out.shortName = shortName;
      if (displayName !== undefined) out.displayName = displayName;
      if (displayDescription !== undefined) {
        out.displayDescription = displayDescription;
      }
      if (summary !== undefined) out.summary = summary;
      if (description !== undefined) out.description = description;
      if (color !== undefined) out.color = color;
      if (claims !== undefined) out.claims = claims;
      out.role = role;
      // Provenance UUIDs: a signature tide names its Dreamcaller, a facet/neutral
      // tide names the card it is themed around. Both are stable cards_v2/
      // Dreamcaller UUIDs (never names) so a rename never invalidates them.
      if (dreamcallerId !== undefined) out.dreamcallerId = dreamcallerId;
      if (leanCardId !== undefined) out.leanCardId = leanCardId;
      out.cards = cards;
      return out;
    }),
    tidePoolByDreamcaller,
  };

  const sigFacetCounts = [...anchorsByDreamcaller.keys()].map(
    (dcId) => tidePoolByDreamcaller[dcId].facets.length,
  );
  const distinct = new Set();
  for (const t of tides) for (const c of t.cards) distinct.add(c.id);
  const stats = {
    tideCount: tides.length,
    sigCount: tides.filter((t) => t.role === "signature").length,
    facCount: tides.filter((t) => t.role === "facet").length,
    neuCount: tides.filter((t) => t.role === "neutral").length,
    sigFacetCounts,
    distinct: distinct.size,
    corpusCards: corpus.cards.length,
    poolCount: Object.keys(tidePoolByDreamcaller).length,
    noSignal,
  };

  // `tides` (with the bake-only fields) is returned alongside `json` for the
  // markdown render; `json` is what `serializeArtifact` writes.
  return { json, tides, stats };
}

/**
 * Produce the serialized `data/tides4.jsonc` text from the current `public/`
 * inputs and override layer, carrying the annotations forward from
 * `annotationsSource` (the committed artifact). This is exactly what `run()`
 * writes, so the staleness guard compares the committed file against this.
 */
export function bakeArtifactText({
  rootDir = ROOT,
  annotationsSource = resolve(rootDir, "data/tides4.jsonc"),
  logger = () => {},
} = {}) {
  const inputs = loadBakeInputs(rootDir);
  const overrides = readOverrides("data/tides4-overrides.jsonc", rootDir);
  const priorAnnotations = readTideAnnotations(annotationsSource);
  const { json } = buildTides4({ ...inputs, overrides, priorAnnotations, logger });
  return serializeArtifact(json);
}

// --- CLI ----------------------------------------------------------------------

function run() {
  const argv = process.argv.slice(2);
  const outRel = str(argv, "--out", "data/tides4.jsonc");
  const docRel = str(argv, "--doc", "docs/cards2/tides4_decklists.md");
  TUNING.facetSize = num(argv, "--facet-size", TUNING.facetSize);
  TUNING.facetBudget = num(argv, "--facet-budget", TUNING.facetBudget);
  TUNING.neutralTideSize = num(argv, "--neutral-size", TUNING.neutralTideSize);

  const inputs = loadBakeInputs(ROOT);
  const overrides = readOverrides("data/tides4-overrides.jsonc", ROOT);
  // Annotations carry forward from the file being rewritten.
  const priorAnnotations = readTideAnnotations(resolve(ROOT, outRel));
  const { json, tides, stats } = buildTides4({
    ...inputs,
    overrides,
    priorAnnotations,
    logger: (m) => console.log(m),
  });

  writeFileSync(resolve(ROOT, outRel), serializeArtifact(json));
  writeFileSync(
    resolve(ROOT, docRel),
    renderMarkdown({ ...json, tides }, inputs.dreamcallers) + "\n",
  );

  const meanFacets = stats.sigFacetCounts.length
    ? stats.sigFacetCounts.reduce((s, x) => s + x, 0) / stats.sigFacetCounts.length
    : 0;
  console.log(
    `Tides: ${stats.tideCount} (${stats.sigCount} signature, ${stats.facCount} facet, ${stats.neuCount} neutral).`,
  );
  console.log(
    `Facets per signatured Dreamcaller: min ${Math.min(...stats.sigFacetCounts)}, ` +
      `mean ${meanFacets.toFixed(1)}, max ${Math.max(...stats.sigFacetCounts)}.`,
  );
  console.log(
    `Coverage: ${stats.distinct} distinct cards across all tides ` +
      `(corpus has ${stats.corpusCards}).`,
  );
  console.log(
    `Tide pools: ${stats.poolCount} of ${inputs.dreamcallers.length} Dreamcallers.`,
  );
  if (stats.noSignal.length > 0) {
    console.warn(
      `Signatured Dreamcallers with no corpus signature: ${stats.noSignal.join(", ")}.`,
    );
  }
  console.log(`Wrote ${outRel} and ${docRel}.`);
}

// Run the bake only when invoked directly (`node scripts/bake-tides4.mjs`), not
// when imported by the staleness guard or its test.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run();
}
