// Experiment: how should a Dreamcaller "signature" (a few card names -- the only
// new data) steer the idf STARTER draw so the pool MATCHES the Dreamcaller
// WITHOUT collapsing onto a handful of decks?
//
// `idf2` picks the starter by inverse near-twin weight and ignores the
// Dreamcaller entirely, so its pools are broad but off-identity. We want to bias
// the starter toward the Dreamcaller's decks while still spreading across the
// many decks that fit it. There are two ORTHOGONAL design axes:
//   affinity  -- how a deck's fit to the signature is scored
//       literal : IDF-weighted overlap with the literal signature cards (SPARSE
//                 -- most good decks contain none of your handful of cards)
//       anchor  : IDF-cosine to the best-matching real deck(s) (DENSE -- a full
//                 ~25-card anchor is shared by the whole archetype)
//   weighting -- how affinity enters the single starter draw
//       prop   : multiply the idf2 weight by affinity^alpha (couples match+spread)
//       capped : same, but saturate affinity at a cap first (a SOFT gate)
//       gated  : keep only decks above a similarity threshold, draw idf2 WITHIN
// The four corners of the spectrum are
//   A   = literal + prop      A'  = anchor + prop
//   A'' = anchor  + capped    B   = anchor + gated
// This script settles A vs A' vs A'' vs B on data.
//
// CLEAN-ROOM BOUNDARY. The ALGORITHM under test reads only a list of card names
// (the signature) -- no colors, tides, archetypes, themes. The EXPERIMENT alone
// uses the real archetype labels (recovered from the docs/drafts_dt filenames,
// exactly as the merged experiment does) for two jobs the algorithm never sees:
//   1. DERIVE a realistic signature -- the most distinctive recurring cards of a
//      Dreamcaller's labeled decks (centroid x idf), a stand-in for what a
//      designer would hand-author.
//   2. SCORE "did we land on the Dreamcaller's decks" (onIdentity / spread).
// onIdentity is mildly circular (the signature came from the true decks), so the
// HELD-OUT recall breaks it: steer on HALF the signature, measure whether the
// OTHER half -- cards we never steered on -- shows up in the grown pool.
//
// Growth is RNG-free given the starter, so every metric here is EXACT: an
// analytic weighted sum over the starter distribution, not Monte Carlo. The only
// seeded step is the bit-for-bit PROOF that the re-ported corpus + idf2 starter
// draw reproduces the real generatePoolFromData('idf2').
//
// Run: node scripts/idf3-signature-experiment.mjs

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  buildPoolData,
  generatePoolFromData,
} from "../src/draft/pool/index.ts";
import { mapsFromCards, readCorpusDeckNames } from "./lib/card-refs.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (p) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));

const cards = readJson("public/cards_v2-data.json");
const decklistsData = readJson("public/decklists-data.json");
const dreamcallers = readJson("public/dreamcallers-v2-data.json");
const poolData = buildPoolData(cards, decklistsData);

// IDF tuning, copied verbatim from the IDF block in variant-idf.ts.
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
// idf2 starter-draw tuning, copied verbatim from variant-idf2.ts.
const IDF2 = { twinTau: 0.5, diversityBeta: 0.5 };

// Experiment knobs.
const K_SIG = 5; // signature size for the main A/A'/A''/B comparison
const M_ANCHOR = 3; // top-m decks taken as anchors (covers a multi-modal identity)
const EPS = 0.05; // affinity floor for the proportional schemes (retain a soft idf2 floor)
const MIN_TRUE = 8; // skip Dreamcallers with fewer labeled decks (no spread to measure)

// makeRng copied verbatim from color-pool/rng.ts (so the proof matches the oracle).
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

const COLORS = "wubrg";
function colorPrefix(name) {
  const head = name.split("-")[0];
  const isColors = head.length > 0 && [...head].every((c) => COLORS.includes(c));
  return isColors ? head : "";
}

// === Recover archetype labels, index-aligned with decklists-data.json =========
// setup-assets.mjs builds decklists-data.json from `readdirSync().sort()`, keeping
// the non-empty known-card lines of each file and pushing one entry per file with
// >= 1 such line. We replay that EXACT walk so labels[i] is the filename
// archetype label of decklistsData[i]. Labels that are a bare color (`ur`) or
// colorless (`c-...`) name no archetype and are nulled.
const FILE_RE =
  /^\d{4}-\d{2}-\d{2}-(.+)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const cardMaps = mapsFromCards(cards);
const draftsDir = resolve(ROOT, "docs/drafts_dt");
const labels = [];
for (const file of readdirSync(draftsDir).sort()) {
  if (!file.endsWith(".txt")) continue;
  const lines = readCorpusDeckNames(resolve(draftsDir, file), cardMaps);
  if (lines.length === 0) continue;
  const m = FILE_RE.exec(file.replace(/\.txt$/u, ""));
  let label = m ? m[1] : null;
  if (label && (colorPrefix(label) === "" || label === colorPrefix(label)))
    label = null;
  labels.push(label);
}
if (labels.length !== decklistsData.length) {
  throw new Error(
    `label/deck misalignment: ${labels.length} labels vs ${decklistsData.length} decklists ` +
      `(docs/drafts_dt walk diverged from setup-assets.mjs)`,
  );
}

// === Re-ported IDF corpus over the size-filtered decklists (mirrors idfCorpus) =
const rawDecks = decklistsData.map((d, i) => ({
  cards: new Set(d),
  label: labels[i],
}));
const filtered = rawDecks.filter(
  (x) => x.cards.size >= IDF.minDeckSize && x.cards.size <= IDF.maxDeckSize,
);
const N = filtered.length;
const df = new Map();
for (const x of filtered) for (const c of x.cards) df.set(c, (df.get(c) ?? 0) + 1);
const maxDf = IDF.maxDfFrac * N;
const idf = new Map();
for (const [c, d] of df)
  idf.set(c, d < IDF.minDf || d > maxDf ? 0 : Math.log((N + 1) / d) ** IDF.idfPower);
const idfOf = (c) => idf.get(c) ?? 0;
const decks = filtered.map((x) => {
  let sq = 0;
  for (const c of x.cards) sq += idfOf(c) ** 2;
  return { cards: x.cards, label: x.label, norm: Math.sqrt(sq) || 1 };
});
const labelOf = decks.map((d) => d.label);

const cosine = (a, b) => {
  const [small, large] = a.cards.size <= b.cards.size ? [a, b] : [b, a];
  let dot = 0;
  for (const c of small.cards) if (large.cards.has(c)) dot += idfOf(c) ** 2;
  return dot / (a.norm * b.norm);
};

// === One O(n^2) pass: similarity matrix + idf2 near-twin counts (tau=0.5) ======
const sim = Array.from({ length: N }, () => new Float64Array(N));
const twins = new Float64Array(N);
for (let i = 0; i < N; i++) {
  for (let j = i + 1; j < N; j++) {
    const s = cosine(decks[i], decks[j]);
    sim[i][j] = s;
    sim[j][i] = s;
    if (s >= IDF2.twinTau) {
      twins[i] += 1;
      twins[j] += 1;
    }
  }
}
// idf2's starter factor: 1 / (1 + nearTwins)^beta.
const div = new Float64Array(N);
for (let i = 0; i < N; i++) div[i] = 1 / (1 + twins[i]) ** IDF2.diversityBeta;

// === Per-starter deterministic grown pool: cards + cohesion (mirrors growIdfPool)
// Growth is RNG-free, and depends ONLY on the starter (not the signature), so we
// grow every deck's pool ONCE and reuse it for all Dreamcallers and schemes.
function growFrom(startIdx) {
  const starter = decks[startIdx];
  const ranked = decks
    .map((d, i) => i)
    .filter((i) => i !== startIdx)
    .map((i) => ({ i, s: sim[startIdx][i] }))
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
  let best = { counts: new Map(pool), size, k: 0 };
  const sims = [];
  let k = 0;
  for (const { i, s } of ranked) {
    size += unionInto(pool, decks[i].cards);
    sims.push(s);
    k += 1;
    if (
      Math.abs(size - IDF.targetSize) < Math.abs(best.size - IDF.targetSize) ||
      (Math.abs(size - IDF.targetSize) === Math.abs(best.size - IDF.targetSize) &&
        size > best.size)
    ) {
      best = { counts: new Map(pool), size, k };
    }
    if (size >= high) break;
  }
  let cs = 0;
  for (let t = 0; t < best.k; t++) cs += sims[t];
  return {
    counts: best.counts,
    cards: new Set(best.counts.keys()),
    cohesion: best.k > 0 ? cs / best.k : 0,
  };
}
const poolCardsOf = [];
const cohesionOf = new Float64Array(N);
for (let i = 0; i < N; i++) {
  const g = growFrom(i);
  poolCardsOf.push(g.cards);
  cohesionOf[i] = g.cohesion;
}

console.log(
  `Corpus: ${N} labeled decks (size in [${IDF.minDeckSize},${IDF.maxDeckSize}]), ` +
    `${[...new Set(labelOf.filter(Boolean))].length} distinct archetype labels.\n`,
);

// === Step 1: prove the re-port reproduces the real idf2 oracle bit-for-bit =====
function idf2Starter(seed) {
  const rng = makeRng(seed);
  let total = 0;
  for (let i = 0; i < N; i++) total += div[i];
  let r = rng() * total;
  for (let i = 0; i < N; i++) {
    r -= div[i];
    if (r <= 0) return i;
  }
  return N - 1;
}
const ORACLE_SEEDS = [1, 2, 7, 13, 42, 99, 100, 256, 1000, 31337];
const poolKey = (counts) =>
  [...counts.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([c, v]) => `${c}:${v}`)
    .join("|");
let oracleOk = true;
for (const seed of ORACLE_SEEDS) {
  const oracle = generatePoolFromData(poolData, seed, undefined, "idf2");
  const mine = growFrom(idf2Starter(seed)).counts;
  if (poolKey(oracle.counts) !== poolKey(mine)) oracleOk = false;
}
console.log(
  `idf2 oracle reproduction: ${oracleOk ? "PASS (bit-for-bit)" : "FAIL"}  over ${ORACLE_SEEDS.length} seeds\n`,
);
if (!oracleOk) {
  console.log("Re-port diverged from the oracle; metrics below are not trustworthy.\n");
}

// === Signatures and affinities ===============================================
// A Dreamcaller's "true decks" are the corpus decks whose archetype label is one
// of its draftArchetypes -- the same notion the merged experiment uses.
function trueDecksOf(dc) {
  const arch = new Set(dc.draftArchetypes ?? []);
  const idxs = [];
  for (let i = 0; i < N; i++) if (labelOf[i] && arch.has(labelOf[i])) idxs.push(i);
  return idxs;
}
// Realistic signature: the K most CHARACTERISTIC distinctive cards of the true
// decks -- ranked by (fraction of true decks containing it) x idf, keeping only
// cards that recur (>= 2 true decks) and carry similarity signal (idf > 0).
function deriveSignature(trueIdx, K) {
  const cnt = new Map();
  for (const i of trueIdx)
    for (const c of decks[i].cards) cnt.set(c, (cnt.get(c) ?? 0) + 1);
  const T = trueIdx.length;
  const scored = [];
  for (const [c, n] of cnt) {
    if (n < 2) continue;
    const w = idfOf(c);
    if (w <= 0) continue;
    scored.push([c, (n / T) * w]);
  }
  scored.sort((a, b) => b[1] - a[1]);
  return scored.slice(0, K).map(([c]) => c);
}
// For a signature S: literal IDF-overlap per deck, and anchor similarity (max
// cosine to the top-m decks nearest the signature probe; self-similarity = 1).
function affinities(S, m) {
  const sset = new Set(S.filter((c) => idfOf(c) > 0));
  let psq = 0;
  for (const c of sset) psq += idfOf(c) ** 2;
  const pnorm = Math.sqrt(psq) || 1;
  const litOv = new Float64Array(N);
  const probeCos = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    let dot = 0;
    for (const c of sset) if (decks[i].cards.has(c)) dot += idfOf(c) ** 2;
    litOv[i] = dot;
    probeCos[i] = dot / (pnorm * decks[i].norm);
  }
  const order = [...Array(N).keys()].sort(
    (a, b) => probeCos[b] - probeCos[a] || a - b,
  );
  const anchors = order.slice(0, m);
  const anchorSim = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    let mx = 0;
    for (const a of anchors) {
      const s = a === i ? 1 : sim[a][i];
      if (s > mx) mx = s;
    }
    anchorSim[i] = mx;
  }
  return { litOv, anchorSim, valid: sset.size > 0 };
}

// === The four spectrum corners as starter-weight builders =====================
const SCHEMES = {
  idf2: () => Array.from(div),
  litProp: (aff, a) => Array.from(div, (d, i) => (1 + aff.litOv[i]) ** a * d),
  anchorProp: (aff, a) =>
    Array.from(div, (d, i) => (EPS + aff.anchorSim[i]) ** a * d),
  anchorCapped: (aff, a, cap) =>
    Array.from(div, (d, i) => (EPS + Math.min(aff.anchorSim[i], cap)) ** a * d),
  anchorGated: (aff, tau, minSlice) => {
    let t = tau;
    const count = (th) => {
      let n = 0;
      for (let i = 0; i < N; i++) if (aff.anchorSim[i] >= th) n += 1;
      return n;
    };
    // Widen the slice if it is too small to spread within, then fall back to
    // idf2 over the whole corpus if even that cannot fill it.
    while (count(t) < minSlice && t > 0.01) t -= 0.05;
    if (count(t) < minSlice) return Array.from(div);
    return Array.from(div, (d, i) => (aff.anchorSim[i] >= t ? d : 0));
  },
};

// === Metrics (exact, analytic over the starter distribution) ==================
function metrics(weights, trueSet) {
  let total = 0;
  for (const w of weights) total += w;
  if (total <= 0) total = 1;
  let onId = 0; // P(starter is one of the Dreamcaller's labeled decks) -- MATCH
  let cohesion = 0; // expected starter->folded-deck cosine -- coherence guard
  for (let i = 0; i < N; i++) {
    const p = weights[i] / total;
    if (trueSet.has(i)) onId += p;
    cohesion += p * cohesionOf[i];
  }
  // Spread WITHIN the good decks: effective number of distinct true decks used
  // as starter, and the single most-drawn true deck's share. This is the
  // "don't collapse onto a few of the ~100 good decks" measure.
  let effGood = 0;
  let maxShare = 0;
  if (onId > 0) {
    let s2 = 0;
    for (const i of trueSet) {
      const q = weights[i] / total / onId;
      s2 += q * q;
      if (q > maxShare) maxShare = q;
    }
    effGood = 1 / s2;
  }
  return { onId, effGood, maxShare, cohesion };
}
// Held-out recall: steer with `weights` (built from the steer half of the
// signature); measure the expected fraction of the HOLD-OUT cards (never steered
// on) that land in the grown pool. Non-circular evidence the steer captured the
// identity, not just the literal steer cards.
function heldoutRecall(weights, holdout) {
  if (!holdout.length) return null;
  let total = 0;
  for (const w of weights) total += w;
  if (total <= 0) total = 1;
  let rec = 0;
  for (let i = 0; i < N; i++) {
    const p = weights[i] / total;
    if (p <= 0) continue;
    let inter = 0;
    for (const c of holdout) if (poolCardsOf[i].has(c)) inter += 1;
    rec += p * (inter / holdout.length);
  }
  return rec;
}

// === Run every scheme over every qualifying themed Dreamcaller ================
const themed = dreamcallers.filter(
  (d) => Array.isArray(d.draftArchetypes) && d.draftArchetypes.length > 0,
);
const evalDcs = [];
for (const dc of themed) {
  const trueIdx = trueDecksOf(dc);
  if (trueIdx.length < MIN_TRUE) continue;
  const sig = deriveSignature(trueIdx, K_SIG);
  if (sig.length < 3) continue;
  const half = Math.ceil(sig.length / 2);
  evalDcs.push({
    dc,
    trueSet: new Set(trueIdx),
    nTrue: trueIdx.length,
    affFull: affinities(sig, M_ANCHOR),
    affSteer: affinities(sig.slice(0, half), M_ANCHOR),
    holdout: sig.slice(half),
  });
}

console.log(
  `Evaluating ${evalDcs.length}/${themed.length} themed Dreamcallers ` +
    `(>= ${MIN_TRUE} labeled decks), avg ${(
      evalDcs.reduce((s, e) => s + e.nTrue, 0) / evalDcs.length
    ).toFixed(0)} "good decks" each:`,
);
console.log(
  "  " +
    evalDcs
      .map((e) => `${e.dc.name}(${e.nTrue})`)
      .join(", "),
);
console.log("");

const CONFIGS = [
  ["idf2  baseline (no sig)", () => SCHEMES.idf2()],
  ["A    literal  prop a=1", (e) => SCHEMES.litProp(e.affFull, 1)],
  ["A    literal  prop a=2", (e) => SCHEMES.litProp(e.affFull, 2)],
  ["A'   anchor   prop a=1", (e) => SCHEMES.anchorProp(e.affFull, 1)],
  ["A'   anchor   prop a=2", (e) => SCHEMES.anchorProp(e.affFull, 2)],
  ["A''  anchor   cap.4 a=2", (e) => SCHEMES.anchorCapped(e.affFull, 2, 0.4)],
  ["B    anchor   gate t=.3", (e) => SCHEMES.anchorGated(e.affFull, 0.3, 15)],
  ["B    anchor   gate t=.4", (e) => SCHEMES.anchorGated(e.affFull, 0.4, 15)],
  ["B    anchor   gate t=.5", (e) => SCHEMES.anchorGated(e.affFull, 0.5, 15)],
];
// Held-out steers with the steer half of the signature, under the same scheme.
const STEER = {
  "idf2  baseline (no sig)": () => SCHEMES.idf2(),
  "A    literal  prop a=1": (e) => SCHEMES.litProp(e.affSteer, 1),
  "A    literal  prop a=2": (e) => SCHEMES.litProp(e.affSteer, 2),
  "A'   anchor   prop a=1": (e) => SCHEMES.anchorProp(e.affSteer, 1),
  "A'   anchor   prop a=2": (e) => SCHEMES.anchorProp(e.affSteer, 2),
  "A''  anchor   cap.4 a=2": (e) => SCHEMES.anchorCapped(e.affSteer, 2, 0.4),
  "B    anchor   gate t=.3": (e) => SCHEMES.anchorGated(e.affSteer, 0.3, 15),
  "B    anchor   gate t=.4": (e) => SCHEMES.anchorGated(e.affSteer, 0.4, 15),
  "B    anchor   gate t=.5": (e) => SCHEMES.anchorGated(e.affSteer, 0.5, 15),
};

const W = [25, 9, 9, 10, 10, 10];
const padName = (s) => s.padEnd(W[0]);
console.log(
  padName("scheme") +
    ["onIdent", "effGood", "maxShare", "heldout", "cohesion"]
      .map((h, i) => h.padStart(W[i + 1]))
      .join(""),
);
console.log("-".repeat(W.reduce((a, b) => a + b, 0)));
for (const [name, build] of CONFIGS) {
  let onId = 0,
    effGood = 0,
    maxShare = 0,
    cohesion = 0,
    held = 0,
    heldN = 0;
  for (const e of evalDcs) {
    const m = metrics(build(e), e.trueSet);
    onId += m.onId;
    effGood += m.effGood;
    maxShare += m.maxShare;
    cohesion += m.cohesion;
    const hr = heldoutRecall(STEER[name](e), e.holdout);
    if (hr !== null) {
      held += hr;
      heldN += 1;
    }
  }
  const n = evalDcs.length;
  console.log(
    padName(name) +
      [
        (onId / n).toFixed(3),
        (effGood / n).toFixed(1),
        (maxShare / n).toFixed(3),
        heldN ? (held / heldN).toFixed(3) : "  -  ",
        (cohesion / n).toFixed(3),
      ]
        .map((c, i) => c.padStart(W[i + 1]))
        .join(""),
  );
}

console.log(`
Legend (exact, averaged over the qualifying Dreamcallers -- not Monte Carlo):
  onIdent   P(the drawn STARTER is one of the Dreamcaller's labeled decks).
            HIGHER = the pool matches the Dreamcaller. (Mildly circular -- the
            signature is derived from those decks -- so read it WITH heldout.)
  effGood   effective number of DISTINCT good decks used as the starter (inverse
            Simpson over the true decks). HIGHER = spreads across the good decks;
            this is the "don't collapse onto a few" number you were worried about.
  maxShare  the single most-drawn good deck's share of the on-identity mass.
            LOWER is better (no one deck dominates).
  heldout   expected recall of the HELD-OUT half of the signature -- cards we
            NEVER steered on. HIGHER = the steer captured the identity, not just
            the literal steer cards. The idf2 row is the no-steer baseline.
  cohesion  expected starter->folded-deck cosine. Coherence guard: must not
            collapse vs the idf2 baseline.

Read it as a frontier: the winner gives HIGH onIdent+heldout (match) at HIGH
effGood / LOW maxShare (spread), without cohesion falling below idf2.`);

// === Signature-size sweep: why ~3-6 cards? ====================================
// Hold the scheme fixed (A' anchor prop, and B gate t=.4) and vary the signature
// size K. Expect heldout to climb steeply then plateau, and effGood to fall once
// K over-narrows the slice.
console.log("\n" + "=".repeat(72));
console.log("SIGNATURE-SIZE SWEEP  (why ~3-6 cards?)\n");
const K_VALUES = [1, 2, 3, 4, 6, 8, 12];
for (const [label, build, steer] of [
  [
    "A' anchor prop a=1",
    (aff) => SCHEMES.anchorProp(aff, 1),
    (aff) => SCHEMES.anchorProp(aff, 1),
  ],
  [
    "B  anchor gate t=.4",
    (aff) => SCHEMES.anchorGated(aff, 0.4, 15),
    (aff) => SCHEMES.anchorGated(aff, 0.4, 15),
  ],
]) {
  console.log(label);
  console.log(
    "    K" +
      ["onIdent", "effGood", "maxShare", "heldout"]
        .map((h) => h.padStart(10))
        .join(""),
  );
  for (const K of K_VALUES) {
    let onId = 0,
      effGood = 0,
      maxShare = 0,
      held = 0,
      heldN = 0,
      used = 0;
    for (const dc of themed) {
      const trueIdx = trueDecksOf(dc);
      if (trueIdx.length < MIN_TRUE) continue;
      const sig = deriveSignature(trueIdx, K);
      if (sig.length < 1) continue;
      used += 1;
      const trueSet = new Set(trueIdx);
      const m = metrics(build(affinities(sig, M_ANCHOR)), trueSet);
      onId += m.onId;
      effGood += m.effGood;
      maxShare += m.maxShare;
      const half = Math.ceil(sig.length / 2);
      const holdout = sig.slice(half);
      const hr = heldoutRecall(steer(affinities(sig.slice(0, half), M_ANCHOR)), holdout);
      if (hr !== null) {
        held += hr;
        heldN += 1;
      }
    }
    console.log(
      String(K).padStart(5) +
        [
          (onId / used).toFixed(3),
          (effGood / used).toFixed(1),
          (maxShare / used).toFixed(3),
          heldN ? (held / heldN).toFixed(3) : "  -  ",
        ]
          .map((c) => c.padStart(10))
          .join(""),
    );
  }
  console.log("");
}
