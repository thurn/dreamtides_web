// Acceptance harness for the committed card embedding and the `embedded` pool
// variant (docs/cards2/affinity_corpus_distillation_design.md §10). It asserts
// three properties and exits non-zero if any fails:
//
//   1. BAKE-PIPELINE FIDELITY (the matrix step must be exact). The `embedded`
//      variant fed the in-memory record-derived matrix produces pools
//      byte-identical to the official `sigseed` generator on the live records,
//      isolating the SVD as the only approximation in the chain.
//   2. EMBEDDING METRIC PARITY (the shipping bar). The committed rank-R embedding
//      scores adequacy/traps/theme-evenness/#cards within the acceptance band of
//      the exact generator, measured with the existing quality metric's exported
//      pure functions over `seeds × 32` real-draft pools.
//   3. NEGATIVE CONTROLS RETAINED. A synergy-shuffled corpus and a prior-only
//      corpus score materially worse, proving the metric still discriminates.
//
//   node scripts/affinity-corpus-parity.mjs               # 25 seeds (default)
//   node scripts/affinity-corpus-parity.mjs --seeds 10    # quicker smoke run
//   node scripts/affinity-corpus-parity.mjs --json
//
// All randomness (SVD projection, control shuffle) is seeded from constants, so
// the run is reproducible. Requires the public assets (`npm run setup-assets`)
// and the committed embedding (`npm run bake-affinity-corpus`).
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  buildPoolData,
  deserializeCorpus,
  generatePoolFromData,
} from "../src/draft/pool/index.ts";
import { buildPickfitCorpus } from "../src/draft/pool/variant-pickfit.ts";
import { makeRng } from "../src/draft/pool/rng.ts";
import {
  scorePool,
  trapCards,
  buildableThemes,
  STANDALONE_THEMES,
  TIER_TARGET,
  normalizedEntropy,
  dominantSignatureTheme,
} from "./buildaround-support-experiment.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (p) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));

const POOL_TARGET_SIZE = 200;
const DEFAULT_SEEDS = 25;
const TRAP_TAU = 0.35;

// Section 10.2 acceptance band for rank >= 16.
const ACCEPT = {
  adequacy: 97.5,
  traps: 1.0,
  themeEvenness: 95.0,
  cards: 460,
};

function num(argv, flag, fallback) {
  const i = argv.indexOf(flag);
  if (i !== -1 && argv[i + 1] != null) return Number(argv[i + 1]);
  const eq = argv.find((a) => a.startsWith(`${flag}=`));
  return eq ? Number(eq.slice(flag.length + 1)) : fallback;
}

function loadContext() {
  const cards = readJson("public/cards_v2-data.json");
  const decklists = readJson("public/decklists-data.json");
  const draftRecords = readJson("public/draft-records-data.json");
  const dreamcallers = readJson("public/dreamcallers-v2-data.json");
  const meta = readJson("data/buildaround_support.json");
  const pickRecords =
    Array.isArray(draftRecords) && draftRecords.length
      ? draftRecords.map((r) => ({ packs: r.packIds, picks: r.pickIds }))
      : undefined;
  const poolData = buildPoolData(cards, decklists, pickRecords);
  return { dreamcallers, meta, poolData };
}

// Stable JSON of a pool's capped copy counts, for byte-identity comparison.
function canonicalPool(pool) {
  return JSON.stringify(
    [...pool.counts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)),
  );
}

// 1. Bake-pipeline fidelity: `embedded` on the record matrix == official sigseed.
function checkFidelity(ctx, pairs) {
  const matrix = buildPickfitCorpus(ctx.poolData);
  ctx.poolData.affinityCorpus = matrix;
  let checked = 0;
  let identical = 0;
  const mismatches = [];
  outer: for (let seed = 0; seed < 64; seed++) {
    for (const dc of ctx.dreamcallers) {
      const sig = dc.signatureCards ?? [];
      const sigPool = generatePoolFromData(
        ctx.poolData,
        seed >>> 0,
        undefined,
        "sigseed",
        undefined,
        POOL_TARGET_SIZE,
        sig,
      );
      const embPool = generatePoolFromData(
        ctx.poolData,
        seed >>> 0,
        undefined,
        "embedded",
        undefined,
        POOL_TARGET_SIZE,
        sig,
      );
      checked += 1;
      if (canonicalPool(sigPool) === canonicalPool(embPool)) identical += 1;
      else mismatches.push(`${dc.name} @ seed ${seed}`);
      if (checked >= pairs) break outer;
    }
  }
  return { checked, identical, mismatches, pass: identical === checked };
}

// Compute the headline metrics for a variant over `seeds × dreamcallers` pools.
function computeMetrics(ctx, variant, seeds) {
  const allAdequacies = [];
  const steeredAdequacies = [];
  const trapsPerPool = [];
  const buildableHist = new Map();
  const standaloneArr = [...STANDALONE_THEMES];
  for (const t of standaloneArr) buildableHist.set(t, 0);
  const distinctCards = new Set();

  const steeredByDc = new Map();
  for (const dc of ctx.dreamcallers) {
    steeredByDc.set(dc.name, dominantSignatureTheme(dc.signatureCards, ctx.meta) !== null);
  }

  for (const dc of ctx.dreamcallers) {
    const sig = dc.signatureCards ?? [];
    const steered = steeredByDc.get(dc.name) === true;
    for (let seed = 0; seed < seeds; seed++) {
      const pool = generatePoolFromData(
        ctx.poolData,
        seed >>> 0,
        undefined,
        variant,
        undefined,
        POOL_TARGET_SIZE,
        sig,
      );
      for (const inst of scorePool(pool.counts, ctx.meta, TIER_TARGET, STANDALONE_THEMES)) {
        allAdequacies.push(inst.adequacy);
        if (steered) steeredAdequacies.push(inst.adequacy);
      }
      trapsPerPool.push(trapCards(pool.counts, ctx.meta, TIER_TARGET, TRAP_TAU, null).length);
      for (const t of buildableThemes(pool.counts, ctx.meta, STANDALONE_THEMES)) {
        buildableHist.set(t, buildableHist.get(t) + 1);
      }
      for (const name of pool.counts.keys()) distinctCards.add(name);
    }
  }

  const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  return {
    adequacy: mean(allAdequacies) * 100,
    adequacySteered: mean(steeredAdequacies) * 100,
    traps: mean(trapsPerPool),
    themeEvenness:
      normalizedEntropy(
        standaloneArr.map((t) => buildableHist.get(t) ?? 0),
        standaloneArr.length,
      ) * 100,
    cards: distinctCards.size,
  };
}

// Negative-control corpora (Section 11): synergy shuffled / synergy dropped.
// `shuffled` keeps each row's value multiset but reassigns those values to
// randomly drawn target cards from the whole universe, destroying which-partners-
// which globally while preserving the value distribution.
function makeShuffledCorpus(corpus) {
  const rng = makeRng(0xc0ffee);
  const universe = corpus.cards;
  const affinity = new Map();
  for (const [d, row] of corpus.affinity) {
    const values = [...row.values()];
    const k = values.length;
    // Partial Fisher-Yates over a copy of the universe to draw k distinct
    // targets (excluding the source d).
    const pool = universe.filter((c) => c !== d);
    const targets = [];
    for (let i = 0; i < k && i < pool.length; i++) {
      const j = i + Math.floor(rng() * (pool.length - i));
      [pool[i], pool[j]] = [pool[j], pool[i]];
      targets.push(pool[i]);
    }
    const newRow = new Map();
    for (let i = 0; i < targets.length; i++) newRow.set(targets[i], values[i]);
    affinity.set(d, newRow);
  }
  return { cards: [...universe], affinity, prior: new Map(corpus.prior) };
}

function makePriorOnlyCorpus(corpus) {
  return {
    cards: [...corpus.cards],
    affinity: new Map(),
    prior: new Map(corpus.prior),
  };
}

function run() {
  const argv = process.argv.slice(2);
  const seeds = num(argv, "--seeds", DEFAULT_SEEDS);
  const fidelityPairs = num(argv, "--fidelity-pairs", 32);
  const asJson = argv.includes("--json");
  const ctx = loadContext();

  if (!existsSync(resolve(ROOT, "data/affinity_embedding.json"))) {
    console.error("Missing data/affinity_embedding.json. Run `npm run bake-affinity-corpus` first.");
    process.exit(1);
  }
  const embedding = deserializeCorpus(readJson("data/affinity_embedding.json"));

  // 1. Fidelity (sets ctx.poolData.affinityCorpus = matrix while it runs).
  const fidelity = checkFidelity(ctx, fidelityPairs);

  // Reference: the live records sigseed generator.
  ctx.poolData.affinityCorpus = buildPickfitCorpus(ctx.poolData);
  const live = computeMetrics(ctx, "sigseed", seeds);

  // 2. Embedding metric parity.
  ctx.poolData.affinityCorpus = embedding;
  const emb = computeMetrics(ctx, "embedded", seeds);

  // 3. Negative controls.
  const matrix = buildPickfitCorpus(ctx.poolData);
  ctx.poolData.affinityCorpus = makeShuffledCorpus(matrix);
  const shuffled = computeMetrics(ctx, "embedded", seeds);
  ctx.poolData.affinityCorpus = makePriorOnlyCorpus(matrix);
  const priorOnly = computeMetrics(ctx, "embedded", seeds);

  const checks = {
    fidelity: fidelity.pass,
    adequacy: emb.adequacy >= ACCEPT.adequacy,
    traps: emb.traps <= ACCEPT.traps,
    themeEvenness: emb.themeEvenness >= ACCEPT.themeEvenness,
    cards: emb.cards >= ACCEPT.cards,
    controlShuffled: shuffled.adequacy < emb.adequacy - 5,
    controlPriorOnly: priorOnly.themeEvenness < emb.themeEvenness - 20,
  };
  const pass = Object.values(checks).every(Boolean);

  if (asJson) {
    console.log(JSON.stringify({ seeds, fidelity, live, emb, shuffled, priorOnly, accept: ACCEPT, checks, pass }, null, 2));
    process.exit(pass ? 0 : 1);
  }

  const f3 = (x) => x.toFixed(3);
  const f1 = (x) => x.toFixed(1);
  console.log(`Affinity-corpus parity (${seeds} seeds x ${ctx.dreamcallers.length} Dreamcallers)\n`);
  console.log(`1. Bake-pipeline fidelity (embedded on records matrix == official sigseed):`);
  console.log(`   ${fidelity.identical}/${fidelity.checked} pools byte-identical   ${fidelity.pass ? "PASS" : "FAIL"}`);
  if (fidelity.mismatches.length) {
    console.log(`   mismatches: ${fidelity.mismatches.slice(0, 5).join("; ")}`);
  }
  console.log("");
  console.log(`2. Embedding metric parity (acceptance for rank >= 16):`);
  const row = (label, m) =>
    `   ${label.padEnd(12)} adeq ${f1(m.adequacy).padStart(5)}  adeq(steer) ${f1(m.adequacySteered).padStart(5)}  traps ${f3(m.traps).padStart(6)}  themeEven ${f1(m.themeEvenness).padStart(5)}  #cards ${String(m.cards).padStart(4)}`;
  console.log(row("exact/live", live));
  console.log(row("embedding", emb));
  console.log(
    `   bar:         adeq >= ${ACCEPT.adequacy}   traps <= ${ACCEPT.traps}   themeEven >= ${ACCEPT.themeEvenness}   #cards >= ${ACCEPT.cards}`,
  );
  console.log(
    `   ${checks.adequacy ? "PASS" : "FAIL"} adequacy   ${checks.traps ? "PASS" : "FAIL"} traps   ${checks.themeEvenness ? "PASS" : "FAIL"} themeEven   ${checks.cards ? "PASS" : "FAIL"} #cards`,
  );
  console.log("");
  console.log(`3. Negative controls (must score materially worse):`);
  console.log(row("shuffled", shuffled), `  ${checks.controlShuffled ? "PASS" : "FAIL"}`);
  console.log(row("prior-only", priorOnly), `  ${checks.controlPriorOnly ? "PASS" : "FAIL"}`);
  console.log("");
  console.log(`OVERALL: ${pass ? "PASS" : "FAIL"}`);
  process.exit(pass ? 0 : 1);
}

run();
