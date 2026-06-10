// One-off seeder for the curated tide-relationship artifact
// (`data/tides2_relationships.jsonc`) the `tides2` pool variant reads alongside
// the baked tide decks (`data/tides2.jsonc`).
//
//   node scripts/seed-tide-relationships.mjs            # writes if absent
//   node scripts/seed-tide-relationships.mjs --force    # overwrite existing
//
// This is the ONLY place `data/buildaround_support.json` is read. It is run
// once to seed the relationships, after which the file is hand-curated and never
// overwritten by tooling (the routine `npm run bake-tides2` does not touch it).
// Re-run it only on a deliberate tide re-bake, which invalidates curation
// anyway (tide ids/contents change). The script refuses to overwrite an
// existing artifact unless `--force` is passed.
//
// It produces two relationship sets:
//
//   1. ALLIES per tide — the other tides whose cards combine best with it. Each
//      tide is ranked against the others by cosine over their card multisets,
//      then the top allies are trap-repaired against the build-around support
//      metadata: when the pool a lead + a single ally would form leaves one of
//      the pool's build-around payoffs unsupported, the seeder prefers allies
//      that carry that payoff's support, so a player who picks the payoff is not
//      stuck. Every repair is logged.
//
//   2. TIDE POOL per Dreamcaller — the tides its lead is drawn from. Signatured
//      Dreamcallers get the tides most similar to their signature (the same
//      IDF-cosine probe `idf3` finds its anchors with); neutral Dreamcallers get
//      a diverse, representative spread by farthest-point sampling over the tide
//      similarity matrix, rotated per Dreamcaller so each has its own identity.
//
// The seeder is a pure function of its inputs (no randomness; sorted tie-breaks
// throughout), so re-running on the same inputs yields a byte-identical body.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildPoolData } from "../src/draft/pool/pool-data.ts";
import { idfCorpus } from "../src/draft/pool/variant-idf.ts";
import { stripJsonComments } from "./lib/card-refs.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (p) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));
const readJsonc = (p) =>
  JSON.parse(stripJsonComments(readFileSync(resolve(ROOT, p), "utf8")));

function num(argv, flag, fallback) {
  const i = argv.indexOf(flag);
  if (i !== -1 && argv[i + 1] != null) return Number(argv[i + 1]);
  const eq = argv.find((a) => a.startsWith(`${flag}=`));
  return eq ? Number(eq.slice(flag.length + 1)) : fallback;
}
function str(argv, flag, fallback) {
  const i = argv.indexOf(flag);
  if (i !== -1 && argv[i + 1] != null) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith(`${flag}=`));
  return eq ? eq.slice(flag.length + 1) : fallback;
}

// --- Tuning ------------------------------------------------------------------
// Defaults; overridable on the CLI. Re-run + the metric gates after editing.
const TUNING = {
  // Allies baked per tide (the runtime uses 1-3 of them).
  allies: 6,
  // Candidate window the trap repair may pull a supporting ally from: the top
  // this-many tides by cosine to the lead. Wider = more repair power (fewer
  // traps), but allies further from the lead are less coherent. 18 lands the
  // trap metric below 0.5/pool while keeping diversity above idf3.
  repairCandidates: 18,
  // The runtime shuffles this many of a lead's allies into the join order
  // (mirror of TIDES.allyShuffleWindow in variant-tides.ts), so the repair
  // objective simulates exactly that window.
  allyShuffleWindow: 6,
  // Seeds the repair objective averages realized-pool traps over (a faithful,
  // deterministic sample of the runtime's shuffled fill).
  evalSeeds: 24,
  // Tides in a signatured Dreamcaller's tide pool, most signature-similar first.
  poolWidthSignatured: 8,
  // Tides in a neutral Dreamcaller's tide pool (farthest-point spread).
  poolWidthNeutral: 10,
  // Deal size the pool simulation fills to (matches POOL_TARGET_SIZE).
  dealSize: 200,
  // Per-card copy cap (the pool-wide 2-copy rule).
  cap: 2,
};

// Demand-tier -> target support share (mirrors TIER_TARGET in
// pool-metrics.mjs). A payoff's needed theme is a trap when
// its support share is under `trapTau` x this target.
const TIER_TARGET = { 1: 0.1, 2: 0.18, 3: 0.25 };
const TRAP_TAU = 0.35;

// --- Deterministic RNG (mirror of src/draft/pool/rng.ts) ---------------------
// Used only to replay the runtime's shuffled fill inside the repair objective;
// the seeder remains a pure function of its inputs (fixed seeds, no entropy).
function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffleInPlace(rng, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// --- Tide vectors and cosine -------------------------------------------------

// Cosine between two tides over their card-id multisets (copies as weights).
function buildTideVectors(tides) {
  const vec = new Map();
  const norm = new Map();
  for (const t of tides) {
    const m = new Map();
    let sq = 0;
    for (const c of t.cards) {
      m.set(c.id, (m.get(c.id) ?? 0) + c.copies);
    }
    for (const v of m.values()) sq += v * v;
    vec.set(t.id, m);
    norm.set(t.id, Math.sqrt(sq) || 1);
  }
  return { vec, norm };
}

function cosine(vectors, a, b) {
  const va = vectors.vec.get(a);
  const vb = vectors.vec.get(b);
  const [small, large] = va.size <= vb.size ? [va, vb] : [vb, va];
  let dot = 0;
  for (const [c, v] of small) {
    const w = large.get(c);
    if (w) dot += v * w;
  }
  return dot / (vectors.norm.get(a) * vectors.norm.get(b));
}

// Tides ranked by cosine to `leadId`, most similar first (tie-break id asc).
function rankByCosine(vectors, tides, leadId) {
  return tides
    .filter((t) => t.id !== leadId)
    .map((t) => ({ id: t.id, s: cosine(vectors, leadId, t.id) }))
    .sort((a, b) => b.s - a.s || (a.id < b.id ? -1 : 1));
}

// --- Build-around support scoring on a joined-tide pool ----------------------

// The capped pool a set of tides deals: card id -> copies (each card capped at
// `cap`, summed across the joined tides), filling tides in order until the
// dealable count reaches `dealSize`.
function joinedPoolCounts(tideById, joinOrder, dealSize, cap) {
  const counts = new Map();
  let dealable = 0;
  const used = [];
  for (const id of joinOrder) {
    if (dealable >= dealSize) break;
    const tide = tideById.get(id);
    if (!tide) continue;
    used.push(id);
    for (const card of tide.cards) {
      for (let i = 0; i < card.copies; i += 1) {
        const have = counts.get(card.id) ?? 0;
        if (have < cap) {
          counts.set(card.id, have + 1);
          dealable += 1;
        }
      }
    }
  }
  return { counts, used };
}

// Trap cards in a capped pool: build-around payoffs whose best-supportable theme
// sits under TRAP_TAU x its demand target. Mirrors trapCards() in the metric.
function trapCount(counts, supportById) {
  let size = 0;
  for (const v of counts.values()) size += v;
  if (size === 0) return 0;
  // Gross support copies per theme.
  const supportCopies = new Map();
  for (const [id, copies] of counts) {
    const entry = supportById.get(id);
    if (!entry) continue;
    for (const theme of entry.supports ?? []) {
      supportCopies.set(theme, (supportCopies.get(theme) ?? 0) + copies);
    }
  }
  let traps = 0;
  for (const [id, copies] of counts) {
    const entry = supportById.get(id);
    if (!entry || !(entry.needs ?? []).length) continue;
    let bestAdequacy = 0;
    for (const need of entry.needs) {
      const target = TIER_TARGET[need.tier] ?? TIER_TARGET[1];
      const self = (entry.supports ?? []).includes(need.theme) ? copies : 0;
      const sc = (supportCopies.get(need.theme) ?? 0) - self;
      const share = sc / size;
      const adequacy = target > 0 ? Math.min(1, share / target) : 1;
      if (adequacy > bestAdequacy) bestAdequacy = adequacy;
    }
    if (bestAdequacy < TRAP_TAU) traps += 1;
  }
  return traps;
}

// --- Ally selection with trap repair -----------------------------------------

// Replay the runtime fill (variant-tides.ts): shuffle the front
// `allyShuffleWindow` allies, join the lead then allies in that order, then the
// remaining cosine-ranked tides as a stand-in for the breadth-first fallback,
// until the pool is dealable. Returns the realized capped pool's traps.
function realizedTraps(tideById, leadId, allies, fillTail, supportById, tuning, seed) {
  const window = shuffleInPlace(makeRng(seed), allies.slice(0, tuning.allyShuffleWindow));
  const rest = allies.slice(tuning.allyShuffleWindow);
  const order = [leadId, ...window, ...rest, ...fillTail];
  const { counts } = joinedPoolCounts(tideById, order, tuning.dealSize, tuning.cap);
  return trapCount(counts, supportById);
}

// Mean realized traps over `evalSeeds` replays of the runtime's shuffled fill —
// a faithful, deterministic estimate of what the trap metric will report for
// pools led by this tide with this ally list.
function meanRealizedTraps(tideById, leadId, allies, fillTail, supportById, tuning) {
  let total = 0;
  for (let s = 0; s < tuning.evalSeeds; s += 1) {
    total += realizedTraps(tideById, leadId, allies, fillTail, supportById, tuning, s);
  }
  return total / tuning.evalSeeds;
}

// Choose `tuning.allies` allies for a lead from its cosine-ranked candidates,
// repairing toward fewer traps in the realized runtime pool. Greedy: start from
// the cosine top-N, then accept swaps with further candidates that reduce mean
// realized traps; finally order the chosen allies so the lowest-trap ally leads.
// Returns the ordered ally ids plus the repair record.
function chooseAllies(tideById, vectors, tides, leadId, supportById, tuning) {
  const ranked = rankByCosine(vectors, tides, leadId);
  const rankedIds = ranked.map((r) => r.id);
  const candidates = rankedIds.slice(0, tuning.repairCandidates);
  const cosOf = new Map(ranked.map((r) => [r.id, r.s]));
  // Fill tail used only when the chosen allies cannot fill the pool: the
  // remaining tides in cosine order (a stand-in for the runtime breadth-first
  // fallback, which rarely fires once the lead plus an ally or two fills 200).
  const tail = (chosen) => rankedIds.filter((id) => !chosen.includes(id));

  let chosen = candidates.slice(0, tuning.allies);
  const baseline = meanRealizedTraps(
    tideById, leadId, chosen, tail(chosen), supportById, tuning,
  );
  let current = baseline;

  // Try swapping each chosen ally with each unused candidate; keep swaps that
  // lower the objective (tie-break: prefer the higher-cosine candidate).
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < chosen.length; i += 1) {
      for (const cand of candidates) {
        if (chosen.includes(cand)) continue;
        const trial = chosen.slice();
        trial[i] = cand;
        const score = meanRealizedTraps(
          tideById, leadId, trial, tail(trial), supportById, tuning,
        );
        const better =
          score < current - 1e-9 ||
          (Math.abs(score - current) <= 1e-9 &&
            (cosOf.get(cand) ?? 0) > (cosOf.get(chosen[i]) ?? 0));
        if (better) {
          chosen = trial;
          current = score;
          improved = true;
        }
      }
    }
  }

  // Order the chosen allies so the one yielding the fewest traps as the first
  // joined ally leads (tie-break by cosine desc, then id asc) — the runtime
  // shuffles this window, but a better front still lowers the mean.
  const tl = tail(chosen);
  const allyScore = (a) => {
    const order = [leadId, a, ...chosen.filter((x) => x !== a), ...tl];
    const { counts } = joinedPoolCounts(tideById, order, tuning.dealSize, tuning.cap);
    return trapCount(counts, supportById);
  };
  const ordered = chosen
    .map((id) => ({ id, traps: allyScore(id), cos: cosOf.get(id) ?? 0 }))
    .sort((a, b) => a.traps - b.traps || b.cos - a.cos || (a.id < b.id ? -1 : 1))
    .map((x) => x.id);

  return {
    allies: ordered,
    baselineTraps: baseline,
    repairedTraps: current,
    repaired: current < baseline - 1e-9,
  };
}

// --- Dreamcaller tide pools --------------------------------------------------

// IDF-cosine of a signature probe (card names) against a tide's card multiset
// (copies weight the tide vector) — the same probe bake-tides uses for favored.
function probeTideCosine(probeNames, tide, idfOf) {
  let probeSq = 0;
  for (const c of probeNames) probeSq += idfOf(c) ** 2;
  const probeNorm = Math.sqrt(probeSq);
  let tideSq = 0;
  let dot = 0;
  for (const { name, copies } of tide.cards) {
    const w = idfOf(name) * copies;
    tideSq += w * w;
    if (probeNames.has(name)) dot += idfOf(name) ** 2 * copies;
  }
  const tideNorm = Math.sqrt(tideSq);
  if (probeNorm === 0 || tideNorm === 0) return 0;
  return dot / (probeNorm * tideNorm);
}

// A diverse, representative spread of tides by farthest-point sampling over the
// tide similarity matrix, beginning from `startId` and greedily adding the tide
// least similar to the chosen set, until `width` tides are chosen.
function farthestPointPool(vectors, tides, startId, width) {
  const ids = tides.map((t) => t.id);
  const chosen = [startId];
  while (chosen.length < width && chosen.length < ids.length) {
    let next = null;
    let nextScore = Infinity;
    for (const id of ids) {
      if (chosen.includes(id)) continue;
      // Distance to the chosen set = max similarity to any chosen tide (we want
      // to add the tide whose nearest chosen neighbour is farthest away, i.e.
      // the smallest max-similarity).
      let nearest = -Infinity;
      for (const c of chosen) nearest = Math.max(nearest, cosine(vectors, id, c));
      if (nearest < nextScore || (nearest === nextScore && (next === null || id < next))) {
        nextScore = nearest;
        next = id;
      }
    }
    if (next === null) break;
    chosen.push(next);
  }
  return chosen;
}

// --- Serialization -----------------------------------------------------------

function header(tideCount) {
  return `// data/tides2_relationships.jsonc — curated relationships the \`tides2\`
// draft-pool variant reads alongside the baked tide decks (data/tides2.jsonc).
//
// SEEDED ONCE by \`node scripts/seed-tide-relationships.mjs\` from the current
// tides2 decks, decklist corpus, Dreamcaller signatures, and the build-around
// support metadata, then HAND-CURATED. The routine \`npm run bake-tides2\` does
// NOT touch this file. Re-seed it only on a deliberate tide re-bake (\`--force\`),
// which changes tide ids/contents and so invalidates this curation; the runtime
// validation throws on any tide id here that names no tide in data/tides2.jsonc,
// so a stale combination cannot ship silently.
//
// \`alliesByTide\`: per tide id (all ${tideCount}), its ordered allied-tide ids,
// best first — the decks that combine well with it; a pool fills from this list.
// \`tidePoolByDreamcaller\`: per Dreamcaller UUID, the tides its lead is drawn
// from.
//
// After editing data/tides2.jsonc:
//   node scripts/seed-tide-relationships.mjs --force   # re-seed, then re-curate
//   npm run setup-assets                               # copies it to public/`;
}

function serialize(json, tideCount) {
  const allyLines = Object.entries(json.alliesByTide).map(
    ([id, allies], i, arr) =>
      `    ${JSON.stringify(id)}: ${JSON.stringify(allies)}${i < arr.length - 1 ? "," : ""}`,
  );
  const poolLines = Object.entries(json.tidePoolByDreamcaller).map(
    ([id, pool], i, arr) =>
      `    ${JSON.stringify(id)}: ${JSON.stringify(pool)}${i < arr.length - 1 ? "," : ""}`,
  );
  return (
    [
      header(tideCount),
      "{",
      `  "version": ${json.version},`,
      `  "alliesByTide": {`,
      ...allyLines,
      "  },",
      `  "tidePoolByDreamcaller": {`,
      ...poolLines,
      "  }",
      "}",
    ].join("\n") + "\n"
  );
}

// --- Doc rendering -----------------------------------------------------------

// Must match RELATIONSHIPS_MARKER in scripts/bake-tides.mjs: the line the baked
// `tides2` decklists doc ends with, after which the relationship tables go.
const RELATIONSHIPS_MARKER =
  "<!-- relationships appended by seed-tide-relationships -->";

// Append the allied-tides and Dreamcaller-tide-pool tables to the rendered
// `tides2` decklists doc, replacing anything after the marker so re-running is
// idempotent. Leaves the doc untouched if it has no marker (e.g. not yet baked).
function appendRelationshipsDoc(docPath, json, tideById, dreamcallers) {
  if (!existsSync(docPath)) return false;
  const original = readFileSync(docPath, "utf8");
  const idx = original.indexOf(RELATIONSHIPS_MARKER);
  if (idx === -1) return false;
  const head = original.slice(0, idx + RELATIONSHIPS_MARKER.length);
  const nameOf = (id) => tideById.get(id)?.name ?? id;
  const lines = ["", ""];
  lines.push("## Allied tides", "");
  lines.push("| Tide | Allied tides (best first) |");
  lines.push("| --- | --- |");
  for (const [id, allies] of Object.entries(json.alliesByTide)) {
    const label = `${id} — ${nameOf(id)}`;
    const allyLabels = allies.map((a) => `${a} (${nameOf(a)})`).join("; ");
    lines.push(`| ${label} | ${allyLabels || "(none)"} |`);
  }
  lines.push("", "## Tide pools by Dreamcaller", "");
  lines.push("| Dreamcaller | Tide pool (lead drawn from) |");
  lines.push("| --- | --- |");
  for (const dc of dreamcallers) {
    const pool = json.tidePoolByDreamcaller[dc.id] ?? [];
    const labels = pool.map((id) => nameOf(id)).join("; ");
    lines.push(`| ${dc.name} | ${labels || "(none)"} |`);
  }
  writeFileSync(docPath, head + lines.join("\n") + "\n");
  return true;
}

// --- Main --------------------------------------------------------------------

function run() {
  const argv = process.argv.slice(2);
  const tidesRel = str(argv, "--tides", "data/tides2.jsonc");
  const outRel = str(argv, "--out", "data/tides2_relationships.jsonc");
  const docRel = str(argv, "--doc", "docs/cards2/tides2_decklists.md");
  const force = argv.includes("--force");
  const tuning = {
    ...TUNING,
    allies: num(argv, "--allies", TUNING.allies),
    repairCandidates: num(argv, "--repair-candidates", TUNING.repairCandidates),
    poolWidthSignatured: num(argv, "--pool-signatured", TUNING.poolWidthSignatured),
    poolWidthNeutral: num(argv, "--pool-neutral", TUNING.poolWidthNeutral),
  };

  const outPath = resolve(ROOT, outRel);
  if (existsSync(outPath) && !force) {
    console.error(
      `${outRel} already exists. It is hand-curated after seeding; pass --force ` +
        `to overwrite (only on a deliberate tide re-bake).`,
    );
    process.exit(1);
  }

  const cards = readJson("public/cards_v2-data.json");
  const decklists = readJson("public/decklists-data.json");
  const dreamcallers = readJson("public/dreamcallers-v2-data.json");
  const tideData = readJsonc(tidesRel);
  const buildaround = readJson("data/buildaround_support.json");

  const tides = tideData.tides;
  const tideById = new Map(tides.map((t) => [t.id, t]));
  const supportById = new Map(Object.entries(buildaround.cards ?? {}));

  const poolData = buildPoolData(cards, decklists);
  const corpus = idfCorpus(poolData);
  if (!corpus) {
    console.error("No usable decklists in public/decklists-data.json.");
    process.exit(1);
  }
  const idfOf = (c) => corpus.idf.get(c) ?? 0;

  const vectors = buildTideVectors(tides);

  // 1. Allies per tide, with trap repair.
  const alliesByTide = {};
  const repairLog = [];
  let totalBaseline = 0;
  let totalRepaired = 0;
  for (const tide of tides) {
    const res = chooseAllies(tideById, vectors, tides, tide.id, supportById, tuning);
    alliesByTide[tide.id] = res.allies;
    totalBaseline += res.baselineTraps;
    totalRepaired += res.repairedTraps;
    if (res.repaired) {
      repairLog.push({
        tide: tide.id,
        name: tide.name,
        baseline: res.baselineTraps.toFixed(2),
        repaired: res.repairedTraps.toFixed(2),
      });
    }
  }

  // 2. Tide pool per Dreamcaller.
  const tidePoolByDreamcaller = {};
  let signaturedCount = 0;
  let neutralCount = 0;
  for (const dc of dreamcallers) {
    const signature = dc.signatureCards ?? [];
    const probeNames = new Set(signature.filter((c) => idfOf(c) > 0));
    if (probeNames.size > 0) {
      const scored = tides
        .map((tide) => ({ id: tide.id, score: probeTideCosine(probeNames, tide, idfOf) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1))
        .slice(0, tuning.poolWidthSignatured);
      if (scored.length > 0) {
        tidePoolByDreamcaller[dc.id] = scored.map((x) => x.id);
        signaturedCount += 1;
        continue;
      }
    }
    // Neutral: a diverse spread, rotating the start tide per neutral index so
    // each neutral Dreamcaller has its own (overlapping) identity.
    const startId = tides[neutralCount % tides.length].id;
    tidePoolByDreamcaller[dc.id] = farthestPointPool(
      vectors, tides, startId, tuning.poolWidthNeutral,
    );
    neutralCount += 1;
  }

  const json = { version: 1, alliesByTide, tidePoolByDreamcaller };
  writeFileSync(outPath, serialize(json, tides.length));
  const docWritten = appendRelationshipsDoc(
    resolve(ROOT, docRel), json, tideById, dreamcallers,
  );

  // Stats.
  const allyCounts = Object.values(alliesByTide).map((a) => a.length);
  const meanAllies = allyCounts.reduce((s, x) => s + x, 0) / allyCounts.length;
  console.log(`Wrote ${outRel}.`);
  if (docWritten) console.log(`Appended relationship tables to ${docRel}.`);
  console.log(`Tides: ${tides.length}, mean allies ${meanAllies.toFixed(1)}.`);
  console.log(
    `Dreamcaller tide pools: ${signaturedCount} signatured (width ${tuning.poolWidthSignatured}), ` +
      `${neutralCount} neutral (width ${tuning.poolWidthNeutral}).`,
  );
  console.log(
    `Trap repair: mean traps per lead+ally ${(totalBaseline / tides.length).toFixed(2)} -> ` +
      `${(totalRepaired / tides.length).toFixed(2)} across ${tides.length} leads ` +
      `(${repairLog.length} leads repaired).`,
  );
  for (const r of repairLog) {
    console.log(`  ${r.tide} (${r.name}): ${r.baseline} -> ${r.repaired} traps`);
  }
}

run();
