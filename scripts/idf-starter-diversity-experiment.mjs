// Experiment: does biasing the `idf` STARTER draw toward low-density decks make
// generated pools less repetitive, without breaking per-pool coherence?
//
// The `idf` algorithm picks one real decklist UNIFORMLY at random and grows a
// pool around it by IDF-cosine similarity. The corpus is lopsided: popular
// archetypes have many near-duplicate decks, fringe archetypes a handful. So a
// uniform starter draw lands in the big clusters far more often, and those
// clusters' cards turn up in almost every pool -- the "over-represented" feel.
//
// Candidate fix (purely mechanical, reads nothing but the decklists): weight the
// starter draw by inverse neighbour-density. For deck i,
//     density(i) = sum over j != i of cosine_idf(i, j)        // soft KDE
//     P(pick i) proportional to 1 / (density(i) + eps) ^ beta
// beta = 0 reproduces today's uniform draw; larger beta flattens cluster mass.
//
// This file does NOT trust prose. It re-ports the `idf` corpus + builder, proves
// the re-port reproduces the REAL generatePoolFromData('idf') BIT-FOR-BIT at
// beta = 0, then sweeps beta and reports diversity / coherence metrics across a
// fixed seed list.
//
// Run: node scripts/idf-starter-diversity-experiment.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildPoolData, generatePoolFromData } from "../src/draft_test/color-pool.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (p) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));

const cards = readJson("public/cards_v2-data.json");
const decklistsData = readJson("public/decklists-data.json");
const poolData = buildPoolData(cards, decklistsData);

// --- IDF tuning, copied verbatim from the IDF block in color-pool.ts ----------
const IDF = {
  targetSize: 100,
  targetTolerance: 10,
  cap: 2,
  idfPower: 1,
  minDf: 1,
  maxDfFrac: 1,
  minDeckSize: 16,
  maxDeckSize: 34,
};

// makeRng copied verbatim from color-pool.ts (so beta = 0 matches the oracle).
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

// === Re-ported IDF corpus (mirrors idfCorpus in color-pool.ts) ===============
function buildCorpus() {
  const source = poolData.decklists;
  const filtered = source
    .map((d) => new Set(d))
    .filter((s) => s.size >= IDF.minDeckSize && s.size <= IDF.maxDeckSize);
  const n = filtered.length;
  const df = new Map();
  for (const s of filtered) for (const c of s) df.set(c, (df.get(c) ?? 0) + 1);
  const maxDf = IDF.maxDfFrac * n;
  const idf = new Map();
  for (const [c, d] of df) {
    if (d < IDF.minDf || d > maxDf) {
      idf.set(c, 0);
      continue;
    }
    idf.set(c, Math.log((n + 1) / d) ** IDF.idfPower);
  }
  const decks = filtered.map((cardsSet) => {
    let sq = 0;
    for (const c of cardsSet) {
      const w = idf.get(c) ?? 0;
      sq += w * w;
    }
    return { cards: cardsSet, norm: Math.sqrt(sq) || 1 };
  });
  return { decks, idf };
}
const corpus = buildCorpus();
const idfOf = (c) => corpus.idf.get(c) ?? 0;

const cosine = (a, b) => {
  const [small, large] = a.cards.size <= b.cards.size ? [a, b] : [b, a];
  let dot = 0;
  for (const c of small.cards) if (large.cards.has(c)) dot += idfOf(c) ** 2;
  return dot / (a.norm * b.norm);
};

// Precompute neighbour-density signals for every deck, in one O(n^2 * deckSize)
// pass:
//   softDensity[i]  = sum of pairwise cosine (a smooth KDE; compressed)
//   twins[tau][i]   = number of decks j with cosine(i,j) >= tau (skewed; counts
//                     near-duplicates, which is what the lopsided corpus has)
const { decks } = corpus;
const TAUS = [0.3, 0.5, 0.7];
const softDensity = decks.map(() => 0);
const twins = new Map(TAUS.map((t) => [t, decks.map(() => 0)]));
for (let i = 0; i < decks.length; i++) {
  for (let j = i + 1; j < decks.length; j++) {
    const s = cosine(decks[i], decks[j]);
    softDensity[i] += s;
    softDensity[j] += s;
    for (const t of TAUS) {
      if (s >= t) {
        twins.get(t)[i] += 1;
        twins.get(t)[j] += 1;
      }
    }
  }
}

// Report the corpus skew the bias is meant to counter: how many near-twins decks
// have at each tau. A long right tail = big near-duplicate clusters.
function describe(arr) {
  const v = arr.slice().sort((a, b) => a - b);
  const q = (p) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
  const mean = v.reduce((s, x) => s + x, 0) / v.length;
  return `mean ${mean.toFixed(1)}  median ${q(0.5)}  p90 ${q(0.9)}  p99 ${q(0.99)}  max ${v[v.length - 1]}`;
}
console.log("Near-twin counts per deck (the lopsidedness the bias targets):");
for (const t of TAUS) console.log(`  cosine>=${t}: ${describe(twins.get(t))}`);
console.log("");

// `density` is the active starter-bias signal; default to the soft KDE, override
// per-scheme below.
let density = softDensity;

// === Re-ported IDF pool builder, parameterised by starter weighting ==========
// beta = 0 must reproduce the production uniform draw exactly, so beta = 0 uses
// the identical `Math.floor(rng() * decks.length)`; beta > 0 uses an
// inverse-density weighted pick (one rng() draw, same as the uniform draw).
const EPS = 1e-6;
function pickStarter(rng, beta) {
  if (beta === 0) return Math.floor(rng() * decks.length);
  const weights = density.map((d) => 1 / (d + EPS) ** beta);
  let total = 0;
  for (const w of weights) total += w;
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

function buildPool(seed, beta) {
  const rng = makeRng(seed);
  const startIdx = pickStarter(rng, beta);
  const starter = decks[startIdx];

  const ranked = decks
    .map((d, i) => ({ d, i }))
    .filter((x) => x.i !== startIdx)
    .map((x) => ({ d: x.d, sim: cosine(starter, x.d) }))
    .sort((a, b) => b.sim - a.sim);

  const high = IDF.targetSize + IDF.targetTolerance;
  const unionInto = (pool, cardsSet) => {
    let added = 0;
    for (const c of cardsSet) {
      const have = pool.get(c) ?? 0;
      if (have >= IDF.cap) continue;
      pool.set(c, have + 1);
      added += 1;
    }
    return added;
  };
  const pool = new Map();
  let size = unionInto(pool, starter.cards);
  let best = { counts: new Map(pool), size };
  // Track the decks actually folded into `best` for the coherence metric.
  let foldedSims = [];
  let bestFolded = [];
  for (const { d, sim } of ranked) {
    size += unionInto(pool, d.cards);
    foldedSims.push(sim);
    if (
      Math.abs(size - IDF.targetSize) < Math.abs(best.size - IDF.targetSize) ||
      (Math.abs(size - IDF.targetSize) === Math.abs(best.size - IDF.targetSize) &&
        size > best.size)
    ) {
      best = { counts: new Map(pool), size };
      bestFolded = foldedSims.slice();
    }
    if (size >= high) break;
  }
  return { startIdx, counts: best.counts, foldedSims: bestFolded };
}

// === Step 1: prove the re-port reproduces the oracle bit-for-bit at beta = 0 ==
const ORACLE_SEEDS = [1, 2, 7, 13, 42, 99, 100, 256, 1000, 31337];
function poolKey(counts) {
  return [...counts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([c, v]) => `${c}:${v}`).join("|");
}
let oracleOk = true;
for (const seed of ORACLE_SEEDS) {
  const oracle = generatePoolFromData(poolData, seed, undefined, "idf");
  const mine = buildPool(seed, 0);
  // The oracle caps at 2 downstream; IDF.cap is already 2, so counts match.
  if (poolKey(oracle.counts) !== poolKey(mine.counts)) {
    oracleOk = false;
    console.log(`  MISMATCH at seed ${seed}: oracle size ${oracle.counts.size} vs mine ${mine.counts.size}`);
  }
}
console.log(`Oracle reproduction at beta=0: ${oracleOk ? "PASS (bit-for-bit)" : "FAIL"}  over ${ORACLE_SEEDS.length} seeds`);
console.log(`Corpus: ${decks.length} decks after [${IDF.minDeckSize},${IDF.maxDeckSize}] filter\n`);

// === Step 2: sweep beta and report diversity + coherence metrics =============
const N_SEEDS = 400;
const SEEDS = Array.from({ length: N_SEEDS }, (_, i) => (i + 1) * 2654435761 >>> 0);
const BETAS = [0, 0.25, 0.5, 1.0, 2.0];

function gini(values) {
  // Gini coefficient of the per-card appearance-count distribution. 0 = perfectly
  // even (every surfaced card appears equally often), 1 = all mass on one card.
  const v = values.slice().sort((a, b) => a - b);
  const n = v.length;
  if (n === 0) return 0;
  let cum = 0;
  let weighted = 0;
  for (let i = 0; i < n; i++) {
    cum += v[i];
    weighted += cum;
  }
  const total = cum;
  if (total === 0) return 0;
  return (n + 1 - (2 * weighted) / total) / n;
}

// Schemes: each supplies the per-deck density signal the inverse weight divides.
// For the twin schemes we use (1 + count) so a deck with zero near-twins is the
// loneliest, not a divide-by-zero.
const schemes = [
  { name: "soft-KDE", signal: softDensity },
  ...TAUS.map((t) => ({ name: `twins>=${t}`, signal: twins.get(t).map((c) => 1 + c) })),
];

const header = ["scheme", "beta", "distinct", "gini", "meanJac", "topShare", "cohesion", "starterSig"];
const widths = [12, 7, 10, 8, 9, 10, 10, 11];
const fmtRow = (cells) => cells.map((c, i) => String(c).padStart(widths[i])).join("");
console.log(fmtRow(header));
for (const scheme of schemes) {
  density = scheme.signal;
  for (const beta of BETAS) {
  if (beta === 0 && scheme !== schemes[0]) continue; // beta=0 is identical for all schemes
  const pools = SEEDS.map((s) => buildPool(s, beta));
  const uniqueSets = pools.map((p) => new Set(p.counts.keys()));

  // Diversity: how much of the card universe surfaces, and how evenly.
  const freq = new Map(); // card -> number of pools containing it
  for (const set of uniqueSets) for (const c of set) freq.set(c, (freq.get(c) ?? 0) + 1);
  const distinct = freq.size;
  const g = gini([...freq.values()]);
  const topShare = Math.max(...freq.values()) / N_SEEDS;

  // Repetitiveness: mean pairwise Jaccard of unique-card sets (lower = more varied).
  let jacSum = 0;
  let jacPairs = 0;
  for (let i = 0; i < uniqueSets.length; i++) {
    for (let j = i + 1; j < uniqueSets.length; j++) {
      const a = uniqueSets[i];
      const b = uniqueSets[j];
      let inter = 0;
      for (const k of a) if (b.has(k)) inter++;
      jacSum += inter / (a.size + b.size - inter || 1);
      jacPairs++;
    }
  }
  const meanJac = jacSum / jacPairs;

  // Coherence: mean IDF-cosine of the starter to the decks folded into the pool
  // (higher = the pool is built from genuinely similar decks). And the mean
  // density of the chosen starters (a sanity check that bias picks lonelier decks).
  let cohSum = 0;
  let cohCount = 0;
  let densSum = 0;
  for (const p of pools) {
    for (const s of p.foldedSims) {
      cohSum += s;
      cohCount++;
    }
    densSum += density[p.startIdx];
  }
  const cohesion = cohSum / cohCount;
  const starterDens = densSum / pools.length;

  console.log(
    fmtRow([
      beta === 0 ? "(uniform)" : scheme.name,
      beta.toFixed(2),
      distinct,
      g.toFixed(3),
      meanJac.toFixed(3),
      topShare.toFixed(3),
      cohesion.toFixed(3),
      starterDens.toFixed(2),
    ]),
  );
  }
}

console.log(`
Legend (over ${N_SEEDS} generated pools per beta):
  distinct    distinct cards that surfaced across all pools (higher = more of the
              universe seen)
  gini        evenness of per-card appearance counts (lower = flatter, less
              over-representation)
  meanJac     mean pairwise Jaccard of pools' unique-card sets (lower = pools
              differ more, less repetitive)
  topShare    fraction of pools containing the single most-common card
              (lower = no card dominates)
  cohesion    mean starter->folded-deck IDF-cosine (higher = pools still built
              from similar decks; watch this stay flat as a coherence guard)
  starterDens mean neighbour-density of the chosen starters (drops as beta rises,
              confirming the bias picks lonelier decks)`);
