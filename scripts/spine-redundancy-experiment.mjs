// Experiment: how much work does the `decklists` algorithm's *spine* actually
// do, and how close is its pool to "just the cards carrying the theme tide"?
//
// This script does NOT trust a hand-written description of the algorithm. It
// (1) imports the REAL `generatePoolFromData` from color-pool.ts as an oracle,
// (2) includes a faithful, instrumented re-port of the snowball, and
// (3) PROVES the port is faithful by asserting it reproduces the oracle's pool
//     bit-for-bit across many DreamAvatar x seed combinations.
// Only after that proof passes does it report the instrumented measurements.
//
// Run: node scripts/spine-redundancy-experiment.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  buildPoolData,
  generatePoolFromData,
} from "../src/draft/pool/index.ts";
import { CARDS_V2_POOL_METADATA } from "../src/data/cards-v2-metadata.ts";
import { DREAM_AVATAR_THEMES_BY_ID } from "../src/data/dream-avatars-v2-database.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (p) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));

const cards = readJson("public/cards_v2-data.json").map((card) => ({
  ...card,
  tides: CARDS_V2_POOL_METADATA[card.id]?.tides ?? [],
}));
const decklistsData = readJson("public/decklists-data.json");
const decklistIdsData = readJson("public/decklist-ids-data.json");
const dreamAvatars = readJson("public/dream-avatars-v2-data.json");

// Pass the id-keyed corpus as the 4th argument so the oracle keys df/idf/cosine
// on stable UUIDs (same as variant-decklists.ts now does). The name-keyed
// decklists are still passed as the 2nd argument for callers that rely on the
// `decklists` field for other purposes (e.g. tests), but the decklists variant
// itself will prefer decklistIds when present.
const poolData = buildPoolData(cards, decklistsData, undefined, decklistIdsData);

// ---------------------------------------------------------------------------
// Faithful re-port of the decklists internals, copied line-for-line from
// color-pool.ts (DECKLISTS tuning, makeRng, randInt, shuffle, weightedPick,
// colorPrefix, poolSize, deckCorpus, generateDecklists) with two additions:
//   - `disableSpine`: make onSpine() always true (the "what if no spine" world)
//   - foldStats: record, per folded-in deck, how many of its cards the spine
//     passed vs rejected. Instrumentation only READS; it never calls rng, so
//     it cannot perturb the stream the oracle relies on.
// ---------------------------------------------------------------------------
const COLORS = "wubrg";
const DECKLISTS = {
  targetSize: 150,
  targetJitter: 8,
  minDeckSize: 16,
  maxDeckSize: 34,
  starterTopK: 25,
  starterAlpha: 2,
  growTopK: 10,
  growTemperature: 0.35,
  themeStrategyExp: 1.5,
  themeStarterBoost: 2,
  themeGrowBoost: 2.5,
  spineArchetypes: 2,
};

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
const randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
function shuffle(rng, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function weightedPick(rng, items, weights) {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}
function colorPrefix(name) {
  const head = name.split("-")[0];
  const isColors = head.length > 0 && [...head].every((c) => COLORS.includes(c));
  return isColors ? head : "";
}
function poolSize(counts) {
  let n = 0;
  for (const v of counts.values()) n += Math.min(2, v);
  return n;
}

function buildCorpus(pd) {
  // Prefer the id-keyed corpus so same-name cards stay distinct; fall back to
  // the name corpus for synthetic / test PoolData that carries no UUID source.
  const source = pd.decklistIds ?? pd.decklists;
  if (!source || source.length === 0) return null;
  const filtered = source
    .map((d) => new Set(d))
    .filter((s) => s.size >= DECKLISTS.minDeckSize && s.size <= DECKLISTS.maxDeckSize);
  if (filtered.length === 0) return null;
  const n = filtered.length;
  const df = new Map();
  for (const s of filtered) for (const c of s) df.set(c, (df.get(c) ?? 0) + 1);
  const idf = new Map();
  for (const [c, d] of df) idf.set(c, Math.log((n + 1) / d));
  const decks = filtered.map((cardsSet) => {
    let sq = 0;
    for (const c of cardsSet) {
      const w = idf.get(c) ?? 0;
      sq += w * w;
    }
    return { cards: cardsSet, norm: Math.sqrt(sq) || 1 };
  });
  return { decks, idf };
}
const CORPUS = buildCorpus(poolData);

// Returns { counts (uncapped, UUID-keyed), identity, foldStats:[{size,onSpine}], spine,
// themeCards, starter, onSpineFracControl }.
function generateDecklistsInstrumented(
  rng,
  pd,
  seedArchetypes,
  themeArchetypes,
  { disableSpine = false, spineArchetypes = DECKLISTS.spineArchetypes } = {},
) {
  const corpus = CORPUS;
  const { core, archLists, draftLists } = pd;
  const { decks, idf } = corpus;
  const idfOf = (c) => idf.get(c) ?? 0;

  // archLists and draftLists are keyed by UUID (from the cards' stable ids), the
  // same key space as the corpus cards (UUIDs from decklistIds), so they match
  // archetype/color membership directly.
  const toUuidArchLists = archLists;
  const toUuidDraftLists = draftLists;

  const themeCards = new Set();
  for (const slug of themeArchetypes ?? [])
    for (const c of toUuidArchLists.get(slug) ?? []) themeCards.add(c);
  let themeSq = 0;
  for (const c of themeCards) themeSq += idfOf(c) ** 2;
  const themeNorm = Math.sqrt(themeSq) || 1;
  const themeCosine = (deck) => {
    if (themeCards.size === 0) return 0;
    let dot = 0;
    for (const c of deck.cards) if (themeCards.has(c)) dot += idfOf(c) ** 2;
    return dot / (themeNorm * deck.norm);
  };

  const eligible = (seedArchetypes ?? []).filter(
    (a) => toUuidDraftLists.has(a) && colorPrefix(a) !== "",
  );
  let strategyPrefix = "";
  let strategyCards = null;
  if (eligible.length > 0) {
    const rolled = weightedPick(
      rng,
      eligible,
      eligible.map((a) => {
        let themeHits = 0;
        for (const c of toUuidDraftLists.get(a) ?? []) if (themeCards.has(c)) themeHits++;
        return (1 + themeHits) ** DECKLISTS.themeStrategyExp;
      }),
    );
    strategyPrefix = colorPrefix(rolled);
    strategyCards = toUuidDraftLists.get(rolled) ?? null;
  }

  const randomDeck = () => decks[Math.floor(rng() * decks.length)].cards;
  let starter;
  if (strategyCards && strategyCards.size > 0) {
    const sc = strategyCards;
    const scored = decks
      .map((d) => {
        let fit = 0;
        for (const c of d.cards) if (sc.has(c)) fit += idfOf(c);
        return [d.cards, fit * (1 + DECKLISTS.themeStarterBoost * themeCosine(d))];
      })
      .filter(([, fit]) => fit > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, DECKLISTS.starterTopK);
    starter =
      scored.length > 0
        ? weightedPick(
            rng,
            scored.map(([c]) => c),
            scored.map(([, fit]) => fit ** DECKLISTS.starterAlpha),
          )
        : randomDeck();
  } else {
    starter = randomDeck();
  }

  let anchorSq = 0;
  for (const c of starter) anchorSq += idfOf(c) ** 2;
  const anchorNorm = Math.sqrt(anchorSq) || 1;
  const growScore = (deck) => {
    let dot = 0;
    for (const c of deck.cards) if (starter.has(c)) dot += idfOf(c) ** 2;
    const sim = dot / (anchorNorm * deck.norm);
    return sim * (1 + DECKLISTS.themeGrowBoost * themeCosine(deck));
  };

  const spine = new Set();
  for (const slug of themeArchetypes ?? []) if (toUuidArchLists.has(slug)) spine.add(slug);
  const spineBudget = Math.max(spineArchetypes, spine.size);
  const spineHits = new Map();
  for (const [slug, set] of toUuidArchLists) {
    let n = 0;
    for (const c of starter) if (set.has(c)) n++;
    if (n > 0) spineHits.set(slug, n);
  }
  for (const [slug] of [...spineHits.entries()].sort((a, b) => b[1] - a[1])) {
    if (spine.size >= spineBudget) break;
    spine.add(slug);
  }
  const onSpine = (c) => {
    if (disableSpine) return true;
    if (spine.size === 0) return true;
    for (const slug of spine) if (toUuidArchLists.get(slug)?.has(c)) return true;
    return false;
  };

  const target = randInt(
    rng,
    DECKLISTS.targetSize - DECKLISTS.targetJitter,
    DECKLISTS.targetSize + DECKLISTS.targetJitter,
  );
  const counts = new Map([...core].map((c) => [c, 1]));
  const bump = (c) => counts.set(c, (counts.get(c) ?? 0) + 1);
  for (const c of starter) bump(c);

  const foldStats = [];
  const used = new Set([starter]);
  let stall = 0;
  while (poolSize(counts) < target && stall < 30) {
    const cands = decks
      .filter((d) => !used.has(d.cards))
      .map((d) => [d, growScore(d)])
      .filter(([, s]) => s > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, DECKLISTS.growTopK);
    if (cands.length === 0) break;
    const pick = weightedPick(
      rng,
      cands.map(([d]) => d),
      cands.map(([, s]) => Math.exp(s / DECKLISTS.growTemperature)),
    );
    used.add(pick.cards);
    // instrumentation: how many of this neighbor's cards does the spine pass?
    let on = 0;
    for (const c of pick.cards) if (spine.size === 0 || [...spine].some((s) => toUuidArchLists.get(s)?.has(c))) on++;
    foldStats.push({ size: pick.cards.size, onSpine: on });
    const before = poolSize(counts);
    for (const c of shuffle(rng, [...pick.cards])) {
      if (poolSize(counts) >= target) break;
      if (onSpine(c)) bump(c);
    }
    stall = poolSize(counts) === before ? stall + 1 : 0;
  }

  // identity (step 5) — use UUID-keyed draftLists mirrors
  const C = new Set();
  if (strategyPrefix !== "") {
    for (const letter of strategyPrefix) C.add(letter);
  } else {
    const unique = counts.size || 1;
    for (const letter of COLORS) {
      const list = toUuidDraftLists.get(letter);
      if (!list) continue;
      let n = 0;
      for (const c of counts.keys()) if (list.has(c)) n++;
      if (n / unique >= 0.18) C.add(letter);
    }
  }
  const identity = [...COLORS].filter((c) => C.has(c)).join("");

  return { counts, identity, foldStats, spine, themeCards, starter };
}

const capCounts = (counts) => {
  const m = new Map();
  for (const [c, v] of counts) m.set(c, Math.min(2, v));
  return m;
};
const sameCounts = (a, b) => {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
};
const jaccard = (a, b) => {
  let inter = 0;
  for (const k of a) if (b.has(k)) inter++;
  return inter / (a.size + b.size - inter);
};

const themed = dreamAvatars.filter((d) => DREAM_AVATAR_THEMES_BY_ID[d.id]);
const seeds = [1, 7, 13, 42, 99, 256, 1000, 31337, 555, 8675309];

// ===========================================================================
// PROOF STEP: the instrumented port reproduces the real algorithm exactly.
// ===========================================================================
let checked = 0;
let mismatches = 0;
for (const dc of themed) {
  const seedArch = dc.draftArchetypes ?? [];
  const themeArch = DREAM_AVATAR_THEMES_BY_ID[dc.id];
  for (const seed of seeds) {
    const oracle = generatePoolFromData(poolData, seed, seedArch, "decklists", themeArch);
    const port = generateDecklistsInstrumented(makeRng(seed >>> 0), poolData, seedArch, themeArch, {});
    checked++;
    if (!sameCounts(oracle.counts, capCounts(port.counts)) || oracle.identity !== port.identity) {
      mismatches++;
      if (mismatches <= 3)
        console.log(`  MISMATCH ${dc.name} seed=${seed}: oracle ${oracle.counts.size}c/${oracle.identity} vs port ${capCounts(port.counts).size}c/${port.identity}`);
    }
  }
}
console.log("=".repeat(72));
console.log(`FAITHFULNESS PROOF: port reproduces the real algorithm`);
console.log(`  ${checked - mismatches}/${checked} pools identical (capped counts + identity)`);
if (mismatches > 0) {
  console.log("  PORT IS NOT FAITHFUL — instrumented numbers below are untrustworthy. Aborting.");
  process.exit(1);
}
console.log("  -> the instrumented measurements below describe the REAL algorithm.\n");

// ===========================================================================
// MEASUREMENT A: is the pool ~ "all on-color cards carrying the theme tide"?
// For each pool, compare its unique-card set against the tide baseline.
//   recall  = |pool ∩ themeTide| / |pool|      (how tide-pure is the pool?)
//   coverage= |pool ∩ themeTide| / |themeTide∩legal|  (does it cover the tide?)
//   jaccard against the on-color tide set.
// If the pool ≈ the tide set, both are ~1 and jaccard ~1. If the spine/starter/
// core add a lot beyond the tide, recall and jaccard drop well below 1.
// ===========================================================================
function legalForIdentity(identity) {
  const C = new Set([...identity]);
  const legal = new Set(poolData.core);
  for (const [name, set] of poolData.draftLists) {
    const p = colorPrefix(name);
    if (p === "" || ![...p].every((c) => C.has(c))) continue;
    for (const c of set) legal.add(c);
  }
  return legal;
}
let aRecall = 0, aCoverage = 0, aJaccard = 0, aN = 0;
let aPoolSize = 0, aTideOnly = 0;
for (const dc of themed) {
  const themeArch = DREAM_AVATAR_THEMES_BY_ID[dc.id];
  const themeTide = new Set();
  for (const slug of themeArch) for (const c of poolData.archLists.get(slug) ?? []) themeTide.add(c);
  for (const seed of seeds) {
    const pool = generatePoolFromData(poolData, seed, dc.draftArchetypes ?? [], "decklists", themeArch);
    const poolSet = new Set(pool.counts.keys());
    const legal = legalForIdentity(pool.identity);
    const onColorTide = new Set([...themeTide].filter((c) => legal.has(c)));
    let inter = 0;
    for (const c of poolSet) if (onColorTide.has(c)) inter++;
    aRecall += inter / poolSet.size;
    aCoverage += onColorTide.size ? inter / onColorTide.size : 0;
    aJaccard += jaccard(poolSet, onColorTide);
    aPoolSize += poolSet.size;
    aTideOnly += inter;
    aN++;
  }
}
console.log("=".repeat(72));
console.log("MEASUREMENT A — is the pool just 'on-color cards with the theme tide'?");
console.log(`  avg unique cards in pool          : ${(aPoolSize / aN).toFixed(1)}`);
console.log(`  avg of those carrying the theme tide: ${(aTideOnly / aN).toFixed(1)}`);
console.log(`  recall  (pool ∩ tide)/pool        : ${(aRecall / aN).toFixed(3)}  <- fraction of the pool that is theme-tide cards`);
console.log(`  coverage(pool ∩ tide)/tide        : ${(aCoverage / aN).toFixed(3)}  <- fraction of the on-color tide set the pool actually contains`);
console.log(`  Jaccard(pool, on-color tide set)  : ${(aJaccard / aN).toFixed(3)}  <- 1.0 would mean 'identical to the tide filter'`);
console.log("");

// ===========================================================================
// MEASUREMENT B — how load-bearing is the spine?
//   B1. spine-on vs spine-off pools: Jaccard + how many cards the spine removed.
//   B2. of the neighbor decks the snowball actually folds in, what fraction of
//       their cards is already on-spine? Compared against the on-spine fraction
//       of an ARBITRARY deck (control). If picked ≈ control, similarity did not
//       pre-concentrate the neighbors and the spine is load-bearing; if picked
//       >> control, similarity already did most of the anti-smear work and the
//       spine is largely redundant (the user's hypothesis).
// ===========================================================================
let bJaccard = 0, bRemovedFrac = 0, bN = 0;
let pickedOnSpineFrac = 0, pickedFolds = 0;
for (const dc of themed) {
  const seedArch = dc.draftArchetypes ?? [];
  const themeArch = DREAM_AVATAR_THEMES_BY_ID[dc.id];
  for (const seed of seeds) {
    const on = generateDecklistsInstrumented(makeRng(seed >>> 0), poolData, seedArch, themeArch, { disableSpine: false });
    const off = generateDecklistsInstrumented(makeRng(seed >>> 0), poolData, seedArch, themeArch, { disableSpine: true });
    const onSet = new Set(on.counts.keys());
    const offSet = new Set(off.counts.keys());
    bJaccard += jaccard(onSet, offSet);
    let removed = 0;
    for (const c of offSet) if (!onSet.has(c)) removed++;
    bRemovedFrac += removed / offSet.size;
    bN++;
    for (const f of on.foldStats) {
      pickedOnSpineFrac += f.onSpine / f.size;
      pickedFolds++;
    }
  }
}
// control: on-spine fraction of a representative spine across the whole corpus.
// Use each pool's spine (computed in the on-run) against all corpus decks.
let controlOnSpineFrac = 0, controlN = 0;
for (const dc of themed) {
  const seedArch = dc.draftArchetypes ?? [];
  const themeArch = DREAM_AVATAR_THEMES_BY_ID[dc.id];
  const on = generateDecklistsInstrumented(makeRng(7), poolData, seedArch, themeArch, {});
  const spine = on.spine;
  // archLists are UUID-keyed, the same key space as the corpus cards.
  const onSpine = (c) => spine.size === 0 || [...spine].some((s) => poolData.archLists.get(s)?.has(c));
  for (const d of CORPUS.decks) {
    let k = 0;
    for (const c of d.cards) if (onSpine(c)) k++;
    controlOnSpineFrac += k / d.cards.size;
    controlN++;
  }
}
console.log("=".repeat(72));
console.log("MEASUREMENT B — how load-bearing is the spine?");
console.log(`  Jaccard(spine-on pool, spine-off pool): ${(bJaccard / bN).toFixed(3)}  <- 1.0 would mean the spine changes nothing`);
console.log(`  avg fraction of the spine-off pool the spine removes: ${(bRemovedFrac / bN).toFixed(3)}`);
console.log("");
console.log("  Does the similarity gate already pre-concentrate neighbors on-archetype?");
console.log(`    on-spine fraction of FOLDED-IN neighbor decks : ${(pickedOnSpineFrac / pickedFolds).toFixed(3)}`);
console.log(`    on-spine fraction of an ARBITRARY corpus deck : ${(controlOnSpineFrac / controlN).toFixed(3)}  (control)`);
const lift = (pickedOnSpineFrac / pickedFolds) / (controlOnSpineFrac / controlN);
console.log(`    -> folded-in decks are ${lift.toFixed(2)}x as on-spine as a random deck`);
console.log("=".repeat(72));
