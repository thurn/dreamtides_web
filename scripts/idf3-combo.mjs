// Find the GENTLEST combination of three decklist-only levers that reaches a
// target headline (default 95): coherent full-pool growth + smaller pool +
// corpus pruning. We want the least corpus deletion (the costly lever, since the
// filter leans on imperfect metadata) for a playable pool size.
//
//   coherent growth : fold the neighbour deck most similar to the ACCUMULATING
//                     pool, not to the fixed starter -> less off-identity drift.
//   pool size       : smaller pools carry fewer far-deck payoffs.
//   prune X%        : drop the worst-self-supported payoff-carrying decklists.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildPoolData } from "../src/draft/pool/index.ts";
import { idf2Corpus } from "../src/draft/pool/variant-idf2.ts";
import {
  idfCosine,
  growIdfPool,
  resolveCountsToNames,
} from "../src/draft/pool/variant-idf.ts";
import { scorePool, TIER_TARGET } from "./pool-metrics.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (p) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const SHORT = new Set(["survivors", "spirit-animals", "discard", "warriors", "abandon"]);
const SEEDS = Number(process.argv[2] ?? 60);

const cards = readJson("public/cards_v2-data.json");
const decklists = readJson("public/decklists-data.json");
// The idf engine keys its corpus on card ids; `decklistIds` is index-aligned to
// `decklists`. Self-adequacy pruning stays scored on the name corpus (scorePool is
// name-keyed) but indexes both, and the corpus handed to the engine is id-keyed.
const decklistIds = readJson("public/decklist-ids-data.json");
const dreamcallers = readJson("public/dreamcallers-v2-data.json");
const meta = readJson("data/buildaround_support.json");

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Rank payoff-carrying decklists by self-adequacy (worst first) and drop frac.
// Returns the kept name + id corpora (index-aligned).
function prunedDecklists(frac) {
  const self = (d) => {
    const c = new Map();
    for (const x of d) c.set(x, Math.min(2, (c.get(x) ?? 0) + 1));
    const i = scorePool(c, meta, TIER_TARGET, SHORT);
    return i.length ? mean(i.map((x) => x.adequacy)) : null;
  };
  const scored = decklists.map((d, i) => ({ i, a: self(d) })).filter((x) => x.a !== null).sort((a, b) => a.a - b.a);
  const drop = new Set(scored.slice(0, Math.round(frac * scored.length)).map((x) => x.i));
  return {
    names: decklists.filter((_, i) => !drop.has(i)),
    ids: decklistIds.filter((_, i) => !drop.has(i)),
  };
}

// Build a corpus closure (decks, idfOf, starter draw, coherent grow) for a corpus.
function makeCorpus({ names, ids }) {
  const poolData = buildPoolData(cards, names, undefined, ids);
  const toNames = (counts) => resolveCountsToNames(counts, poolData.cardNameById);
  const { base, twinCount } = idf2Corpus(poolData);
  const { decks, idf } = base;
  const idfOf = (c) => idf.get(c) ?? 0;

  const starterIdx = (rng, sig) => {
    const div = twinCount.map((c) => 1 / (1 + c) ** 0.5);
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
  };

  const coherentGrow = (startIdx, target) => {
    const counts = new Map();
    const fold = (d) => { for (const c of d.cards) { const h = counts.get(c) ?? 0; if (h < 2) counts.set(c, h + 1); } };
    const folded = new Set([startIdx]); fold(decks[startIdx]);
    const sizeOf = () => { let s = 0; for (const v of counts.values()) s += v; return s; };
    while (sizeOf() < target) {
      let pnorm = 0; for (const [c, v] of counts) pnorm += (idfOf(c) * v) ** 2; pnorm = Math.sqrt(pnorm) || 1;
      let best = -1, bestSim = -1;
      for (let i = 0; i < decks.length; i++) {
        if (folded.has(i)) continue;
        let dot = 0; for (const c of decks[i].cards) { const v = counts.get(c); if (v) dot += idfOf(c) ** 2 * v; }
        const sim = dot / (pnorm * (decks[i].norm || 1));
        if (sim > bestSim) { bestSim = sim; best = i; }
      }
      if (best < 0) break;
      folded.add(best); fold(decks[best]);
    }
    return counts;
  };

  return { decks, idfOf, starterIdx, coherentGrow, toNames };
}

function evaluate({ pruneFrac, size, coherent }) {
  const corpus = makeCorpus(prunedDecklists(pruneFrac));
  const { decks, idfOf, starterIdx, coherentGrow, toNames } = corpus;
  const all = [];
  const byTheme = new Map();
  const byDc = new Map();
  for (const dc of dreamcallers) {
    const ad = [];
    for (let s = 0; s < SEEDS; s++) {
      const start = starterIdx(mulberry(s), dc.signatureCardIds ?? []);
      const counts = coherent ? coherentGrow(start, size) : growIdfPool(decks, idfOf, start, size).counts;
      for (const i of scorePool(toNames(counts), meta, TIER_TARGET, SHORT)) {
        all.push(i.adequacy); ad.push(i.adequacy);
        if (!byTheme.has(i.theme)) byTheme.set(i.theme, []);
        byTheme.get(i.theme).push(i.adequacy);
      }
    }
    byDc.set(dc.name, mean(ad) * 100);
  }
  const themes = [...byTheme.entries()].map(([k, v]) => `${k}:${(mean(v) * 100).toFixed(0)}`).sort().join(" ");
  const worstDc = [...byDc.entries()].sort((a, b) => a[1] - b[1])[0];
  return { headline: mean(all) * 100, themes, worstDc, decks: decks.length };
}

const configs = [
  { label: "baseline             ", pruneFrac: 0, size: 200, coherent: false },
  { label: "coherent only        ", pruneFrac: 0, size: 200, coherent: true },
  { label: "coherent+size120     ", pruneFrac: 0, size: 120, coherent: true },
  { label: "coherent+size100     ", pruneFrac: 0, size: 100, coherent: true },
  { label: "coh+sz100+drop10     ", pruneFrac: 0.1, size: 100, coherent: true },
  { label: "coh+sz100+drop15     ", pruneFrac: 0.15, size: 100, coherent: true },
  { label: "coh+sz100+drop20     ", pruneFrac: 0.2, size: 100, coherent: true },
  { label: "coh+sz100+drop25     ", pruneFrac: 0.25, size: 100, coherent: true },
  { label: "coh+sz100+drop30     ", pruneFrac: 0.3, size: 100, coherent: true },
  { label: "coh+sz90+drop20      ", pruneFrac: 0.2, size: 90, coherent: true },
  { label: "coh+sz80+drop20      ", pruneFrac: 0.2, size: 80, coherent: true },
  { label: "coh+sz80+drop25      ", pruneFrac: 0.25, size: 80, coherent: true },
];

console.log(`combo sweep (${SEEDS} seeds x ${dreamcallers.length} DCs); target headline 95\n`);
for (const cfg of configs) {
  const r = evaluate(cfg);
  const star = r.headline >= 95 ? " <= 95!" : "";
  console.log(`${r.headline.toFixed(1)}  ${cfg.label} [${r.decks} decks]  worstDC ${r.worstDc[0]} ${r.worstDc[1].toFixed(0)}${star}`);
  console.log(`        ${r.themes}`);
}
