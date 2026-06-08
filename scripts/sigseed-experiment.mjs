// Experiment: does `sigseed` give each Dreamcaller a pool that is reliably ANCHORED
// on its signature — markedly more on-theme than `picksig` (and the `pickcohere`
// baseline) — while still offering run-to-run VARIETY?
//
// `sigseed` grows a pool ONLY from a random subset of a Dreamcaller's signature
// cards. Unlike `picksig` (where the signature merely biases a seed draw that still
// ranges over the whole corpus, and a signature-blind best-of-K coherence step can
// then discard the on-theme seed), every `sigseed` pool starts on actual signature
// cards, so it cannot drift onto an unrelated identity. This script measures, per
// Dreamcaller with an in-corpus signature, over many seeds:
//
//   * ON-THEME -- the mean signature affinity of the pooled cards (the algorithm's
//     own normalised affinity, via `buildSignatureAffinity`). Reported for sigseed,
//     picksig, and the pickcohere baseline on the SAME seeds. sigseed should sit
//     well above both: its pools are about the Dreamcaller by construction.
//   * VARIETY  -- the number of DISTINCT pools across the seeds. The subset draw is
//     the variety source; the design target is >= 50 distinct pools per Dreamcaller.
//   * LEAN SPREAD -- mean pairwise Jaccard distance between distinct pools (0 =
//     identical, 1 = disjoint): genuine differences between the leans of one
//     identity.
//
// The corpus, growth, and signature resolution are the real ones from
// `src/draft/pool` (no re-port): it calls `generatePoolFromData` exactly as the
// quest does, so what it measures is what ships.
//
// Run: node scripts/sigseed-experiment.mjs [--seeds 200] [--dreamcaller "Edran"] [--json]

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  buildPoolData,
  generatePoolFromData,
} from "../src/draft/pool/index.ts";
import {
  buildPickSigCorpus,
  buildSignatureAffinity,
} from "../src/draft/pool/variant-picksig.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (p) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));

function flag(argv, name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback;
}
function has(argv, name) {
  return argv.includes(name);
}

function loadContext(argv) {
  const cards = readJson("public/cards_v2-data.json");
  const draftRecords = readJson("public/draft-records-data.json");
  let dreamcallers = readJson("public/dreamcallers-v2-data.json");

  const dcFilter = flag(argv, "--dreamcaller", null);
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
  const poolData = buildPoolData(cards, undefined, pickRecords);
  return { dreamcallers, poolData };
}

function poolKey(pool, cardIdByName) {
  const parts = [];
  for (const [name, count] of pool.counts) {
    parts.push(`${cardIdByName.get(name) ?? name}:${count}`);
  }
  parts.sort();
  return parts.join("|");
}
function poolCardSet(pool, cardIdByName) {
  const s = new Set();
  for (const name of pool.counts.keys()) s.add(cardIdByName.get(name) ?? name);
  return s;
}
function jaccardDistance(a, b) {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : 1 - inter / union;
}
function onThemeScore(pool, cardIdByName, sigAffinity) {
  let sum = 0;
  let n = 0;
  for (const name of pool.counts.keys()) {
    const id = cardIdByName.get(name) ?? name;
    sum += sigAffinity.get(id) ?? 0;
    n += 1;
  }
  return n === 0 ? 0 : sum / n;
}
function mean(xs) {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

function genPool(poolData, seed, variant, signature) {
  return generatePoolFromData(poolData, seed, undefined, variant, undefined, undefined, signature);
}

function main() {
  const argv = process.argv.slice(2);
  const seeds = Number(flag(argv, "--seeds", "200"));
  const asJson = has(argv, "--json");
  const { dreamcallers, poolData } = loadContext(argv);
  const cardIdByName = poolData.cardIdByName ?? new Map();
  const corpus = buildPickSigCorpus(poolData);
  if (!corpus) {
    console.error("No pick-record corpus is available (run scripts/setup-assets.mjs).");
    process.exit(1);
  }

  const withSig = dreamcallers.filter((d) => (d.signatureCards ?? []).length > 0);
  const rows = [];

  for (const dc of withSig) {
    const signature = dc.signatureCards ?? [];
    const sigAffinity = buildSignatureAffinity(corpus, signature, cardIdByName);
    if (sigAffinity.size === 0) continue;

    const distinct = new Set();
    const sigPools = [];
    const sigseedScores = [];
    const picksigScores = [];
    const baseScores = [];

    for (let seed = 0; seed < seeds; seed += 1) {
      const sigseedPool = genPool(poolData, seed, "sigseed", signature);
      distinct.add(poolKey(sigseedPool, cardIdByName));
      sigseedScores.push(onThemeScore(sigseedPool, cardIdByName, sigAffinity));
      sigPools.push(sigseedPool);

      picksigScores.push(
        onThemeScore(genPool(poolData, seed, "picksig", signature), cardIdByName, sigAffinity),
      );
      baseScores.push(
        onThemeScore(genPool(poolData, seed, "pickcohere", signature), cardIdByName, sigAffinity),
      );
    }

    // Lean spread over a sample of distinct pools.
    const seen = new Set();
    const cardSets = [];
    for (const p of sigPools) {
      const k = poolKey(p, cardIdByName);
      if (seen.has(k)) continue;
      seen.add(k);
      cardSets.push(poolCardSet(p, cardIdByName));
      if (cardSets.length >= 40) break;
    }
    let spread = 0;
    let pairs = 0;
    for (let i = 0; i < cardSets.length; i += 1) {
      for (let j = i + 1; j < cardSets.length; j += 1) {
        spread += jaccardDistance(cardSets[i], cardSets[j]);
        pairs += 1;
      }
    }
    const meanSpread = pairs === 0 ? 0 : spread / pairs;

    rows.push({
      dreamcaller: dc.name,
      distinctPools: distinct.size,
      onThemeSigseed: mean(sigseedScores),
      onThemePicksig: mean(picksigScores),
      onThemeBase: mean(baseScores),
      leanSpread: meanSpread,
    });
  }

  if (asJson) {
    console.log(JSON.stringify({ seeds, rows }, null, 2));
    return;
  }

  rows.sort((a, b) => a.distinctPools - b.distinctPools);
  console.log(
    `sigseed experiment -- ${rows.length} Dreamcallers with an in-corpus signature, ${seeds} seeds each\n`,
  );
  console.log(
    "Dreamcaller".padEnd(24) +
      "distinct".padStart(9) +
      "sigseed".padStart(9) +
      "picksig".padStart(9) +
      "cohere".padStart(8) +
      "vsPickC".padStart(9) +
      "spread".padStart(8),
  );
  for (const r of rows) {
    const lift = r.onThemeBase > 0 ? r.onThemeSigseed / r.onThemeBase : 0;
    console.log(
      r.dreamcaller.padEnd(24) +
        String(r.distinctPools).padStart(9) +
        r.onThemeSigseed.toFixed(3).padStart(9) +
        r.onThemePicksig.toFixed(3).padStart(9) +
        r.onThemeBase.toFixed(3).padStart(8) +
        `${lift.toFixed(2)}x`.padStart(9) +
        r.leanSpread.toFixed(3).padStart(8),
    );
  }

  const pass = rows.filter((r) => r.distinctPools >= 50).length;
  console.log(
    `\nVariety target (>= 50 distinct pools): ${pass}/${rows.length} Dreamcallers pass.`,
  );
  console.log(
    `On-theme: mean sigseed ${mean(rows.map((r) => r.onThemeSigseed)).toFixed(3)} vs ` +
      `picksig ${mean(rows.map((r) => r.onThemePicksig)).toFixed(3)} vs ` +
      `pickcohere ${mean(rows.map((r) => r.onThemeBase)).toFixed(3)}.`,
  );
}

main();
