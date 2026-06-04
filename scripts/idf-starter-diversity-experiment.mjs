// Experiment: does biasing the `idf` STARTER draw toward low-density decks make
// you stop drawing the SAME ARCHETYPE of pool over and over ("oh, spirit animals
// again")?
//
// The `idf` algorithm picks one real decklist UNIFORMLY at random and grows a
// pool around it by IDF-cosine similarity. Pool growth is fully DETERMINISTIC
// given the starter (the starter draw is the only randomness), so each starter
// maps to exactly one pool, and the *archetype* of that pool is the starter's
// content cluster. The corpus is lopsided: popular archetypes have many
// near-duplicate decks, fringe ones a handful. A uniform starter draw therefore
// lands in the big clusters far more often -- so you keep getting the same kind
// of pool.
//
// Candidate fix (purely mechanical, reads nothing but the decklists -- no labels,
// colors, or tides): weight the starter draw by inverse neighbour-density. For
// deck i,
//     P(pick i) proportional to 1 / (signal(i)) ^ beta
// where signal(i) measures how crowded i's neighbourhood is. beta = 0 reproduces
// today's uniform draw; larger beta flattens cluster occupancy.
//
// Metrics are about ARCHETYPE repetition, derived mechanically by clustering the
// corpus on content (cosine >= tau):
//   collision  P(two generated pools are the same archetype) -- LOWER = you see
//              repeats less often. (Simpson index of cluster occupancy.)
//   effArch    1 / collision: effective number of distinct archetypes you draw
//              from -- HIGHER is better.
//   maxShare   expected fraction of pools that are the single most common
//              archetype -- LOWER is better.
//   cohesion   mean starter->folded-deck IDF-cosine, a coherence guard: push the
//              bias too hard and pools stop being built from similar decks.
//
// It does NOT trust prose. It re-ports the `idf` corpus + builder and proves the
// re-port reproduces the REAL generatePoolFromData('idf') BIT-FOR-BIT at beta=0.
//
// Run: node scripts/idf-starter-diversity-experiment.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildPoolData, generatePoolFromData } from "../src/draft/pool/index.ts";

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
const { decks } = corpus;
const N = decks.length;

const cosine = (a, b) => {
  const [small, large] = a.cards.size <= b.cards.size ? [a, b] : [b, a];
  let dot = 0;
  for (const c of small.cards) if (large.cards.has(c)) dot += idfOf(c) ** 2;
  return dot / (a.norm * b.norm);
};

// === One O(n^2) pass: full similarity, neighbour-density signals, adjacency ===
// softDensity[i] = sum of pairwise cosine (smooth KDE; compressed distribution)
// twins[tau][i]  = count of decks j with cosine(i,j) >= tau (skewed; counts
//                  near-duplicates -- the lopsidedness we want to flatten)
const CLUSTER_TAU = 0.5; // two decks are "the same archetype" at/above this cosine
const TWIN_TAUS = [0.3, 0.5];
const sim = Array.from({ length: N }, () => new Float64Array(N));
const softDensity = new Float64Array(N);
const twins = new Map(TWIN_TAUS.map((t) => [t, new Float64Array(N)]));
for (let i = 0; i < N; i++) {
  for (let j = i + 1; j < N; j++) {
    const s = cosine(decks[i], decks[j]);
    sim[i][j] = s;
    sim[j][i] = s;
    softDensity[i] += s;
    softDensity[j] += s;
    for (const t of TWIN_TAUS) {
      if (s >= t) {
        twins.get(t)[i] += 1;
        twins.get(t)[j] += 1;
      }
    }
  }
}

// === Mechanical archetype clusters (leader clustering at CLUSTER_TAU) =========
// Deterministic and content-only: process decks by descending twin-count; each
// still-unassigned deck founds a cluster and claims every unassigned deck within
// CLUSTER_TAU of it. The biggest clusters are the over-represented archetypes.
const order = [...Array(N).keys()].sort(
  (a, b) => twins.get(CLUSTER_TAU)[b] - twins.get(CLUSTER_TAU)[a] || a - b,
);
const clusterOf = new Int32Array(N).fill(-1);
let nClusters = 0;
for (const i of order) {
  if (clusterOf[i] !== -1) continue;
  const c = nClusters++;
  clusterOf[i] = c;
  for (let j = 0; j < N; j++) {
    if (clusterOf[j] === -1 && sim[i][j] >= CLUSTER_TAU) clusterOf[j] = c;
  }
}
const clusterSizes = new Array(nClusters).fill(0);
for (let i = 0; i < N; i++) clusterSizes[clusterOf[i]]++;
const sortedSizes = [...clusterSizes].sort((a, b) => b - a);
console.log(
  `Corpus: ${N} decks -> ${nClusters} content clusters at cosine>=${CLUSTER_TAU}.`,
);
console.log(
  `  Largest clusters (deck counts): ${sortedSizes.slice(0, 8).join(", ")}, ...`,
);
console.log(
  `  Singletons: ${sortedSizes.filter((s) => s === 1).length}  (of ${nClusters})\n`,
);

// === Per-starter deterministic pool: cohesion (growth is RNG-free) ============
function poolCohesion(startIdx) {
  const starter = decks[startIdx];
  const ranked = decks
    .map((d, i) => ({ d, i }))
    .filter((x) => x.i !== startIdx)
    .map((x) => ({ d: x.d, s: sim[startIdx][x.i] }))
    .sort((a, b) => b.s - a.s);
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
  let bestSize = size;
  let bestK = 0;
  const sims = [];
  let k = 0;
  for (const { d, s } of ranked) {
    size += unionInto(pool, d.cards);
    sims.push(s);
    k++;
    if (
      Math.abs(size - IDF.targetSize) < Math.abs(bestSize - IDF.targetSize) ||
      (Math.abs(size - IDF.targetSize) === Math.abs(bestSize - IDF.targetSize) &&
        size > bestSize)
    ) {
      bestSize = size;
      bestK = k;
    }
    if (size >= high) break;
  }
  let sum = 0;
  for (let t = 0; t < bestK; t++) sum += sims[t];
  return bestK > 0 ? sum / bestK : 0;
}
const cohesionOf = new Float64Array(N);
for (let i = 0; i < N; i++) cohesionOf[i] = poolCohesion(i);

// === Step 1: prove the re-port reproduces the oracle bit-for-bit at beta=0 ====
// At beta=0 the starter is the production uniform draw, so the pool must match.
function buildPoolUniform(seed) {
  const rng = makeRng(seed);
  const startIdx = Math.floor(rng() * N);
  const starter = decks[startIdx];
  const ranked = decks
    .map((d, i) => ({ d, i }))
    .filter((x) => x.i !== startIdx)
    .map((x) => ({ d: x.d, s: sim[startIdx][x.i] }))
    .sort((a, b) => b.s - a.s);
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
  for (const { d } of ranked) {
    size += unionInto(pool, d.cards);
    if (
      Math.abs(size - IDF.targetSize) < Math.abs(best.size - IDF.targetSize) ||
      (Math.abs(size - IDF.targetSize) === Math.abs(best.size - IDF.targetSize) &&
        size > best.size)
    ) {
      best = { counts: new Map(pool), size };
    }
    if (size >= high) break;
  }
  return best.counts;
}
const ORACLE_SEEDS = [1, 2, 7, 13, 42, 99, 100, 256, 1000, 31337];
const poolKey = (counts) =>
  [...counts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([c, v]) => `${c}:${v}`).join("|");
let oracleOk = true;
for (const seed of ORACLE_SEEDS) {
  const oracle = generatePoolFromData(poolData, seed, undefined, "idf");
  if (poolKey(oracle.counts) !== poolKey(buildPoolUniform(seed))) oracleOk = false;
}
console.log(`Oracle reproduction at beta=0: ${oracleOk ? "PASS (bit-for-bit)" : "FAIL"}  over ${ORACLE_SEEDS.length} seeds\n`);

// === Step 2: sweep schemes x beta; metrics are EXACT (analytic over weights) ==
// Because growth is deterministic, the only thing beta changes is the sampling
// distribution w over starters. Every metric below is an exact weighted sum over
// that distribution -- no Monte Carlo noise.
function metrics(weights) {
  let total = 0;
  for (const w of weights) total += w;
  const w = weights.map((x) => x / total);

  // Cluster occupancy -> Simpson collision, effective archetypes, max share.
  const occ = new Array(nClusters).fill(0);
  for (let i = 0; i < N; i++) occ[clusterOf[i]] += w[i];
  let collision = 0;
  let maxShare = 0;
  for (const o of occ) {
    collision += o * o;
    if (o > maxShare) maxShare = o;
  }
  const effArch = 1 / collision;

  // Coherence guard: expected starter->folded-deck cosine.
  let cohesion = 0;
  for (let i = 0; i < N; i++) cohesion += w[i] * cohesionOf[i];

  return { collision, effArch, maxShare, cohesion };
}

const schemes = [
  { name: "soft-KDE", signal: softDensity },
  ...TWIN_TAUS.map((t) => ({ name: `twins>=${t}`, signal: twins.get(t).map((c) => 1 + c) })),
];
const BETAS = [0.25, 0.5, 1.0, 2.0];
const EPS = 1e-9;

const widths = [12, 7, 12, 9, 10, 10];
const fmtRow = (cells) => cells.map((c, i) => String(c).padStart(widths[i])).join("");
console.log(fmtRow(["scheme", "beta", "collision", "effArch", "maxShare", "cohesion"]));

// Baseline: uniform (beta=0) is identical for every scheme.
const base = metrics(new Array(N).fill(1));
console.log(
  fmtRow([
    "(uniform)",
    "0.00",
    base.collision.toFixed(4),
    base.effArch.toFixed(1),
    base.maxShare.toFixed(4),
    base.cohesion.toFixed(3),
  ]),
);
for (const scheme of schemes) {
  for (const beta of BETAS) {
    const weights = Array.from(scheme.signal, (s) => 1 / (s + EPS) ** beta);
    const m = metrics(weights);
    console.log(
      fmtRow([
        scheme.name,
        beta.toFixed(2),
        m.collision.toFixed(4),
        m.effArch.toFixed(1),
        m.maxShare.toFixed(4),
        m.cohesion.toFixed(3),
      ]),
    );
  }
}

console.log(`
Legend (exact, over the full corpus -- not Monte Carlo):
  collision  P(two generated pools are the same archetype cluster). LOWER = you
             see the same kind of pool less often. This is the metric for "spirit
             animals again".
  effArch    1 / collision: effective number of distinct archetypes you draw
             from. HIGHER is better. (Uniform draws from a small effective set
             because big clusters dominate.)
  maxShare   expected fraction of pools that are the single most common
             archetype. LOWER is better.
  cohesion   mean starter->folded-deck IDF-cosine. Coherence guard: if this
             collapses, the bias is starting pools from decks with no real
             neighbours, so the pools stop being coherent.`);
