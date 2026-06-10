// Throwaway sweep: does concentrating the idf3 starter draw (less diversity
// bias / stronger anchor pull) raise the build-around adequacy metric, using
// ONLY decklists + the existing signatures? Reimplements just the starter-weight
// formula with tunable knobs, reusing the real corpus, growth, and scorePool.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildPoolData } from "../src/draft/pool/index.ts";
import { idf2Corpus, IDF2 } from "../src/draft/pool/variant-idf2.ts";
import { idfCosine, growIdfPool } from "../src/draft/pool/variant-idf.ts";
import { scorePool, TIER_TARGET } from "./pool-metrics.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (p) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

const SHORT = new Set(["survivors", "spirit-animals", "discard", "warriors", "abandon"]);
const SEEDS = Number(process.argv[2] ?? 80);
const POOL = 200;

const cards = readJson("public/cards_v2-data.json");
const decklists = readJson("public/decklists-data.json");
const dreamcallers = readJson("public/dreamcallers-v2-data.json");
const meta = readJson("data/buildaround_support.json");
const poolData = buildPoolData(cards, decklists);

const corpus = idf2Corpus(poolData);
const { base, twinCount } = corpus;
const { decks, idf } = base;
const idfOf = (c) => idf.get(c) ?? 0;

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Tunables: beta (diversity bias), sigAlpha, sigCap, anchorCount, sigEps.
function poolCounts(rng, sig, t) {
  const div = twinCount.map((c) => 1 / (1 + c) ** t.beta);
  const probe = new Set();
  for (const c of sig ?? []) if (idfOf(c) > 0) probe.add(c);
  const affinity = new Array(decks.length).fill(0);
  if (probe.size > 0) {
    let psq = 0;
    for (const c of probe) psq += idfOf(c) ** 2;
    const probeDeck = { cards: probe, norm: Math.sqrt(psq) || 1 };
    const anchors = decks
      .map((d, i) => ({ i, s: idfCosine(probeDeck, d, idfOf) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .slice(0, t.anchorCount)
      .map((x) => x.i);
    for (let i = 0; i < decks.length; i++) {
      let mx = 0;
      for (const a of anchors) {
        const s = a === i ? 1 : idfCosine(decks[a], decks[i], idfOf);
        if (s > mx) mx = s;
      }
      affinity[i] = mx;
    }
  }
  const w = decks.map((_, i) => (t.sigEps + Math.min(affinity[i], t.sigCap)) ** t.sigAlpha * div[i]);
  let total = 0;
  for (const x of w) total += x;
  let r = rng() * total;
  let start = w.length - 1;
  for (let i = 0; i < w.length; i++) {
    r -= w[i];
    if (r <= 0) { start = i; break; }
  }
  return growIdfPool(decks, idfOf, start, POOL).counts;
}

function score(t) {
  const all = [];
  const byTheme = new Map();
  for (const dc of dreamcallers) {
    for (let s = 0; s < SEEDS; s++) {
      const counts = poolCounts(mulberry(s), dc.signatureCards ?? [], t);
      for (const inst of scorePool(counts, meta, TIER_TARGET, SHORT)) {
        all.push(inst.adequacy);
        if (!byTheme.has(inst.theme)) byTheme.set(inst.theme, []);
        byTheme.get(inst.theme).push(inst.adequacy);
      }
    }
  }
  const themes = [...byTheme.entries()]
    .map(([k, v]) => `${k}:${(mean(v) * 100).toFixed(0)}`)
    .sort();
  return { headline: mean(all) * 100, themes };
}

const BASE = { beta: IDF2.diversityBeta, sigAlpha: 2, sigCap: 0.4, anchorCount: 3, sigEps: 0.05 };
const configs = [
  ["baseline (shipping)", BASE],
  ["beta=0.25", { ...BASE, beta: 0.25 }],
  ["beta=0.0", { ...BASE, beta: 0.0 }],
  ["sigAlpha=4", { ...BASE, sigAlpha: 4 }],
  ["sigAlpha=4,sigEps=0.02", { ...BASE, sigAlpha: 4, sigEps: 0.02 }],
  ["sigCap=0.7", { ...BASE, sigCap: 0.7 }],
  ["sigCap=0.7,sigAlpha=4", { ...BASE, sigCap: 0.7, sigAlpha: 4 }],
  ["beta=0,sigAlpha=4,sigCap=0.7", { beta: 0, sigAlpha: 4, sigCap: 0.7, anchorCount: 3, sigEps: 0.02 }],
  ["anchorCount=1", { ...BASE, anchorCount: 1 }],
];

console.log(`idf3 concentration sweep (${SEEDS} seeds x ${dreamcallers.length} DCs, short themes)\n`);
for (const [name, t] of configs) {
  const r = score(t);
  console.log(`${r.headline.toFixed(1)}  ${name}`);
  console.log(`      ${r.themes.join("  ")}`);
}
