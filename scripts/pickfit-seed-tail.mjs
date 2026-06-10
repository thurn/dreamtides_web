// Tail-focused seed analysis for pickfit: NOT the average pool, but "how many
// really-bad pools does the seed draw produce, and can a purely record-derived
// filter remove them?" Each corpus card seeds exactly one deterministic pool and
// pickfit draws the seed uniformly, so P(a player gets a bad pool) = (#bad
// seeds)/(#eligible seeds). Removing bad-producing seeds lowers that directly.
//
// "Really bad" is defined two ways (both reported): a pool whose build-around
// support adequacy is low (a present payoff the pool can't feed), and a pool
// carrying several trap cards at once. The support metric is the JUDGE only; the
// filters below read ONLY the excess-lift affinity / pick-rate prior pickfit
// already derives from docs/draft_records_adapted/.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildPoolData } from "../src/draft/pool/index.ts";
import { buildPickfitCorpus, PICKFIT } from "../src/draft/pool/variant-pickfit.ts";
import { growAffinityPool } from "../src/draft/pool/affinity-grower.ts";
import {
  scorePool,
  trapCards,
  TIER_TARGET,
  STANDALONE_THEMES,
} from "./pool-metrics.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (p) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

const cards = readJson("public/cards_v2-data.json");
const decklists = readJson("public/decklists-data.json");
const draftRecords = readJson("public/draft-records-data.json");
const meta = readJson("data/buildaround_support.json");

const poolData = buildPoolData(
  cards,
  decklists,
  draftRecords.map((r) => ({ packs: r.packIds, picks: r.pickIds })),
);
const corpus = buildPickfitCorpus(poolData);
const nameOf = (id) => poolData.cardNameById?.get(id) ?? id;
const standalone = STANDALONE_THEMES;

// --- per-seed: grow, judge (tail), and record-only seed features -----------
function hhi(row) {
  if (!row || row.size === 0) return 0;
  let s = 0; for (const w of row.values()) s += w;
  if (s <= 0) return 0;
  let h = 0; for (const w of row.values()) h += (w / s) ** 2;
  return h;
}
// Record-only coherence of the GROWN pool: mean excess-lift affinity over all
// ordered distinct-card pairs in the pool. Low = even the grower couldn't find a
// tight cluster from this seed (the fingerprint of a generic seed). No metadata.
function poolCoherence(distinctIds) {
  let sum = 0, n = 0;
  for (const a of distinctIds) {
    const row = corpus.affinity.get(a);
    if (!row) continue;
    for (const b of distinctIds) {
      if (a === b) continue;
      sum += row.get(b) ?? 0;
      n += 1;
    }
  }
  return n > 0 ? sum / n : 0;
}

const rows = [];
for (const seedId of corpus.cards) {
  const { counts } = growAffinityPool(corpus, seedId, PICKFIT.targetSize, PICKFIT);
  const distinctIds = [...counts.keys()];
  const named = new Map();
  for (const [k, c] of counts) named.set(nameOf(k), c);
  const inst = scorePool(named, meta, TIER_TARGET, standalone);
  const adequacy = inst.length ? mean(inst.map((i) => i.adequacy)) : 1;
  const traps = trapCards(named, meta, TIER_TARGET, 0.35, null).length;

  const row = corpus.affinity.get(seedId);
  rows.push({
    seedId, seedName: nameOf(seedId), adequacy, traps,
    prior: corpus.prior.get(seedId) ?? 0,
    hhi: hhi(row),
    peak: row ? Math.max(0, ...row.values()) : 0,
    coherence: poolCoherence(distinctIds),
  });
}

// --- baseline tail ----------------------------------------------------------
const N = rows.length;
const pct = (r) => r.adequacy * 100;
const adeqBelow = (t) => rows.filter((r) => pct(r) < t).length;
const trapsAtLeast = (k) => rows.filter((r) => r.traps >= k).length;
console.log(`pickfit seed tail -- ${N} seeds (uniform draw => each row is 1/${N} of player outcomes)\n`);
console.log("BASELINE bad-pool counts (of all 501 seeds):");
for (const t of [70, 75, 80, 85, 90]) console.log(`  adequacy < ${t}:  ${String(adeqBelow(t)).padStart(3)}  (${(100 * adeqBelow(t) / N).toFixed(1)}% of draws)`);
for (const k of [2, 3, 4]) console.log(`  traps >= ${k}:    ${String(trapsAtLeast(k)).padStart(3)}  (${(100 * trapsAtLeast(k) / N).toFixed(1)}% of draws)`);

// --- which record-only filter removes the bad tail, sacrificing fewest? -----
// Two bad-pool definitions; for each filter+drop, report the player's residual
// bad-rate among KEPT seeds (the headline: P(bad pool) after the filter) and how
// many of the bad seeds were caught.
const FEATURES = [
  ["coherence", (r) => r.coherence],      // grown-pool tightness (record-only)
  ["hhi", (r) => r.hhi],                   // seed affinity-row concentration
  ["peak", (r) => r.peak],                 // seed's strongest single synergy
  ["priorInv", (r) => 1 - r.prior],        // 1 - pick rate (drop generic staples)
];
for (const [badLabel, isBad] of [
  ["adequacy < 85", (r) => pct(r) < 85],
  ["traps >= 3", (r) => r.traps >= 3],
]) {
  const badIds = new Set(rows.filter(isBad).map((r) => r.seedId));
  const baseRate = (100 * badIds.size / N).toFixed(1);
  console.log(`\n=== bad = ${badLabel}  (baseline ${badIds.size}/${N} = ${baseRate}% of draws) ===`);
  console.log(`  ${"filter".padEnd(11)} ${"drop".padStart(5)} ${"caught".padStart(9)} ${"keptBadRate".padStart(12)} ${"goodLost".padStart(9)}`);
  for (const [name, fn] of FEATURES) {
    const sorted = [...rows].sort((a, b) => fn(b) - fn(a)); // best first
    for (const drop of [0.1, 0.2, 0.33, 0.5]) {
      const cut = Math.ceil(N * drop);
      const kept = sorted.slice(0, N - cut);
      const dropped = sorted.slice(N - cut);
      const caught = dropped.filter((r) => badIds.has(r.seedId)).length;
      const keptBad = kept.filter((r) => badIds.has(r.seedId)).length;
      const goodLost = dropped.length - caught;
      console.log(`  ${name.padEnd(11)} ${(drop * 100 + "%").padStart(5)} ${String(caught + "/" + badIds.size).padStart(9)} ${(100 * keptBad / kept.length).toFixed(1).padStart(11)}% ${String(goodLost).padStart(9)}`);
    }
  }
}

// --- the worst pools, with their record-only features, to eyeball ----------
console.log(`\n20 worst pools by adequacy (with record-only seed features):`);
console.log(`  ${"adeq".padStart(4)} ${"traps".padStart(5)}  ${"prior".padStart(5)} ${"hhi".padStart(5)} ${"peak".padStart(5)} ${"coher".padStart(6)}  seed`);
for (const r of [...rows].sort((a, b) => a.adequacy - b.adequacy).slice(0, 20)) {
  console.log(`  ${(r.adequacy * 100).toFixed(0).padStart(4)} ${String(r.traps).padStart(5)}  ${r.prior.toFixed(2).padStart(5)} ${r.hhi.toFixed(2).padStart(5)} ${r.peak.toFixed(2).padStart(5)} ${r.coherence.toFixed(3).padStart(6)}  ${r.seedName}`);
}

// --- threshold-free "best-of-K": draw K seeds, keep the most coherent --------
// Analytic P(a seed is chosen) = it is the max-coherence of K uniform draws.
// Rank seeds by coherence (rank 1 = highest); with-replacement draws give
// P(max at rank r) = ((N-r+1)/N)^K - ((N-r)/N)^K.
console.log("\n=== threshold-free best-of-K (draw K seeds, grow, keep most coherent) ===");
const byCoh = [...rows].sort((a, b) => b.coherence - a.coherence); // rank 1 first
for (const [badLabel, isBad] of [
  ["adequacy < 85", (r) => r.adequacy * 100 < 85],
  ["traps >= 3", (r) => r.traps >= 3],
]) {
  const base = byCoh.filter(isBad).length / byCoh.length;
  const line = [1, 2, 3, 5].map((K) => {
    let bad = 0;
    for (let i = 0; i < byCoh.length; i++) {
      const r = i + 1;
      const p = ((byCoh.length - r + 1) / byCoh.length) ** K - ((byCoh.length - r) / byCoh.length) ** K;
      if (isBad(byCoh[i])) bad += p;
    }
    return `K=${K}: ${(100 * bad).toFixed(1)}%`;
  });
  console.log(`  bad = ${badLabel} (uniform ${(100 * base).toFixed(1)}%)  ->  ${line.join("   ")}`);
}
