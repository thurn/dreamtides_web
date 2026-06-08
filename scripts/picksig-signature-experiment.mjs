// Experiment: does `picksig` give each Dreamcaller a pool that is THEMATICALLY
// TIED to its signature while still offering a wide VARIETY of distinct,
// differently-leaning pools?
//
// `picksig` is `pickcohere` with one change: its best-of-K candidate seeds are
// drawn from a distribution biased toward the cards that partner the chosen
// Dreamcaller's signature (its `signatureCards` UUIDs), instead of uniformly.
// This script measures, per Dreamcaller with a signature, over many seeds:
//
//   * VARIETY  -- the number of DISTINCT pools produced across the seeds (a pool
//     is its sorted multiset of card UUIDs). The design target is >= 50 distinct
//     pools per Dreamcaller, so one Dreamcaller never collapses to a handful of
//     fixed lists.
//   * ON-THEME -- the mean signature affinity of the pooled cards (the same
//     normalised affinity `picksig` steers on, via `buildSignatureAffinity`),
//     compared against the `pickcohere` baseline on the SAME seeds. picksig
//     should land markedly higher: its pools are about the Dreamcaller.
//   * LEAN SPREAD -- the mean pairwise Jaccard DISTANCE between distinct pools.
//     Above zero means the pools genuinely differ (e.g. a combo lean vs an
//     aggro lean of the same identity); not near one means they still share a
//     common on-theme core. A tight identity with internal variety sits in
//     between, which is the goal.
//
// It also checks the FALLBACK invariant directly: `picksig` with an EMPTY
// signature must reproduce `pickcohere` bit-for-bit on the same seed, because the
// weighted draw with all-equal weights is the uniform draw.
//
// The corpus, growth, and seed draw are the real ones from `src/draft/pool` (no
// re-port): the script calls `generatePoolFromData` exactly as the quest does and
// reads `buildSignatureAffinity` / `buildPickSigCorpus` for the on-theme metric,
// so what it measures is what ships.
//
// Run: node scripts/picksig-signature-experiment.mjs [--seeds 200] [--dreamcaller "Kell Tarn"] [--json]

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

// --- Load the same inputs the quest builds its pools from. ----------------
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

// A pool's canonical identity: its card UUIDs with copy counts, sorted. Two pools
// with the same cards-and-copies hash to the same string regardless of build
// order, so the distinct-pool count is exact.
function poolKey(pool, cardIdByName) {
  const parts = [];
  for (const [name, count] of pool.counts) {
    parts.push(`${cardIdByName.get(name) ?? name}:${count}`);
  }
  parts.sort();
  return parts.join("|");
}

// The set of UUID keys present in a pool (ignoring copy count), for Jaccard.
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

// Mean signature affinity over a pool's DISTINCT cards (copies don't change the
// theme), using the algorithm's own normalised affinity. 0 for cards the corpus
// doesn't know.
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
  let fallbackChecked = 0;
  let fallbackMatched = 0;

  for (const dc of withSig) {
    const signature = dc.signatureCards ?? [];
    const sigAffinity = buildSignatureAffinity(corpus, signature, cardIdByName);
    // A signature whose cards are all absent from the corpus carries no signal;
    // picksig is then just pickcohere, so it has no thematic identity to report.
    if (sigAffinity.size === 0) continue;

    const distinct = new Set();
    const cardSets = [];
    const sigPools = [];
    const sigScores = [];
    const baseScores = [];

    for (let seed = 0; seed < seeds; seed += 1) {
      const sigPool = generatePoolFromData(
        poolData,
        seed,
        undefined,
        "picksig",
        undefined,
        undefined,
        signature,
      );
      distinct.add(poolKey(sigPool, cardIdByName));
      sigScores.push(onThemeScore(sigPool, cardIdByName, sigAffinity));
      sigPools.push(sigPool);

      // pickcohere baseline on the same seed (signature ignored by pickcohere).
      const basePool = generatePoolFromData(
        poolData,
        seed,
        undefined,
        "pickcohere",
        undefined,
        undefined,
        signature,
      );
      baseScores.push(onThemeScore(basePool, cardIdByName, sigAffinity));
    }

    // Lean spread: mean pairwise Jaccard distance over a sample of distinct pools.
    const seen = new Set();
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

    // Fallback invariant: empty signature picksig == pickcohere, same seed.
    for (let seed = 0; seed < 3; seed += 1) {
      const empty = generatePoolFromData(poolData, seed, undefined, "picksig", undefined, undefined, []);
      const cohere = generatePoolFromData(poolData, seed, undefined, "pickcohere", undefined, undefined, []);
      fallbackChecked += 1;
      if (poolKey(empty, cardIdByName) === poolKey(cohere, cardIdByName)) fallbackMatched += 1;
    }

    rows.push({
      dreamcaller: dc.name,
      signatureInCorpus: [...sigAffinity.keys()].filter((k) => sigAffinity.get(k) === 1).length,
      distinctPools: distinct.size,
      onThemeSig: mean(sigScores),
      onThemeBase: mean(baseScores),
      leanSpread: meanSpread,
    });
  }

  rows.sort((a, b) => a.distinctPools - b.distinctPools);

  if (asJson) {
    console.log(JSON.stringify({ seeds, fallbackChecked, fallbackMatched, rows }, null, 2));
    return;
  }

  const belowTarget = rows.filter((r) => r.distinctPools < 50);
  console.log(
    `picksig signature experiment -- ${rows.length} Dreamcallers with an in-corpus signature, ${seeds} seeds each\n`,
  );
  console.log(
    `Fallback invariant (empty signature == pickcohere): ${fallbackMatched}/${fallbackChecked} ${fallbackMatched === fallbackChecked ? "OK" : "MISMATCH"}\n`,
  );
  console.log(
    "Dreamcaller".padEnd(26) +
      "distinct".padStart(9) +
      "onTheme".padStart(9) +
      "base".padStart(8) +
      "lift".padStart(8) +
      "spread".padStart(9),
  );
  for (const r of rows) {
    const lift = r.onThemeBase > 0 ? r.onThemeSig / r.onThemeBase : Infinity;
    console.log(
      r.dreamcaller.padEnd(26) +
        String(r.distinctPools).padStart(9) +
        r.onThemeSig.toFixed(3).padStart(9) +
        r.onThemeBase.toFixed(3).padStart(8) +
        (Number.isFinite(lift) ? `${lift.toFixed(2)}x` : "inf").padStart(8) +
        r.leanSpread.toFixed(3).padStart(9),
    );
  }
  console.log(
    `\nVariety target (>= 50 distinct pools): ${rows.length - belowTarget.length}/${rows.length} Dreamcallers pass.`,
  );
  if (belowTarget.length) {
    console.log(
      `  below target: ${belowTarget.map((r) => `${r.dreamcaller} (${r.distinctPools})`).join(", ")}`,
    );
  }
  console.log(
    `On-theme: mean picksig ${mean(rows.map((r) => r.onThemeSig)).toFixed(3)} vs pickcohere ${mean(rows.map((r) => r.onThemeBase)).toFixed(3)} ` +
      `(${(mean(rows.map((r) => (r.onThemeBase > 0 ? r.onThemeSig / r.onThemeBase : 1)))).toFixed(2)}x mean lift).`,
  );
  console.log(
    `Lean spread: mean pairwise Jaccard distance ${mean(rows.map((r) => r.leanSpread)).toFixed(3)} (0 = identical pools, 1 = disjoint).`,
  );
}

main();
