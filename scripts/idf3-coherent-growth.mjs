// Candidate fix (decklist-only, no hand metadata): grow the pool by folding the
// neighbour deck most similar to the ACCUMULATING pool centroid, not to the fixed
// starter. The starter is still picked by the idf3 signature draw. The idea: a
// far deck that shares the starter's signature card but little else won't be
// folded unless it also coheres with what the pool already holds -> less drift.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildPoolData } from "../src/draft/pool/index.ts";
import { idf2Corpus } from "../src/draft/pool/variant-idf2.ts";
import { idfCosine, growIdfPool } from "../src/draft/pool/variant-idf.ts";
import { scorePool, TIER_TARGET } from "./pool-metrics.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (p) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const SHORT = new Set(["survivors", "spirit-animals", "discard", "warriors", "abandon"]);
const SEEDS = Number(process.argv[2] ?? 60);

const cards = readJson("public/cards_v2-data.json");
const decklists = readJson("public/decklists-data.json");
const dreamcallers = readJson("public/dreamcallers-v2-data.json");
const meta = readJson("data/buildaround_support.json");
const poolData = buildPoolData(cards, decklists);
const { base, twinCount } = idf2Corpus(poolData);
const { decks, idf } = base;
const idfOf = (c) => idf.get(c) ?? 0;

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// idf3 starter draw (shipping constants).
function starterIdx(rng, sig) {
  const beta = 0.5;
  const div = twinCount.map((c) => 1 / (1 + c) ** beta);
  const probe = new Set();
  for (const c of sig ?? []) if (idfOf(c) > 0) probe.add(c);
  const aff = new Array(decks.length).fill(0);
  if (probe.size) {
    let psq = 0; for (const c of probe) psq += idfOf(c) ** 2;
    const pd = { cards: probe, norm: Math.sqrt(psq) || 1 };
    const anchors = decks.map((d, i) => ({ i, s: idfCosine(pd, d, idfOf) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.i - b.i).slice(0, 3).map((x) => x.i);
    for (let i = 0; i < decks.length; i++) { let mx = 0; for (const a of anchors) { const s = a === i ? 1 : idfCosine(decks[a], decks[i], idfOf); if (s > mx) mx = s; } aff[i] = mx; }
  }
  const w = decks.map((_, i) => (0.05 + Math.min(aff[i], 0.4)) ** 2 * div[i]);
  let total = 0; for (const x of w) total += x;
  let r = rng() * total, start = w.length - 1;
  for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) { start = i; break; } }
  return start;
}

// Coherent growth: pool as an IDF vector; greedily fold the deck whose IDF-cosine
// to the current pool vector is highest, cap copies at 2, until size hits target.
function coherentGrow(startIdx, target = 200) {
  const counts = new Map();
  const cap = (name) => { const h = counts.get(name) ?? 0; if (h >= 2) return 0; counts.set(name, h + 1); return 1; };
  const foldDeck = (d) => { for (const c of d.cards) cap(c); };
  const folded = new Set([startIdx]);
  foldDeck(decks[startIdx]);
  const sizeOf = () => { let s = 0; for (const v of counts.values()) s += v; return s; };
  // Precompute deck norms for cosine against pool.
  const poolVec = new Map(); // card -> capped copies (the pool as a vector)
  const refreshVec = () => { poolVec.clear(); for (const [c, v] of counts) poolVec.set(c, v); };
  while (sizeOf() < target) {
    refreshVec();
    let pnorm = 0; for (const [c, v] of poolVec) pnorm += (idfOf(c) * v) ** 2; pnorm = Math.sqrt(pnorm) || 1;
    let best = -1, bestSim = -1;
    for (let i = 0; i < decks.length; i++) {
      if (folded.has(i)) continue;
      let dot = 0; for (const c of decks[i].cards) { const v = poolVec.get(c); if (v) dot += idfOf(c) * v * idfOf(c); }
      const sim = dot / (pnorm * (decks[i].norm || 1));
      if (sim > bestSim) { bestSim = sim; best = i; }
    }
    if (best < 0) break;
    folded.add(best); foldDeck(decks[best]);
  }
  return counts;
}

function scoreAll(grow, draw) {
  const all = [];
  const byDc = new Map();
  const byTheme = new Map();
  for (const dc of dreamcallers) {
    const ad = [];
    for (let s = 0; s < SEEDS; s++) {
      const start = (draw ?? starterIdx)(mulberry(s), dc.signatureCards ?? []);
      const counts = grow(start);
      for (const i of scorePool(counts, meta, TIER_TARGET, SHORT)) {
        all.push(i.adequacy); ad.push(i.adequacy);
        if (!byTheme.has(i.theme)) byTheme.set(i.theme, []);
        byTheme.get(i.theme).push(i.adequacy);
      }
    }
    byDc.set(dc.name, mean(ad) * 100);
  }
  const worst = [...byDc.entries()].sort((a, b) => a[1] - b[1]).slice(0, 4).map(([n, v]) => `${n} ${v.toFixed(0)}`).join(", ");
  const themes = [...byTheme.entries()].map(([k, v]) => `${k}:${(mean(v) * 100).toFixed(0)}`).sort().join("  ");
  return { headline: mean(all) * 100, worst, themes };
}
// Concentrated starter draw (beta=0, sigAlpha=4, sigCap=0.7).
function starterIdxConc(rng, sig) {
  const div = twinCount.map(() => 1);
  const probe = new Set(); for (const c of sig ?? []) if (idfOf(c) > 0) probe.add(c);
  const aff = new Array(decks.length).fill(0);
  if (probe.size) {
    let psq = 0; for (const c of probe) psq += idfOf(c) ** 2;
    const pd = { cards: probe, norm: Math.sqrt(psq) || 1 };
    const anchors = decks.map((d, i) => ({ i, s: idfCosine(pd, d, idfOf) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.i - b.i).slice(0, 3).map((x) => x.i);
    for (let i = 0; i < decks.length; i++) { let mx = 0; for (const a of anchors) { const s = a === i ? 1 : idfCosine(decks[a], decks[i], idfOf); if (s > mx) mx = s; } aff[i] = mx; }
  }
  const w = decks.map((_, i) => (0.02 + Math.min(aff[i], 0.7)) ** 4 * div[i]);
  let total = 0; for (const x of w) total += x;
  let r = rng() * total, start = w.length - 1;
  for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) { start = i; break; } }
  return start;
}

console.log(`coherent-growth test (${SEEDS} seeds x ${dreamcallers.length} DCs)\n`);
const print = (label, r) => console.log(`${r.headline.toFixed(1)}  ${label}\n      themes: ${r.themes}\n      worst DCs: ${r.worst}`);
print("baseline: starter-sim growth + shipping draw", scoreAll((s) => growIdfPool(decks, idfOf, s, 200).counts));
print("coherent growth + shipping draw            ", scoreAll((s) => coherentGrow(s, 200)));
print("coherent growth + concentrated draw        ", scoreAll((s) => coherentGrow(s, 200), starterIdxConc));
