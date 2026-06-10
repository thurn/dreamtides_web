// Measure how similar one pool algorithm's output is to another's — built to
// answer "how close do `tides` pools come to `idf3` pools?" across the real
// draft distribution (every Dreamcaller with its full signature, many seeds).
//
//   node scripts/tides-similarity-experiment.mjs                # tides vs idf3
//   node scripts/tides-similarity-experiment.mjs --a tides --b idf3
//   node scripts/tides-similarity-experiment.mjs --seeds 100
//   node scripts/tides-similarity-experiment.mjs --dreamcaller "Kell Tarn"
//   node scripts/tides-similarity-experiment.mjs --json > result.json
//
// Per-seed pools can never match card-for-card (both algorithms are
// stochastic), so similarity is DISTRIBUTIONAL, per Dreamcaller:
//
// 1) FREQUENCY SIMILARITY (the headline). For each algorithm, the per-card
//    expected copies per pool f(c) = mean over seeds of that card's capped
//    copies. The cosine between the two algorithms' f-vectors says whether
//    they put the same cards in the same proportions in front of the same
//    Dreamcaller.
// 2) SELF-SIMILARITY CEILING. Algorithm B (idf3) is itself random across
//    seeds: split B's seeds into two halves and take the cosine between the
//    halves' f-vectors. That is the score a perfect mimic of B would get, so
//    the normalized headline is mean( min(1, cosine / ceiling) ).
// 3) BEST-MATCH JACCARD (pool level). For each A pool, the best Jaccard
//    overlap (distinct-card sets) against any B pool, and vice versa —
//    read against B's own within-algorithm best-match baseline.
// 4) SHAPE. Mean pool copies, distinct cards, doubled cards, and the
//    cross-seed distinct-card coverage per algorithm — pool-variety
//    differences (e.g. an algorithm dealing the same cards every run) show up
//    here as a coverage gap.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  buildPoolData,
  generatePoolFromData,
  isPoolVariant,
  validateTideDecks,
  validateTideRelationships,
} from "../src/draft/pool/index.ts";
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

const DEFAULT_SEEDS = 50;
const POOL_TARGET_SIZE = 200;

function loadContext(argv) {
  const cards = readJson("public/cards_v2-data.json");
  const decklists = readJson("public/decklists-data.json");
  const draftRecords = readJson("public/draft-records-data.json");
  let dreamcallers = readJson("public/dreamcallers-v2-data.json");

  const dcFilter = str(argv, "--dreamcaller", null);
  if (dcFilter) {
    const q = dcFilter.toLowerCase();
    dreamcallers = dreamcallers.filter(
      (d) => d.id === dcFilter || d.name.toLowerCase() === q,
    );
    if (!dreamcallers.length) {
      console.error(`No Dreamcaller matches "${dcFilter}".`);
      process.exit(1);
    }
  }
  const pickRecords =
    Array.isArray(draftRecords) && draftRecords.length
      ? draftRecords.map((r) => ({ packs: r.packIds, picks: r.pickIds }))
      : undefined;
  const poolData = buildPoolData(cards, decklists, pickRecords);
  if (existsSync(resolve(ROOT, "data/tides.jsonc"))) {
    poolData.tideDecks = validateTideDecks(readJsonc("data/tides.jsonc"));
  }
  if (existsSync(resolve(ROOT, "data/tides2.jsonc"))) {
    poolData.tides2Decks = validateTideDecks(readJsonc("data/tides2.jsonc"));
    if (existsSync(resolve(ROOT, "data/tides2_relationships.jsonc"))) {
      const tideIds = new Set(poolData.tides2Decks.tides.map((t) => t.id));
      poolData.tides2Relationships = validateTideRelationships(
        readJsonc("data/tides2_relationships.jsonc"),
        tideIds,
      );
    }
  }
  return { dreamcallers, poolData };
}

// One pool's capped per-card copies, as a Map card -> copies (1 or 2).
function generateCounts(ctx, variant, dc, seed, poolSize) {
  const pool = generatePoolFromData(
    ctx.poolData,
    seed >>> 0,
    undefined,
    variant,
    undefined,
    poolSize,
    dc.signatureCards ?? [],
    dc.id,
  );
  return pool.counts;
}

// Mean per-card copies across a list of pools (the frequency vector f).
function frequencyVector(pools) {
  const f = new Map();
  for (const counts of pools) {
    for (const [card, copies] of counts) f.set(card, (f.get(card) ?? 0) + copies);
  }
  for (const [card, total] of f) f.set(card, total / pools.length);
  return f;
}

function cosine(a, b) {
  let dot = 0;
  let aa = 0;
  let bb = 0;
  for (const v of a.values()) aa += v * v;
  for (const v of b.values()) bb += v * v;
  for (const [card, v] of a) {
    const w = b.get(card);
    if (w !== undefined) dot += v * w;
  }
  const denom = Math.sqrt(aa) * Math.sqrt(bb);
  return denom === 0 ? 0 : dot / denom;
}

function pearson(a, b) {
  const cards = new Set([...a.keys(), ...b.keys()]);
  const n = cards.size;
  if (n === 0) return 0;
  let sa = 0;
  let sb = 0;
  for (const c of cards) {
    sa += a.get(c) ?? 0;
    sb += b.get(c) ?? 0;
  }
  const ma = sa / n;
  const mb = sb / n;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (const c of cards) {
    const da = (a.get(c) ?? 0) - ma;
    const db = (b.get(c) ?? 0) - mb;
    cov += da * db;
    va += da * da;
    vb += db * db;
  }
  const denom = Math.sqrt(va) * Math.sqrt(vb);
  return denom === 0 ? 0 : cov / denom;
}

function jaccard(aSet, bSet) {
  let inter = 0;
  for (const c of aSet) if (bSet.has(c)) inter += 1;
  const union = aSet.size + bSet.size - inter;
  return union === 0 ? 0 : inter / union;
}

// Mean over A's pools of the best Jaccard against pools in B (excluding, for
// the within-baseline case, the pool itself by index).
function meanBestJaccard(aSets, bSets, excludeSameIndex) {
  let total = 0;
  for (let i = 0; i < aSets.length; i++) {
    let best = 0;
    for (let j = 0; j < bSets.length; j++) {
      if (excludeSameIndex && i === j) continue;
      const v = jaccard(aSets[i], bSets[j]);
      if (v > best) best = v;
    }
    total += best;
  }
  return aSets.length === 0 ? 0 : total / aSets.length;
}

function shapeStats(pools) {
  const sizes = [];
  const distincts = [];
  const doubled = [];
  const coverage = new Set();
  for (const counts of pools) {
    let size = 0;
    let dbl = 0;
    for (const [card, copies] of counts) {
      size += copies;
      if (copies >= 2) dbl += 1;
      coverage.add(card);
    }
    sizes.push(size);
    distincts.push(counts.size);
    doubled.push(dbl);
  }
  const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  return {
    meanCopies: mean(sizes),
    meanDistinct: mean(distincts),
    meanDoubled: mean(doubled),
    coverage: coverage.size,
  };
}

function evaluateDreamcaller(ctx, dc, { variantA, variantB, seeds, poolSize }) {
  const poolsA = [];
  const poolsB = [];
  for (let seed = 0; seed < seeds; seed++) {
    poolsA.push(generateCounts(ctx, variantA, dc, seed, poolSize));
    poolsB.push(generateCounts(ctx, variantB, dc, seed, poolSize));
  }

  const fA = frequencyVector(poolsA);
  const fB = frequencyVector(poolsB);
  const rawCosine = cosine(fA, fB);
  const r = pearson(fA, fB);

  // B's self-similarity ceiling: cosine between the two half-split frequency
  // vectors (what a perfect mimic of B would score against B).
  const half = Math.floor(poolsB.length / 2);
  const ceiling = cosine(
    frequencyVector(poolsB.slice(0, half)),
    frequencyVector(poolsB.slice(half)),
  );
  const normalized = ceiling > 0 ? Math.min(1, rawCosine / ceiling) : 0;

  const setsA = poolsA.map((c) => new Set(c.keys()));
  const setsB = poolsB.map((c) => new Set(c.keys()));
  const bestJaccardAB =
    (meanBestJaccard(setsA, setsB, false) + meanBestJaccard(setsB, setsA, false)) / 2;
  const baselineBB = meanBestJaccard(setsB, setsB, true);

  return {
    name: dc.name,
    steered: (dc.signatureCards ?? []).length > 0,
    rawCosine,
    ceiling,
    normalized,
    pearson: r,
    bestJaccardAB,
    baselineBB,
    shapeA: shapeStats(poolsA),
    shapeB: shapeStats(poolsB),
  };
}

function fmt(x, digits = 3) {
  return x.toFixed(digits);
}

function run() {
  const argv = process.argv.slice(2);
  const variantA = str(argv, "--a", "tides");
  const variantB = str(argv, "--b", "idf3");
  for (const v of [variantA, variantB]) {
    if (!isPoolVariant(v)) {
      console.error(`Unknown pool variant "${v}".`);
      process.exit(1);
    }
  }
  const seeds = num(argv, "--seeds", DEFAULT_SEEDS);
  const poolSize = num(argv, "--pool-size", POOL_TARGET_SIZE);
  const top = num(argv, "--top", 5);
  const asJson = argv.includes("--json");

  const ctx = loadContext(argv);
  const rows = ctx.dreamcallers.map((dc) =>
    evaluateDreamcaller(ctx, dc, { variantA, variantB, seeds, poolSize }),
  );

  const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  const summary = {
    variantA,
    variantB,
    seeds,
    poolSize,
    dreamcallers: rows.length,
    meanRawCosine: mean(rows.map((r) => r.rawCosine)),
    meanCeiling: mean(rows.map((r) => r.ceiling)),
    headlineNormalized: mean(rows.map((r) => r.normalized)),
    meanPearson: mean(rows.map((r) => r.pearson)),
    meanBestJaccard: mean(rows.map((r) => r.bestJaccardAB)),
    meanBaselineJaccard: mean(rows.map((r) => r.baselineBB)),
    shapeA: {
      meanCopies: mean(rows.map((r) => r.shapeA.meanCopies)),
      meanDistinct: mean(rows.map((r) => r.shapeA.meanDistinct)),
      meanDoubled: mean(rows.map((r) => r.shapeA.meanDoubled)),
      meanCoverage: mean(rows.map((r) => r.shapeA.coverage)),
    },
    shapeB: {
      meanCopies: mean(rows.map((r) => r.shapeB.meanCopies)),
      meanDistinct: mean(rows.map((r) => r.shapeB.meanDistinct)),
      meanDoubled: mean(rows.map((r) => r.shapeB.meanDoubled)),
      meanCoverage: mean(rows.map((r) => r.shapeB.coverage)),
    },
  };

  if (asJson) {
    console.log(JSON.stringify({ summary, rows }, null, 2));
    return;
  }

  console.log(
    `Similarity: ${variantA} vs ${variantB} ` +
      `(${rows.length} Dreamcallers x ${seeds} seeds, pool ${poolSize})`,
  );
  console.log("");
  console.log(
    "  dreamcaller          cosine  ceiling  norm   pearson  bestJac  jacBase",
  );
  for (const row of [...rows].sort((a, b) => a.normalized - b.normalized)) {
    console.log(
      `  ${row.name.padEnd(20)} ${fmt(row.rawCosine)}   ${fmt(row.ceiling)}    ` +
        `${fmt(row.normalized, 2)}   ${fmt(row.pearson)}    ${fmt(row.bestJaccardAB)}    ${fmt(row.baselineBB)}` +
        (row.steered ? "" : "   (neutral)"),
    );
  }
  console.log("");
  const worst = [...rows].sort((a, b) => a.normalized - b.normalized).slice(0, top);
  console.log(`Worst ${String(worst.length)} by normalized similarity:`);
  for (const row of worst) {
    console.log(`  ${row.name}: norm ${fmt(row.normalized, 2)} (raw ${fmt(row.rawCosine)})`);
  }
  console.log("");
  console.log("Summary:");
  console.log(
    `  frequency cosine    raw ${fmt(summary.meanRawCosine)} / ceiling ${fmt(summary.meanCeiling)}` +
      `  ->  normalized headline ${fmt(summary.headlineNormalized * 100, 1)}`,
  );
  console.log(`  pearson r           ${fmt(summary.meanPearson)}`);
  console.log(
    `  best-match jaccard  ${fmt(summary.meanBestJaccard)} (within-${variantB} baseline ${fmt(summary.meanBaselineJaccard)})`,
  );
  const sa = summary.shapeA;
  const sb = summary.shapeB;
  console.log(
    `  shape ${variantA.padEnd(8)}      copies ${fmt(sa.meanCopies, 1)}, distinct ${fmt(sa.meanDistinct, 1)}, ` +
      `doubled ${fmt(sa.meanDoubled, 1)}, coverage ${fmt(sa.meanCoverage, 1)}`,
  );
  console.log(
    `  shape ${variantB.padEnd(8)}      copies ${fmt(sb.meanCopies, 1)}, distinct ${fmt(sb.meanDistinct, 1)}, ` +
      `doubled ${fmt(sb.meanDoubled, 1)}, coverage ${fmt(sb.meanCoverage, 1)}`,
  );
}

run();
