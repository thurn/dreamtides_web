// Offline validation + tuning harness for coherent opponent deck construction
// (design `docs/cards2/opponent_deck_coherent_draft_design.md`). It measures
// whether generated opponent decks are internally COHERENT — defined purely as
// resemblance to the real human decks in `docs/draft_records_adapted/`, using the
// same IDF machinery as the draft-replay fit model. No human labels, no archetype
// taxonomy: coherence is corpus-relative only.
//
// The harness generates opponent decks across seeds and completion levels, scores
// each, and compares the distribution against four reference populations scored
// the same way:
//   - real corpus decks       (the upper bound generated decks should approach)
//   - old uniform-random       (the regression baseline the new system must beat)
//   - size-matched random      (the floor)
//   - greedy (zero exploration)(a coherence ceiling for the new picker)
// It also reports the build-around ORPHAN RATE (payoff cards present without
// enough of the cards they reward, where the reward relationship is inferred from
// corpus co-occurrence, not card text), checks coherence + a power proxy are
// monotonic in completion level, and measures per-affiliation affiliation fit.
//
// TS<->JS MIRROR. The scoring/draft below faithfully reimplements
// src/battle/integration/{coherence,coherent-draft,opponent-deck}.ts and
// src/draft/replay/fit-model.ts. If you change a formula in one, change it here.
//
// Usage:
//   npm run opponent-coherence-metric
//   node scripts/opponent-coherence-experiment.mjs --seeds 8 --json

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "smol-toml";
import {
  loadCorpus,
  buildFitModel,
  DEFAULT_TUNING,
} from "./draft-replay-experiment.mjs";
import { compileOpponentsData } from "./opponents-data.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readText = (p) => readFileSync(resolve(ROOT, p), "utf8");

// ---------------------------------------------------------------------------
// Authored tuning used by the runtime opponent builder.
// ---------------------------------------------------------------------------

const authoredCards = parse(readText("data/cards.toml")).cards;
const opponentsData = compileOpponentsData(
  parse(readText("data/opponents.toml")),
  { cardIds: authoredCards.map((card) => card.id) },
);
const coherentConfig = opponentsData.coherentDraft;
const COHERENCE_TUNING = {
  knn: coherentConfig.coherence.nearestNeighbors,
  wNeighbor: coherentConfig.coherence.neighborWeight,
  wCooccur: coherentConfig.coherence.cooccurrenceWeight,
  wSelf: coherentConfig.coherence.selfConsistencyWeight,
  selfDistractors: coherentConfig.coherence.selfDistractors,
  selfRecallK: coherentConfig.coherence.selfRecallK,
};

const LAYER_COUNT = parse(readText("data/atlas.toml")).layers.length;
const MIN_DISTINCT = coherentConfig.distinctCardCurve.first;
const MAX_DISTINCT = coherentConfig.distinctCardCurve.last;
const MIN_REMOVALS = coherentConfig.removalCurve.first;
const MAX_REMOVALS = coherentConfig.removalCurve.last;
const EARLY_TEMP = coherentConfig.temperatureCurve.first;
const LATE_TEMP = coherentConfig.temperatureCurve.last;
const BEST_OF_N = coherentConfig.bestOf;
const PACK_SOURCE_RECORDS = coherentConfig.packSourceRecords;
const AFFILIATION_OBJECTIVE_WEIGHT = coherentConfig.affiliationObjectiveWeight;
const DRAFT_SEED_SALT = 0x9e3779b1;

const progressFraction = (level) => {
  const last = Math.max(1, LAYER_COUNT - 1);
  return Math.min(Math.max(level, 0), last) / last;
};
const lerp = (a, b, f) => a + (b - a) * f;
const distinctTarget = (level) =>
  MIN_DISTINCT +
  Math.round((MAX_DISTINCT - MIN_DISTINCT) * progressFraction(level));
const removalCount = (level) =>
  MIN_REMOVALS +
  Math.round((MAX_REMOVALS - MIN_REMOVALS) * progressFraction(level));
const pickBudget = (level) => distinctTarget(level) + removalCount(level);
const draftTemperature = (level) =>
  lerp(EARLY_TEMP, LATE_TEMP, progressFraction(level));
const copiesPerCard = (level) => 1 + Math.round(1 * progressFraction(level));

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32), mirroring createSeededRng.
// ---------------------------------------------------------------------------

function createSeededRng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Fit scoring in UUID space (mirrors fit-model.ts scoreCandidatesForDeck).
// ---------------------------------------------------------------------------

function idfCosine(a, b, idfOf) {
  const [small, large] = a.cards.size <= b.cards.size ? [a, b] : [b, a];
  let dot = 0;
  for (const c of small.cards) if (large.cards.has(c)) dot += idfOf(c) ** 2;
  return dot / (a.norm * b.norm);
}

function minMaxNormalize(values) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const range = hi - lo;
  if (!(range > 0)) return values.map(() => 0);
  return values.map((v) => (v - lo) / range);
}

function scoreNeighborCF(candidates, deckSet, model, tuning) {
  const { idf, decks } = model;
  const scores = new Map();
  if (deckSet.size === 0) return scores;
  let sq = 0;
  for (const c of deckSet) {
    const w = idf.get(c) ?? 0;
    sq += w * w;
  }
  const deckVec = { cards: deckSet, norm: Math.sqrt(sq) || 1 };
  const idfOf = (c) => idf.get(c) ?? 0;
  const scored = decks.map((d, i) => ({
    i,
    sim: idfCosine(deckVec, d, idfOf),
  }));
  scored.sort((a, b) => b.sim - a.sim || a.i - b.i);
  const neighbors = scored.slice(0, tuning.K);
  let sumSim = 0;
  for (const nb of neighbors) sumSim += nb.sim;
  const denom = Math.max(sumSim, 1e-9);
  for (const id of candidates) {
    let acc = 0;
    for (const nb of neighbors) if (decks[nb.i].cards.has(id)) acc += nb.sim;
    scores.set(id, (acc / denom) * (idf.get(id) ?? 0));
  }
  return scores;
}

function scoreCooccur(candidates, deckSet, model) {
  const { coocNorm } = model;
  const scores = new Map();
  if (deckSet.size === 0) return scores;
  const sizeDenom = Math.max(deckSet.size, 1);
  for (const id of candidates) {
    let acc = 0;
    for (const d of deckSet) acc += coocNorm.get(d)?.get(id) ?? 0;
    scores.set(id, acc / sizeDenom);
  }
  return scores;
}

/** Map candidate UUID -> blended fit, given the deck so far (a UUID set). */
function scoreFit(candidates, deckSet, model, tuning) {
  const nf = scoreNeighborCF(candidates, deckSet, model, tuning);
  const co = scoreCooccur(candidates, deckSet, model);
  const nfRaw = candidates.map((c) => nf.get(c) ?? 0);
  const coRaw = candidates.map((c) => co.get(c) ?? 0);
  const prRaw = candidates.map((c) => model.prior.get(c) ?? 0);
  const nfN = minMaxNormalize(nfRaw);
  const coN = minMaxNormalize(coRaw);
  const prN = minMaxNormalize(prRaw);
  const out = new Map();
  candidates.forEach((c, i) => {
    out.set(
      c,
      tuning.alpha * nfN[i] + tuning.beta * coN[i] + tuning.gamma * prN[i],
    );
  });
  return out;
}

// ---------------------------------------------------------------------------
// Coherence scoring (mirrors coherence.ts).
// ---------------------------------------------------------------------------

function mixHash(a, b) {
  let h = (a * 0x9e3779b1) ^ (b * 0x85ebca77);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 13), 0x297a2d39);
  h ^= h >>> 16;
  return h >>> 0;
}

function nearestNeighbor(deckSet, model, knn) {
  if (deckSet.size === 0 || model.decks.length === 0) return 0;
  const idfOf = (c) => model.idf.get(c) ?? 0;
  let sq = 0;
  for (const c of deckSet) sq += idfOf(c) ** 2;
  const vec = { cards: deckSet, norm: Math.sqrt(sq) || 1 };
  const sims = model.decks
    .map((d) => idfCosine(vec, d, idfOf))
    .sort((a, b) => b - a);
  const k = Math.min(knn, sims.length);
  if (k === 0) return 0;
  let sum = 0;
  for (let i = 0; i < k; i += 1) sum += sims[i];
  return sum / k;
}

function meanPairwiseCooccur(ids, model) {
  if (ids.length < 2) return 0;
  let sum = 0;
  let pairs = 0;
  for (let i = 0; i < ids.length; i += 1) {
    const row = model.coocNorm.get(ids[i]);
    for (let j = i + 1; j < ids.length; j += 1) {
      sum += row?.get(ids[j]) ?? 0;
      pairs += 1;
    }
  }
  return pairs === 0 ? 0 : sum / pairs;
}

function selfConsistency(ids, model, tuning) {
  const universe = [...model.prior.keys()];
  if (universe.length === 0 || ids.length === 0) return 0;
  const numberOf = (id) => model.numberOf.get(id) ?? -1;
  const inDeck = new Set(ids);
  let testable = 0;
  let hits = 0;
  for (const held of ids) {
    const rest = new Set(ids.filter((c) => c !== held));
    if (rest.size === 0) continue;
    const heldNum = numberOf(held);
    const distractors = universe
      .filter((c) => c !== held && !inDeck.has(c))
      .map((c) => ({ c, h: mixHash(heldNum, numberOf(c)) }))
      .sort((a, b) => a.h - b.h || numberOf(a.c) - numberOf(b.c))
      .slice(0, tuning.selfDistractors)
      .map((e) => e.c);
    const candidates = [...distractors, held];
    const fit = scoreFit(candidates, rest, model, DEFAULT_TUNING);
    const heldFit = fit.get(held) ?? -Infinity;
    let rank = 1;
    for (const c of candidates) {
      if (c === held) continue;
      const f = fit.get(c) ?? 0;
      if (f > heldFit || (f === heldFit && numberOf(c) < heldNum)) rank += 1;
    }
    testable += 1;
    if (rank <= tuning.selfRecallK) hits += 1;
  }
  return testable === 0 ? 0 : hits / testable;
}

function scoreCoherence(deckIds, model, tuning = COHERENCE_TUNING) {
  const ids = [...new Set(deckIds.filter((id) => model.numberOf.has(id)))];
  const set = new Set(ids);
  const nn = nearestNeighbor(set, model, tuning.knn);
  const co = meanPairwiseCooccur(ids, model);
  const self = selfConsistency(ids, model, tuning);
  return {
    score: tuning.wNeighbor * nn + tuning.wCooccur * co + tuning.wSelf * self,
    nearestNeighbor: nn,
    meanPairwiseCooccur: co,
    selfConsistency: self,
  };
}

// ---------------------------------------------------------------------------
// Coherent draft (mirrors coherent-draft.ts + opponent-deck.ts).
// ---------------------------------------------------------------------------

function weightedIndex(weights, rng) {
  if (weights.length === 0) return -1;
  let total = 0;
  for (const w of weights) total += w > 0 ? w : 0;
  if (!(total > 0)) return Math.floor(rng() * weights.length) % weights.length;
  let roll = rng() * total;
  for (let i = 0; i < weights.length; i += 1) {
    roll -= weights[i] > 0 ? weights[i] : 0;
    if (roll <= 0) return i;
  }
  return weights.length - 1;
}

function sampleCandidate(candidates, fitOf, temperature, rng) {
  const ranked = [...candidates].sort(
    (a, b) => fitOf(b) - fitOf(a) || (a < b ? -1 : 1),
  );
  if (!(temperature > 0)) return ranked[0];
  let maxFit = -Infinity;
  for (const c of candidates) maxFit = Math.max(maxFit, fitOf(c));
  const weights = candidates.map((c) =>
    Math.exp((fitOf(c) - maxFit) / temperature),
  );
  const idx = weightedIndex(weights, rng);
  return candidates[idx === -1 ? 0 : idx];
}

function simulateDraft({
  model,
  packs,
  signatures,
  budget,
  temperature,
  packWeights,
  rng,
}) {
  const picked = [];
  const pickedSet = new Set();
  if (packs.length === 0) return picked;
  const weights = packs.map((_, i) =>
    packWeights && packWeights[i] > 0 ? packWeights[i] : 1,
  );
  const exhausted = new Set();
  while (picked.length < budget && exhausted.size < packs.length) {
    const pi = weightedIndex(weights, rng);
    if (pi === -1) break;
    const seen = new Set();
    const candidates = [];
    for (const c of packs[pi]) {
      if (pickedSet.has(c) || seen.has(c)) continue;
      seen.add(c);
      candidates.push(c);
    }
    if (candidates.length === 0) {
      weights[pi] = 0;
      exhausted.add(pi);
      continue;
    }
    const deckSoFar = new Set([...picked, ...signatures]);
    const fit = scoreFit(candidates, deckSoFar, model, DEFAULT_TUNING);
    const card = sampleCandidate(
      candidates,
      (c) => fit.get(c) ?? 0,
      temperature,
      rng,
    );
    picked.push(card);
    pickedSet.add(card);
  }
  return picked;
}

function cardCohesion(card, rest, model) {
  if (rest.length === 0) return 0;
  let sum = 0;
  for (const other of rest) sum += model.coocNorm.get(other)?.get(card) ?? 0;
  return sum / rest.length;
}

function pruneToTarget(picked, target, model) {
  const kept = [...picked];
  const removed = [];
  while (kept.length > target) {
    let worst = 0;
    let worstScore = Infinity;
    for (let i = 0; i < kept.length; i += 1) {
      const rest = kept.filter((_, j) => j !== i);
      const s = cardCohesion(kept[i], rest, model);
      if (s < worstScore || (s === worstScore && kept[i] > kept[worst])) {
        worstScore = s;
        worst = i;
      }
    }
    removed.push(kept[worst]);
    kept.splice(worst, 1);
  }
  return { kept, removed };
}

function buildPackSource(records, seed) {
  const rng = createSeededRng(seed ^ 0x51ed270b);
  const indices = records.map((_, i) => i);
  const take = Math.min(PACK_SOURCE_RECORDS, indices.length);
  for (let i = 0; i < take; i += 1) {
    const j = i + Math.floor(rng() * (indices.length - i));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const packs = [];
  for (let i = 0; i < take; i += 1) {
    for (const pack of records[indices[i]].packIds) {
      const distinct = [...new Set(pack)];
      if (distinct.length > 0) packs.push(distinct);
    }
  }
  return packs;
}

/** Best-of-N coherent draft for a battle. `affinity` (UUID->0..1) and
 * `biasStrength` are null/0 for a neutral build. Returns the winner's kept deck
 * plus the kept-fit power proxy term. */
function buildOpponentDeck(
  records,
  model,
  level,
  seed,
  { signatures = [], affinity = null, biasStrength = 0 } = {},
) {
  const packs = buildPackSource(records, seed);
  if (packs.length === 0) return null;
  const target = distinctTarget(level);
  const budget = pickBudget(level);
  const temperature = draftTemperature(level);

  const seeds = [...signatures];
  if (affinity) {
    // Widen the seed with the affiliation probe's strongest cards.
    const probe = [...affinity.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map((e) => e[0]);
    seeds.push(...probe);
  }
  const packWeights = affinity
    ? packs.map((pack) => {
        let sum = 0;
        for (const c of pack) sum += affinity.get(c) ?? 0;
        return 1 + Math.max(0, biasStrength) * (sum / pack.length);
      })
    : undefined;

  let winner = null;
  for (let n = 0; n < BEST_OF_N; n += 1) {
    const rng = createSeededRng((seed ^ (DRAFT_SEED_SALT * (n + 1))) >>> 0);
    const picked = simulateDraft({
      model,
      packs,
      signatures: seeds,
      budget,
      temperature,
      packWeights,
      rng,
    });
    const { kept } = pruneToTarget(picked, target, model);
    const coherence = scoreCoherence(kept, model);
    const affFit = affinity ? deckAffinityFit(kept, affinity) : 0;
    const combined =
      coherence.score + (affinity ? AFFILIATION_OBJECTIVE_WEIGHT * affFit : 0);
    if (winner === null || combined > winner.combined) {
      winner = { kept, coherence, affFit, combined };
    }
  }
  return { ...winner, level };
}

// ---------------------------------------------------------------------------
// Affiliation fit (mirrors affiliation-weights.ts).
// ---------------------------------------------------------------------------

function buildAffinityById(model, probeIds) {
  const idfOf = (c) => model.idf.get(c) ?? 0;
  const probe = new Set(probeIds.filter((id) => idfOf(id) > 0));
  if (probe.size === 0) return null;
  let psq = 0;
  for (const c of probe) psq += idfOf(c) ** 2;
  const probeVec = { cards: probe, norm: Math.sqrt(psq) || 1 };
  const deckSim = model.decks.map((d) => idfCosine(probeVec, d, idfOf));
  const raw = new Map();
  for (let i = 0; i < model.decks.length; i += 1) {
    const sim = deckSim[i];
    if (sim <= 0) continue;
    for (const c of model.decks[i].cards) {
      if (sim > (raw.get(c) ?? 0)) raw.set(c, sim);
    }
  }
  let max = 0;
  for (const v of raw.values()) if (v > max) max = v;
  const affinity = new Map();
  if (max > 0) for (const [c, v] of raw) affinity.set(c, v / max);
  return affinity;
}

function deckAffinityFit(ids, affinity) {
  const distinct = [...new Set(ids)];
  if (distinct.length === 0) return 0;
  let sum = 0;
  for (const c of distinct) sum += affinity.get(c) ?? 0;
  return sum / distinct.length;
}

// ---------------------------------------------------------------------------
// Build-around orphan rate (corpus-co-occurrence inferred, label-free).
// ---------------------------------------------------------------------------

// A payoff card's "enablers" are inferred as its top corpus co-occurrence
// partners. A payoff is an ORPHAN in a deck when too few of those top partners
// are present. This reads the bug ("payoffs without their enablers") straight
// from corpus co-occurrence, with no card-text taxonomy.
const ORPHAN_TOP_PARTNERS = 8;
const ORPHAN_MIN_PRESENT_FRAC = 0.25;

function orphanRate(ids, model) {
  const distinct = [...new Set(ids)].filter((id) => model.coocNorm.has(id));
  if (distinct.length === 0) return 0;
  const inDeck = new Set(distinct);
  let payoffs = 0;
  let orphans = 0;
  for (const c of distinct) {
    const partners = [...(model.coocNorm.get(c)?.entries() ?? [])]
      .sort((a, b) => b[1] - a[1])
      .slice(0, ORPHAN_TOP_PARTNERS)
      .map((e) => e[0]);
    if (partners.length === 0) continue;
    payoffs += 1;
    const present = partners.filter((p) => inDeck.has(p)).length;
    if (present / partners.length < ORPHAN_MIN_PRESENT_FRAC) orphans += 1;
  }
  return payoffs === 0 ? 0 : orphans / payoffs;
}

// ---------------------------------------------------------------------------
// Reference populations.
// ---------------------------------------------------------------------------

function sizeMatchedRandom(universe, size, rng) {
  const pool = [...universe];
  const out = [];
  for (let i = 0; i < size && pool.length > 0; i += 1) {
    const idx = Math.floor(rng() * pool.length);
    out.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return out;
}

// The old uniform-random construction: a themed sub-pool (cards co-occurring with
// a random seed card) sampled uniformly, mirroring "generate a pool, then sample
// uniformly". This is the regression baseline the new system must beat.
function oldRandomDeck(universe, model, size, rng) {
  const seed = universe[Math.floor(rng() * universe.length)];
  const partners = new Set([seed, ...(model.coocNorm.get(seed)?.keys() ?? [])]);
  // Widen the themed pool with random universe cards so it is ~110 like the old
  // generated pool, then sample uniformly.
  const pool = [...partners];
  while (pool.length < 110 && pool.length < universe.length) {
    const c = universe[Math.floor(rng() * universe.length)];
    if (!partners.has(c)) {
      partners.add(c);
      pool.push(c);
    }
  }
  return sizeMatchedRandom(pool, size, rng);
}

// ---------------------------------------------------------------------------
// Stats helpers.
// ---------------------------------------------------------------------------

const mean = (xs) =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
const r3 = (x) => Number(x.toFixed(3));
function stats(xs) {
  if (xs.length === 0) return { n: 0, mean: 0, min: 0, max: 0 };
  const sorted = [...xs].sort((a, b) => a - b);
  return {
    n: xs.length,
    mean: r3(mean(xs)),
    min: r3(sorted[0]),
    max: r3(sorted[sorted.length - 1]),
  };
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------

function numArg(argv, flag, fallback) {
  const i = argv.indexOf(flag);
  if (i === -1 || i + 1 >= argv.length) return fallback;
  const v = Number(argv[i + 1]);
  return Number.isFinite(v) ? v : fallback;
}

function run() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes("--json");
  // The default population is large enough that the coherence-by-level statistic
  // is stable: monotonicity is a property of the generated population, not of any
  // single seed (a small seed count shows sampling-noise wiggles that vanish here).
  const seedCount = numArg(argv, "--seeds", 24);
  const SEEDS = Array.from({ length: seedCount }, (_, i) => 1000 + i * 7919);

  const { records, numberOf } = loadCorpus();
  const model = buildFitModel(
    records.map((r) => r.mainboardIds),
    DEFAULT_TUNING,
  );
  model.numberOf = numberOf;
  const universe = [...model.prior.keys()];

  // Generated decks (neutral) across seeds x completion levels.
  const generated = [];
  const generatedByLevel = new Map();
  const greedyDecks = [];
  for (let level = 0; level < LAYER_COUNT; level += 1) {
    const levelDecks = [];
    for (const seed of SEEDS) {
      const built = buildOpponentDeck(records, model, level, seed >>> 0);
      if (built) {
        generated.push(built);
        levelDecks.push(built);
      }
      // Greedy ceiling: temperature 0 (best-of-1 is enough; greedy is deterministic).
      const greedyTemp = buildOpponentDeckGreedy(
        records,
        model,
        level,
        seed >>> 0,
      );
      if (greedyTemp) greedyDecks.push(greedyTemp);
    }
    generatedByLevel.set(level, levelDecks);
  }

  // Reference populations, size-matched to the generated mid-run deck size.
  const refSize = distinctTarget(Math.floor(LAYER_COUNT / 2));
  const realCorpus = records
    .map((r) => [...new Set(r.mainboardIds)])
    .filter(
      (d) =>
        d.length >= DEFAULT_TUNING.minDeckSize &&
        d.length <= DEFAULT_TUNING.maxDeckSize,
    )
    .map((d) => scoreCoherence(d, model).score);
  const oldRandom = [];
  const sizeRandom = [];
  for (const seed of SEEDS) {
    const rngA = createSeededRng(seed >>> 0);
    const rngB = createSeededRng((seed ^ 0xabcdef) >>> 0);
    for (let i = 0; i < 7; i += 1) {
      oldRandom.push(
        scoreCoherence(oldRandomDeck(universe, model, refSize, rngA), model)
          .score,
      );
      sizeRandom.push(
        scoreCoherence(sizeMatchedRandom(universe, refSize, rngB), model).score,
      );
    }
  }

  const genScores = generated.map((d) => d.coherence.score);
  const greedyScores = greedyDecks.map((d) => d.coherence.score);

  // Orphan rates.
  const genOrphan = mean(generated.map((d) => orphanRate(d.kept, model)));
  const oldOrphanRates = [];
  for (const seed of SEEDS) {
    const rng = createSeededRng((seed ^ 0x777) >>> 0);
    for (let i = 0; i < 7; i += 1) {
      oldOrphanRates.push(
        orphanRate(oldRandomDeck(universe, model, refSize, rng), model),
      );
    }
  }
  const oldOrphan = mean(oldOrphanRates);

  // Monotonicity in completion level: coherence + power proxy.
  const levelCoherence = [];
  const levelPower = [];
  for (let level = 0; level < LAYER_COUNT; level += 1) {
    const decks = generatedByLevel.get(level);
    levelCoherence.push(mean(decks.map((d) => d.coherence.score)));
    // Power proxy: distinct size * copies + mean kept-card cohesion. Label-free,
    // monotonicity check only.
    const power = decks.map((d) => {
      const meanCohesion = mean(
        d.kept.map((c, _i, arr) =>
          cardCohesion(
            c,
            arr.filter((x) => x !== c),
            model,
          ),
        ),
      );
      return d.kept.length * copiesPerCard(level) + meanCohesion;
    });
    levelPower.push(mean(power));
  }
  // Non-decreasing within a small tolerance that absorbs residual metric noise
  // (the nearest-neighbour cosine drifts slightly as deck size grows). A real
  // coherence regression across the run is far larger than this floor.
  const MONOTONIC_TOLERANCE = 0.02;
  const nonDecreasing = (xs) =>
    xs.every((v, i) => i === 0 || v >= xs[i - 1] - MONOTONIC_TOLERANCE);

  // Affiliation fit: build affiliated decks per affiliation, compare to neutral.
  const affiliationsToml =
    parse(readText("data/affiliations.toml")).affiliations ?? [];
  const affLevel = Math.floor(LAYER_COUNT / 2);
  const affiliationResults = [];
  for (const aff of affiliationsToml) {
    const probeIds = (aff["signature-cards"] ?? [])
      .filter((id) => typeof id === "string")
      .map((id) => id.toLowerCase());
    const affinity = buildAffinityById(model, probeIds);
    if (!affinity) continue;
    const bias = aff["opponent-bias-strength"] ?? 0;
    const ownFits = [];
    const neutralFits = [];
    const ownCoherence = [];
    for (const seed of SEEDS) {
      const affiliated = buildOpponentDeck(
        records,
        model,
        affLevel,
        seed >>> 0,
        { affinity, biasStrength: bias },
      );
      const neutral = buildOpponentDeck(records, model, affLevel, seed >>> 0);
      if (affiliated) {
        ownFits.push(deckAffinityFit(affiliated.kept, affinity));
        ownCoherence.push(affiliated.coherence.score);
      }
      if (neutral) neutralFits.push(deckAffinityFit(neutral.kept, affinity));
    }
    affiliationResults.push({
      id: aff.id,
      ownFit: r3(mean(ownFits)),
      neutralFit: r3(mean(neutralFits)),
      ownCoherence: r3(mean(ownCoherence)),
    });
  }

  // Acceptance criteria.
  const genMean = mean(genScores);
  const realMean = mean(realCorpus);
  const criteria = {
    beatsRandomFloor: genMean > mean(sizeRandom) * 1.5,
    beatsOldRandom: genMean > mean(oldRandom) * 1.25,
    approachesCorpus: genMean >= realMean * 0.6,
    orphanRateReduced: genOrphan < oldOrphan,
    coherenceMonotonic: nonDecreasing(levelCoherence),
    powerMonotonic: nonDecreasing(levelPower),
    affiliationFitAchieved: affiliationResults.every(
      (a) => a.ownFit > a.neutralFit,
    ),
  };
  const allPass = Object.values(criteria).every(Boolean);

  const result = {
    seeds: SEEDS.length,
    distributions: {
      generated: stats(genScores),
      realCorpus: stats(realCorpus),
      oldRandom: stats(oldRandom),
      sizeMatchedRandom: stats(sizeRandom),
      greedy: stats(greedyScores),
    },
    orphanRate: { generated: r3(genOrphan), oldRandom: r3(oldOrphan) },
    monotonicity: {
      coherenceByLevel: levelCoherence.map(r3),
      powerByLevel: levelPower.map(r3),
    },
    affiliations: affiliationResults,
    criteria,
    pass: allPass,
  };

  if (asJson) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    reportText(result);
  }
  process.exitCode = allPass ? 0 : 1;
}

function reportText(result) {
  const d = result.distributions;
  const line = (label, s) =>
    `  ${label.padEnd(20)} n=${String(s.n).padStart(4)}  mean=${s.mean}  [${s.min}, ${s.max}]`;
  console.log("Coherent opponent deck validation");
  console.log(`Seeds: ${result.seeds}\n`);
  console.log("Coherence score distributions:");
  console.log(line("real corpus", d.realCorpus));
  console.log(line("generated", d.generated));
  console.log(line("greedy (temp 0)", d.greedy));
  console.log(line("old random", d.oldRandom));
  console.log(line("size-matched random", d.sizeMatchedRandom));
  console.log("");
  console.log(
    `Build-around orphan rate: generated=${result.orphanRate.generated}  old-random=${result.orphanRate.oldRandom}`,
  );
  console.log("");
  console.log(
    `Coherence by completion level: ${result.monotonicity.coherenceByLevel.join(", ")}`,
  );
  console.log(
    `Power proxy by completion level: ${result.monotonicity.powerByLevel.join(", ")}`,
  );
  console.log("");
  console.log("Affiliation fit (own vs neutral; own coherence):");
  for (const a of result.affiliations) {
    console.log(
      `  ${a.id.padEnd(20)} own=${a.ownFit}  neutral=${a.neutralFit}  coherence=${a.ownCoherence}`,
    );
  }
  console.log("");
  console.log("Acceptance criteria:");
  for (const [k, v] of Object.entries(result.criteria)) {
    console.log(`  [${v ? "PASS" : "FAIL"}] ${k}`);
  }
  console.log("");
  console.log(result.pass ? "ALL CRITERIA PASS" : "SOME CRITERIA FAILED");
}

/** Greedy (temperature 0) build, the coherence ceiling reference. */
function buildOpponentDeckGreedy(records, model, level, seed) {
  const packs = buildPackSource(records, seed);
  if (packs.length === 0) return null;
  const rng = createSeededRng((seed ^ DRAFT_SEED_SALT) >>> 0);
  const picked = simulateDraft({
    model,
    packs,
    signatures: [],
    budget: pickBudget(level),
    temperature: 0,
    rng,
  });
  const { kept } = pruneToTarget(picked, distinctTarget(level), model);
  return { kept, coherence: scoreCoherence(kept, model), level };
}

run();
