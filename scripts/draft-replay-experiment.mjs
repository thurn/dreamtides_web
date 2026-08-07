// Offline evaluation + tuning harness for the record-replay deck-fit heuristic.
//
// The replay draft shows the player, at each pick, the 4 cards from a real
// historical pack that best FIT the deck they have drafted so far. The ranking
// is `computeReplayOffer` in src/draft/replay/fit-model.ts: it blends a
// neighbour collaborative-filtering term, an IDF-weighted co-occurrence term,
// and a global play-rate prior -- each min-max normalized per pack -- into
// `fit = alpha*nf + beta*co + gamma*pr`, then takes the top 4.
//
// This script measures how good that heuristic is and tunes its knobs. The
// quality metric is RECALL@4: over the picks where a human actually took a card
// from a pack of more than four, how often does the heuristic's top-4 contain
// the card the human took? We compare that against two baselines on the SAME
// eligible picks -- random-4 (analytic) and popularity-4 (rank by global play
// rate, ignore the deck) -- and break it down by pack (1/2/3) and by stage
// (early/mid/late). Beating popularity-4, especially in the mid/late picks where
// the deck has defined itself, is the bar: it is the evidence that deck-FIT (not
// just card popularity) is doing real work.
//
// TS<->JS MIRROR. The scoring below is a faithful plain-JS reimplementation of
// src/draft/replay/fit-model.ts. If you change a formula in one, change it in
// the other. The eval CORPUS is built exactly the way the live bundle is
// (buildDraftRecords + buildCardMaps over cards.toml), so the corpus the
// heuristic is measured on is the corpus it runs on in the game.
//
// LEAVE-ONE-OUT. A record's own final deck must never be in the model that
// scores its picks (that would be the heuristic peeking at the answer). For each
// evaluated record we rebuild the fit model over every OTHER record's mainboard,
// EXCLUDING every seat that shares this record's draftId (sibling seats of the
// same draft event share packs and would leak). The deck the heuristic sees grows
// by TEACHER FORCING: after each pick we add the cards the human really took, so
// the deck follows the human's true trajectory rather than the heuristic's.
//
// Usage:
//   node scripts/draft-replay-experiment.mjs                 # full corpus, default tuning
//   node scripts/draft-replay-experiment.mjs --sample 150    # fast: seeded 150-record subset
//   node scripts/draft-replay-experiment.mjs --alpha 1 --beta 0.4 --gamma 0.2 --K 40
//   node scripts/draft-replay-experiment.mjs --sweep --sample 150
//   node scripts/draft-replay-experiment.mjs --json > result.json
//
// Flags: --alpha --beta --gamma --K --idf-power --min-df --max-df-frac
// --min-deck --max-deck (defaults equal DEFAULT_FIT_TUNING), --sample N, --seed S
// (default fixed), --json, --sweep.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parse } from "smol-toml";
import { buildDraftRecords, buildCardMaps } from "./setup-assets.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readText = (p) => readFileSync(resolve(ROOT, p), "utf8");

// The offer size the live replay shows. A pick is only eligible to score when
// its deduped pack has strictly more than this many cards (otherwise the offer
// is the whole pack and there is nothing to rank).
const OFFER_SIZE = 4;

// Default tuning. MUST equal DEFAULT_FIT_TUNING in src/draft/replay/fit-model.ts.
// Tuned against recall@4 over the full 993-record corpus: this config scores
// recall@4 = 80.4% vs a popularity-4 baseline of 52.1% and a random-4 baseline
// of 46.7% (+28.3 pts over popularity), with recall rising monotonically by pack
// (P1 75.4% < P2 82.0% < P3 84.0%) and by stage (early 69.5% < mid 82.2% < late
// 89.5%) -- the deck-fit signal strengthens as the deck defines itself.
//
// The sweep showed K is the dominant lever (recall climbs from ~70% at K=10 to a
// plateau by K=50); K=50 captures the plateau at half the per-pick neighbour
// cost of K=100. Co-occurrence (beta) is a useful secondary signal (+~1 pt over
// beta=0). The prior (gamma) is kept small: a large gamma pulls toward popular
// cards and erodes mid/late recall, but a small weight helps the early picks and
// is the intended pick-1 fallback when the deck is empty.
export const DEFAULT_TUNING = {
  alpha: 1.0,
  beta: 0.9,
  gamma: 0.25,
  K: 50,
  idfPower: 1,
  minDf: 2,
  maxDfFrac: 0.6,
  minDeckSize: 16,
  maxDeckSize: 34,
};

// ===========================================================================
// Scoring: a faithful plain-JS mirror of src/draft/replay/fit-model.ts.
// ===========================================================================

/**
 * Build the fit model from a corpus of decklists. Mirrors `buildFitModel`:
 * hygiene-filter decks to a distinct-card range, derive df/idf with the
 * rare/common cutoffs, build per-deck IDF vectors, the play-rate prior, and the
 * normalized IDF-weighted co-occurrence lookup -- all from the SAME filtered set.
 *
 * @param corpusDecks readonly array of card-id arrays (one per deck; lowercased
 *   stable UUIDs).
 * @param tuning the FitTuning knobs.
 * @returns { decks, idf, prior, coocNorm } in card-id space.
 */
export function buildFitModel(corpusDecks, tuning) {
  // 1. Hygiene filter: keep decks whose DISTINCT-card count is in range.
  const filtered = [];
  for (const deck of corpusDecks) {
    const distinct = new Set(deck);
    if (
      distinct.size >= tuning.minDeckSize &&
      distinct.size <= tuning.maxDeckSize
    ) {
      filtered.push(distinct);
    }
  }
  const n = filtered.length;

  // 2. df, then idf with the rare/common cutoffs (idf 0 outside the window).
  const df = new Map();
  for (const s of filtered) for (const c of s) df.set(c, (df.get(c) ?? 0) + 1);
  const maxDf = tuning.maxDfFrac * n;
  const idf = new Map();
  for (const [c, d] of df) {
    if (d < tuning.minDf || d > maxDf) {
      idf.set(c, 0);
      continue;
    }
    idf.set(c, Math.log((n + 1) / d) ** tuning.idfPower);
  }
  const idfOf = (c) => idf.get(c) ?? 0;

  // 3. Per-deck IDF vectors. norm = sqrt(sum idf^2), floored to 1.
  const decks = filtered.map((cards) => {
    let sq = 0;
    for (const c of cards) {
      const w = idfOf(c);
      sq += w * w;
    }
    return { cards, norm: Math.sqrt(sq) || 1 };
  });

  // 4. Global play-rate prior: fraction of filtered decks running each card.
  const prior = new Map();
  if (n > 0) for (const [c, d] of df) prior.set(c, d / n);

  // 5. Sparse symmetric IDF-weighted co-occurrence, normalized by source df.
  const cooc = new Map();
  const bump = (a, b, w) => {
    let row = cooc.get(a);
    if (row === undefined) {
      row = new Map();
      cooc.set(a, row);
    }
    row.set(b, (row.get(b) ?? 0) + w);
  };
  for (const s of filtered) {
    const cards = [...s];
    for (let i = 0; i < cards.length; i += 1) {
      const a = cards[i];
      const wa = idfOf(a);
      for (let j = i + 1; j < cards.length; j += 1) {
        const b = cards[j];
        const w = wa * idfOf(b);
        if (w === 0) continue;
        bump(a, b, w);
        bump(b, a, w);
      }
    }
  }
  const coocNorm = new Map();
  for (const [a, row] of cooc) {
    const dfa = df.get(a) ?? 0;
    if (dfa === 0) continue;
    const normRow = new Map();
    for (const [b, w] of row) normRow.set(b, w / dfa);
    coocNorm.set(a, normRow);
  }

  return { decks, idf, prior, coocNorm };
}

/** IDF-weighted cosine similarity between two IDF deck vectors. Mirrors
 * `idfCosine`. */
function idfCosine(a, b, idfOf) {
  const [small, large] = a.cards.size <= b.cards.size ? [a, b] : [b, a];
  let dot = 0;
  for (const c of small.cards) if (large.cards.has(c)) dot += idfOf(c) ** 2;
  return dot / (a.norm * b.norm);
}

/** Min-max normalize to [0,1]; a constant array yields all zeros. Mirrors
 * `minMaxNormalize`. */
export function minMaxNormalize(values) {
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

/** neighborCF stage. Mirrors `scoreNeighborCF`: empty deck -> empty map. */
function scoreNeighborCF(candidateIds, deckSet, model, tuning) {
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

  const scored = decks.map((d, i) => ({ i, sim: idfCosine(deckVec, d, idfOf) }));
  scored.sort((a, b) => b.sim - a.sim || a.i - b.i);
  const neighbors = scored.slice(0, tuning.K);
  let sumSim = 0;
  for (const nb of neighbors) sumSim += nb.sim;
  const denom = Math.max(sumSim, 1e-9);

  for (const id of candidateIds) {
    let acc = 0;
    for (const nb of neighbors) {
      if (decks[nb.i].cards.has(id)) acc += nb.sim;
    }
    scores.set(id, (acc / denom) * (idf.get(id) ?? 0));
  }
  return scores;
}

/** cooccur stage. Mirrors `scoreCooccur`: empty deck -> empty map. */
function scoreCooccur(candidateIds, deckSet, model) {
  const { coocNorm } = model;
  const scores = new Map();
  if (deckSet.size === 0) return scores;
  const sizeDenom = Math.max(deckSet.size, 1);
  for (const id of candidateIds) {
    let acc = 0;
    for (const d of deckSet) acc += coocNorm.get(d)?.get(id) ?? 0;
    scores.set(id, acc / sizeDenom);
  }
  return scores;
}

/**
 * Rank a pack and return the best `offerSize` card ids. The id-space mirror of
 * `computeReplayOffer` (the runtime works in card-number space and translates at
 * the boundary; here the corpus is already card ids, so we carry an id->number
 * map only for the deterministic card-number tie-break).
 *
 * @param packIds pack card ids (may contain duplicates / unknowns).
 * @param deckIds the deck so far (card ids).
 * @param model from {@link buildFitModel}.
 * @param tuning FitTuning knobs.
 * @param numberOf id -> card number (for the tie-break; missing -> -1, the
 *   same fallback the runtime uses).
 * @param offerSize how many ids to return.
 * @returns the offered card ids, ranked best-fit first (or sorted by card
 *   number when the deduped pack is <= offerSize).
 */
export function rankTop4(
  packIds,
  deckIds,
  model,
  tuning,
  numberOf,
  offerSize = OFFER_SIZE,
) {
  // 1. Candidates: dedupe first-seen (drop unknown ids -- here every corpus id
  //    is known, but a caller may pass an unknown, mirroring the runtime).
  const seen = new Set();
  const candidateIds = [];
  for (const id of packIds) {
    if (model.prior.has(id) || numberOf.has(id)) {
      // Known to the corpus or at least to the card index; dedupe first-seen.
      if (!seen.has(id)) {
        seen.add(id);
        candidateIds.push(id);
      }
    }
  }

  const toNumber = (id) => numberOf.get(id) ?? -1;

  // 2. Small pack: return everything, sorted by card number ascending.
  if (candidateIds.length <= offerSize) {
    return candidateIds.slice().sort((a, b) => toNumber(a) - toNumber(b));
  }

  // 3. Deck set (ids, deduped). Eval has no signatures (pure deck-fit).
  const deckSet = new Set(deckIds);

  // 4. Score each stage independently.
  const neighborCF = scoreNeighborCF(candidateIds, deckSet, model, tuning);
  const cooccur = scoreCooccur(candidateIds, deckSet, model);

  // 5. Per-term min-max normalize, then blend.
  const nf = minMaxNormalize(candidateIds.map((c) => neighborCF.get(c) ?? 0));
  const co = minMaxNormalize(candidateIds.map((c) => cooccur.get(c) ?? 0));
  const pr = minMaxNormalize(candidateIds.map((c) => model.prior.get(c) ?? 0));

  const scoredCandidates = candidateIds.map((id, idx) => ({
    id,
    number: toNumber(id),
    fit: tuning.alpha * nf[idx] + tuning.beta * co[idx] + tuning.gamma * pr[idx],
  }));

  // 6. Rank by fit desc, tie-break by card number asc.
  scoredCandidates.sort((a, b) => b.fit - a.fit || a.number - b.number);
  return scoredCandidates.slice(0, offerSize).map((c) => c.id);
}

/**
 * Rank a pack by the global play-rate prior alone (deck-independent), the
 * popularity-4 baseline. Top `offerSize` by prior desc, tie-break by card number.
 */
export function rankPopularity(
  packIds,
  prior,
  numberOf,
  offerSize = OFFER_SIZE,
) {
  const seen = new Set();
  const candidateIds = [];
  for (const id of packIds) {
    if (!seen.has(id)) {
      seen.add(id);
      candidateIds.push(id);
    }
  }
  const toNumber = (id) => numberOf.get(id) ?? -1;
  if (candidateIds.length <= offerSize) {
    return candidateIds.slice().sort((a, b) => toNumber(a) - toNumber(b));
  }
  return candidateIds
    .map((id) => ({ id, number: toNumber(id), p: prior.get(id) ?? 0 }))
    .sort((a, b) => b.p - a.p || a.number - b.number)
    .slice(0, offerSize)
    .map((c) => c.id);
}

/** True if any id in `pickIds` appears in `offerIds`. The hit rule for
 * multi-card human picks: a hit if the offer surfaced ANY card the human took. */
export function isHit(offerIds, pickIds) {
  const offer = offerIds instanceof Set ? offerIds : new Set(offerIds);
  for (const id of pickIds) if (offer.has(id)) return true;
  return false;
}

/**
 * Analytic random-4 hit probability for a single eligible pick: the chance that
 * a uniformly-random size-`offerSize` subset of the deduped pack intersects the
 * `hits` cards the human picked (those present in the deduped pack).
 *
 *   P(hit) = 1 - C(packSize - hits, offerSize) / C(packSize, offerSize)
 *
 * For the common single-card pick this reduces to offerSize / packSize.
 */
export function randomHitProbability(packSize, hits, offerSize = OFFER_SIZE) {
  if (packSize <= offerSize) return 1; // whole pack offered -> always a hit
  if (hits <= 0) return 0;
  const miss = packSize - hits;
  if (miss < offerSize) return 1; // cannot avoid all picked cards
  // C(miss, k) / C(packSize, k) = prod_{t=0..k-1} (miss - t)/(packSize - t).
  let pMiss = 1;
  for (let t = 0; t < offerSize; t += 1) {
    pMiss *= (miss - t) / (packSize - t);
  }
  return 1 - pMiss;
}

// ===========================================================================
// Corpus loading + LOO model construction.
// ===========================================================================

/** Dedupe an array of names into a first-seen-ordered array. */
function dedupe(names) {
  const seen = new Set();
  const out = [];
  for (const n of names) {
    if (!seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

/**
 * Load the eval corpus exactly the way the live bundle does, plus an
 * id->card-number index for the tie-break. Returns { records, numberOf }.
 */
export function loadCorpus() {
  const cardsV2 = parse(readText("data/cards.toml")).cards;
  if (!Array.isArray(cardsV2)) {
    throw new Error("Expected [[cards]] array in cards.toml");
  }
  const cardMaps = buildCardMaps(cardsV2);
  // buildDraftRecords logs its skip/drop counts to stdout; silence those during
  // the load so `--json` produces a single clean JSON document on stdout.
  const realLog = console.log;
  console.log = () => {};
  let records;
  try {
    records = buildDraftRecords(
      resolve(ROOT, "docs/draft_records_adapted"),
      cardMaps,
    );
  } finally {
    console.log = realLog;
  }
  // lowercased card id -> card-number, mirroring buildIdIndex in
  // src/data/cards-v2-database.ts. Card ids are unique, so there is no
  // duplicate-key resolution as there is for names.
  const numberOf = new Map();
  for (const card of cardsV2) {
    if (typeof card["card-number"] === "number" && typeof card.id === "string") {
      numberOf.set(card.id.toLowerCase(), card["card-number"]);
    }
  }
  return { records, numberOf };
}

/**
 * Mulberry32 PRNG, copied from color-pool/rng.ts so `--sample`/`--seed` subsets
 * are deterministic and match the project's RNG conventions.
 */
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

/** Deterministically sample `n` records (seeded Fisher-Yates over indices). */
export function sampleRecords(records, n, seed) {
  if (!n || n >= records.length) return records;
  const idx = records.map((_, i) => i);
  const rng = makeRng(seed);
  for (let i = idx.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx
    .slice(0, n)
    .sort((a, b) => a - b)
    .map((i) => records[i]);
}

// ===========================================================================
// Evaluation.
// ===========================================================================

/** Stage bucket for a pickInPack (1-based): early 1-3, mid 4-7, late 8-10. */
function stageOf(pickInPack) {
  if (pickInPack <= 3) return "early";
  if (pickInPack <= 7) return "mid";
  return "late";
}

/** A fresh metrics accumulator: hits/eligible plus random & popularity sums,
 * with by-pack and by-stage breakdowns. */
function makeAccumulator() {
  const bucket = () => ({ eligible: 0, hits: 0, popHits: 0, randSum: 0 });
  return {
    overall: bucket(),
    byPack: { 1: bucket(), 2: bucket(), 3: bucket() },
    byStage: { early: bucket(), mid: bucket(), late: bucket() },
  };
}

function record(acc, pack, stage, hit, popHit, randP) {
  for (const b of [acc.overall, acc.byPack[pack], acc.byStage[stage]]) {
    b.eligible += 1;
    if (hit) b.hits += 1;
    if (popHit) b.popHits += 1;
    b.randSum += randP;
  }
}

/**
 * Evaluate the heuristic over a set of records under leave-one-out. For each
 * evaluated record the fit model is rebuilt over all OTHER records' mainboards
 * with every sibling seat (same draftId) removed, then its 30 picks are walked
 * in order with teacher forcing. Returns the filled accumulator plus the
 * wall-clock seconds.
 *
 * @param evalRecords records to score (a subset for `--sample`).
 * @param allRecords the full corpus the LOO model draws OTHER mainboards from.
 * @param tuning FitTuning knobs.
 * @param numberOf id -> card number for the tie-break.
 */
export function evaluate(evalRecords, allRecords, tuning, numberOf) {
  const t0 = Date.now();
  const acc = makeAccumulator();

  for (const rec of evalRecords) {
    // LOO corpus: every other record's mainboard ids, excluding sibling seats
    // that share this record's draftId (they share packs -> would leak the
    // answer).
    const corpus = [];
    for (const other of allRecords) {
      if (other.draftId === rec.draftId) continue;
      corpus.push(other.mainboardIds);
    }
    const model = buildFitModel(corpus, tuning);

    const deckSoFar = []; // ids, teacher-forced from the human's real picks
    const deckSet = new Set();
    for (let i = 0; i < rec.pickIds.length; i += 1) {
      const pickIds = rec.pickIds[i];
      const packDedup = dedupe(rec.packIds[i]);
      const eligible = packDedup.length > OFFER_SIZE && pickIds.length > 0;

      if (eligible) {
        // pickInPack is 1-based within this pack of 10 trimmed picks.
        const pack = Math.floor(i / 10) + 1;
        const pickInPack = (i % 10) + 1;
        const stage = stageOf(pickInPack);

        const offer = rankTop4(
          packDedup,
          deckSoFar,
          model,
          tuning,
          numberOf,
          OFFER_SIZE,
        );
        const hit = isHit(offer, pickIds);

        const popOffer = rankPopularity(
          packDedup,
          model.prior,
          numberOf,
          OFFER_SIZE,
        );
        const popHit = isHit(popOffer, pickIds);

        // Random baseline: count the picked cards actually present in the pack.
        const packSet = new Set(packDedup);
        let hitsInPack = 0;
        for (const n of pickIds) if (packSet.has(n)) hitsInPack += 1;
        const randP = randomHitProbability(
          packDedup.length,
          hitsInPack,
          OFFER_SIZE,
        );

        record(acc, pack, stage, hit, popHit, randP);
      }

      // Teacher forcing: grow the deck by ALL ids the human took (regardless
      // of eligibility). Empty picks add nothing.
      for (const n of pickIds) {
        if (!deckSet.has(n)) {
          deckSet.add(n);
          deckSoFar.push(n);
        }
      }
    }
  }

  return { acc, seconds: (Date.now() - t0) / 1000 };
}

/** Convert a bucket to reportable rates. */
function rates(b) {
  return {
    eligible: b.eligible,
    hits: b.hits,
    recall: b.eligible ? b.hits / b.eligible : 0,
    popularity: b.eligible ? b.popHits / b.eligible : 0,
    random: b.eligible ? b.randSum / b.eligible : 0,
  };
}

// ===========================================================================
// CLI.
// ===========================================================================

function num(argv, flag, fallback) {
  const i = argv.indexOf(flag);
  if (i !== -1 && argv[i + 1] != null) return Number(argv[i + 1]);
  const eq = argv.find((a) => a.startsWith(`${flag}=`));
  return eq ? Number(eq.slice(flag.length + 1)) : fallback;
}

function tuningFromArgs(argv) {
  return {
    alpha: num(argv, "--alpha", DEFAULT_TUNING.alpha),
    beta: num(argv, "--beta", DEFAULT_TUNING.beta),
    gamma: num(argv, "--gamma", DEFAULT_TUNING.gamma),
    K: num(argv, "--K", DEFAULT_TUNING.K),
    idfPower: num(argv, "--idf-power", DEFAULT_TUNING.idfPower),
    minDf: num(argv, "--min-df", DEFAULT_TUNING.minDf),
    maxDfFrac: num(argv, "--max-df-frac", DEFAULT_TUNING.maxDfFrac),
    minDeckSize: num(argv, "--min-deck", DEFAULT_TUNING.minDeckSize),
    maxDeckSize: num(argv, "--max-deck", DEFAULT_TUNING.maxDeckSize),
  };
}

const pct = (x) => `${(x * 100).toFixed(1)}%`;

function reportText(result, tuning, meta) {
  const o = rates(result.acc.overall);
  const lines = [];
  lines.push(
    `Replay deck-fit recall@4 (${meta.evalCount}/${meta.total} records, ` +
      `LOO, sibling-safe, ${result.seconds.toFixed(1)}s)`,
  );
  lines.push(
    `Tuning: alpha=${tuning.alpha} beta=${tuning.beta} gamma=${tuning.gamma} ` +
      `K=${tuning.K} idfPower=${tuning.idfPower} minDf=${tuning.minDf} ` +
      `maxDfFrac=${tuning.maxDfFrac} deck=[${tuning.minDeckSize},${tuning.maxDeckSize}]`,
  );
  lines.push("");
  lines.push(`  ===  RECALL@4: ${pct(o.recall)}  (${o.hits}/${o.eligible} eligible picks)  ===`);
  lines.push(
    `  popularity-4 baseline: ${pct(o.popularity)}   ` +
      `random-4 baseline: ${pct(o.random)}`,
  );
  lines.push(
    `  lift over popularity: ${(o.recall - o.popularity >= 0 ? "+" : "")}` +
      `${((o.recall - o.popularity) * 100).toFixed(1)} pts   ` +
      `lift over random: +${((o.recall - o.random) * 100).toFixed(1)} pts`,
  );
  lines.push("");
  lines.push(`By pack (recall@4 / popularity-4 / random-4):`);
  for (const p of [1, 2, 3]) {
    const r = rates(result.acc.byPack[p]);
    lines.push(
      `  pack ${p}:  ${pct(r.recall).padStart(6)}  /  ${pct(r.popularity).padStart(6)}  /  ` +
        `${pct(r.random).padStart(6)}   (${r.eligible} picks)`,
    );
  }
  lines.push(`By stage (recall@4 / popularity-4 / random-4):`);
  for (const s of ["early", "mid", "late"]) {
    const r = rates(result.acc.byStage[s]);
    lines.push(
      `  ${s.padEnd(5)}:  ${pct(r.recall).padStart(6)}  /  ${pct(r.popularity).padStart(6)}  /  ` +
        `${pct(r.random).padStart(6)}   (${r.eligible} picks)`,
    );
  }
  return lines.join("\n");
}

function reportJson(result, tuning, meta) {
  const o = rates(result.acc.overall);
  const packs = {};
  for (const p of [1, 2, 3]) packs[p] = rates(result.acc.byPack[p]);
  const stages = {};
  for (const s of ["early", "mid", "late"]) stages[s] = rates(result.acc.byStage[s]);
  return {
    config: { ...tuning, offerSize: OFFER_SIZE, ...meta, seconds: result.seconds },
    recall: o.recall,
    randomBaseline: o.random,
    popularityBaseline: o.popularity,
    byPack: packs,
    byStage: stages,
    eligible: o.eligible,
    hits: o.hits,
  };
}

// A small, deliberately-shaped grid. Sweep order follows the tuning plan:
// neighbour-only K first (alpha=1, beta=gamma=0), then beta with K fixed, then
// gamma, then the IDF knobs. Each row is one tuning override merged over the
// neighbour-only base, so a sweep run reads as a single sorted table.
function sweepGrid() {
  const rows = [];
  // Stage 1: neighbour-only, vary K (isolate the CF term).
  for (const K of [10, 25, 50, 100]) {
    rows.push({ label: `nf-only K=${K}`, alpha: 1, beta: 0, gamma: 0, K });
  }
  // Stage 2: add co-occurrence, vary beta at the best-ish K.
  for (const beta of [0.3, 0.6, 0.9, 1.2]) {
    rows.push({ label: `+co beta=${beta} K=25`, alpha: 1, beta, gamma: 0, K: 25 });
  }
  // Stage 3: add the prior, vary gamma with alpha/beta fixed.
  for (const gamma of [0.2, 0.4, 0.6]) {
    rows.push({ label: `+pr gamma=${gamma}`, alpha: 1, beta: 0.9, gamma, K: 25 });
  }
  // Stage 4: IDF knobs around the leading blend.
  for (const idfPower of [1, 1.5, 2]) {
    rows.push({
      label: `idfPow=${idfPower}`,
      alpha: 1,
      beta: 0.9,
      gamma: 0.4,
      K: 25,
      idfPower,
    });
  }
  for (const maxDfFrac of [0.5, 0.6, 0.8]) {
    rows.push({
      label: `maxDfFrac=${maxDfFrac}`,
      alpha: 1,
      beta: 0.9,
      gamma: 0.4,
      K: 25,
      maxDfFrac,
    });
  }
  return rows;
}

function runSweep(evalRecords, allRecords, numberOf, asJson) {
  const grid = sweepGrid();
  const results = [];
  for (const row of grid) {
    const { label, ...rowTuning } = row;
    const tuning = { ...DEFAULT_TUNING, ...rowTuning };
    const { acc, seconds } = evaluate(evalRecords, allRecords, tuning, numberOf);
    const o = rates(acc.overall);
    results.push({
      label,
      recall: o.recall,
      popularity: o.popularity,
      random: o.random,
      lift: o.recall - o.popularity,
      seconds,
    });
  }
  results.sort((a, b) => b.recall - a.recall);

  if (asJson) {
    console.log(JSON.stringify({ sweep: results, evalCount: evalRecords.length }, null, 2));
    return;
  }
  console.log(
    `Sweep over ${evalRecords.length} records (LOO). Sorted by recall@4 desc.`,
  );
  console.log(
    `  ${"config".padEnd(22)} ${"recall@4".padStart(9)} ${"pop-4".padStart(8)} ` +
      `${"rand-4".padStart(8)} ${"lift".padStart(7)}`,
  );
  for (const r of results) {
    const lift = `${r.lift >= 0 ? "+" : ""}${(r.lift * 100).toFixed(1)}`;
    console.log(
      `  ${r.label.padEnd(22)} ${pct(r.recall).padStart(9)} ${pct(r.popularity).padStart(8)} ` +
        `${pct(r.random).padStart(8)} ${lift.padStart(7)}`,
    );
  }
}

function run() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes("--json");
  const sample = num(argv, "--sample", 0);
  const seed = num(argv, "--seed", 12345);

  const { records, numberOf } = loadCorpus();
  const evalRecords = sampleRecords(records, sample, seed);

  if (argv.includes("--sweep")) {
    runSweep(evalRecords, records, numberOf, asJson);
    return;
  }

  const tuning = tuningFromArgs(argv);
  const result = evaluate(evalRecords, records, tuning, numberOf);
  const meta = { evalCount: evalRecords.length, total: records.length, seed };
  if (asJson) {
    console.log(JSON.stringify(reportJson(result, tuning, meta), null, 2));
  } else {
    console.log(reportText(result, tuning, meta));
  }
}

// Only run when invoked directly (not when imported by the test).
const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) run();
