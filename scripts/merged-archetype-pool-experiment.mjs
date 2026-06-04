// Experiment: can a DRASTICALLY simpler selector reproduce the `decklists`
// pool's "feel" (coherent, themed, varied, not hand-fed)?
//
// The `decklists` algorithm tames 1,066 unlabeled real decks at RUN TIME with
// IDF cosine similarity, top-K starter sampling, a spine gate, and a softmax
// snowball. This script tests the hypothesis that almost all of that machinery
// is corpus-search plumbing that can move OFFLINE: the real decks already carry
// an archetype label in their filename, so we can collapse them once into a
// small set of "merged archetype lists" and then pick a pool with a trivial
// rule — roll a primary archetype (theme-weighted), keep on-color lists, fold a
// few in until ~150 copies. No IDF, no cosine, no spine, no softmax.
//
// It does NOT trust prose. It imports the REAL `generatePoolFromData` as the
// `decklists` oracle and reports the simple selector's metrics side-by-side with
// it, on the SAME themed Dreamcallers, seeds, and metric definitions the spine
// experiment uses (recall/coverage against the on-color theme tide), plus a
// cross-seed variance metric the spine script did not measure.
//
// Run: node scripts/merged-archetype-pool-experiment.mjs

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildPoolData, generatePoolFromData } from "../src/draft/pool/index.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// True only when this file is the entry point. When another script imports it
// (e.g. dump-merged-lists.mjs) this is false, so the report block is skipped and
// only the exported helpers run.
const isMainModule = resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url);
const readJson = (p) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));

const cards = readJson("public/cards_v2-data.json");
const decklistsData = readJson("public/decklists-data.json");
const dreamcallers = readJson("public/dreamcallers-v2-data.json");
const poolData = buildPoolData(cards, decklistsData);

// Theme map copied verbatim from src/draft_test/dreamcallers-v2-database.ts.
const DREAMCALLER_THEMES = {
  "Yveth Coravel": ["blink", "celestial-reverie-combo"],
  "Kell Tarn": ["cheap-characters", "reclaim-combo"],
  Caedryn: ["abandon"],
  Kragg: ["abandon"],
  Vrakmoth: ["discard-madness"],
  Seraveth: ["discard-madness"],
  Corvath: ["discard-madness"],
  "Kael Voss": ["survivors", "reclaim-combo"],
  Vaela: ["survivors", "reclaim-combo"],
  Edran: ["outsiders"],
  Zeva: ["outsiders"],
  Kasane: ["storm", "events"],
  Rael: ["storm", "events"],
  Ovanel: ["storm", "events"],
  Grath: ["spirit-animals", "celestial-reverie-combo"],
  Radulf: ["spirit-animals", "celestial-reverie-combo"],
  Demetrios: ["spirit-animals", "celestial-reverie-combo"],
  "Gunnar Deepforge": ["warrior-aggro", "warrior-combo"],
  Tensho: ["warrior-aggro", "warrior-combo"],
  Valdren: ["warrior-aggro", "warrior-combo"],
};

// --- shared helpers (copied verbatim from color-pool.ts / spine experiment) --
const COLORS = "wubrg";
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
const jaccard = (a, b) => {
  let inter = 0;
  for (const k of a) if (b.has(k)) inter++;
  return inter / (a.size + b.size - inter || 1);
};

// ===========================================================================
// OFFLINE STEP: collapse the real decklists into merged archetype lists.
// The card-name lists in decklists-data.json have lost their archetype label
// (setup-assets.mjs keeps only names), so we read the labels back off the
// docs/drafts_dt filenames: `<date>-<label>-<uuid>.txt`. Decks are grouped by
// label; a card joins the merged list when it recurs in >= `threshold` of that
// label's decks. This is the ONLY "curation", and it is fully mechanical.
// ===========================================================================
const validNames = new Set(cards.map((c) => c.name));
const FILE_RE =
  /^\d{4}-\d{2}-\d{2}-(.+)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MIN_DECK = 16;
const MAX_DECK = 34;
const MIN_DECKS_PER_LABEL = 3; // labels with fewer real decks are too thin to merge
const MAX_LIST = 100; // the design cap: a list holds at most 100 names

export function buildMergedLists(threshold) {
  const dir = resolve(ROOT, "docs/drafts_dt");
  const byLabel = new Map(); // label -> array of Set<name>
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".txt")) continue;
    const m = FILE_RE.exec(file.replace(/\.txt$/, ""));
    if (!m) continue;
    const label = m[1];
    if (colorPrefix(label) === "" || label === colorPrefix(label)) continue; // need colors + an archetype name
    const names = readFileSync(resolve(dir, file), "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && validNames.has(l));
    const set = new Set(names);
    if (set.size < MIN_DECK || set.size > MAX_DECK) continue;
    if (!byLabel.has(label)) byLabel.set(label, []);
    byLabel.get(label).push(set);
  }
  const lists = new Map(); // label -> Set<name>
  for (const [label, decks] of byLabel) {
    if (decks.length < MIN_DECKS_PER_LABEL) continue;
    const freq = new Map();
    for (const d of decks) for (const c of d) freq.set(c, (freq.get(c) ?? 0) + 1);
    let kept = [...freq.entries()].filter(([, n]) => n >= threshold);
    kept.sort((a, b) => b[1] - a[1]);
    if (kept.length > MAX_LIST) kept = kept.slice(0, MAX_LIST);
    if (kept.length > 0) lists.set(label, new Set(kept.map(([c]) => c)));
  }
  return lists;
}

// ===========================================================================
// THE SIMPLE SELECTOR. Roll a primary archetype list (theme-weighted), fix the
// color identity to its prefix, then fold in on-color lists until the target.
// Knobs:
//   includeProb   each folded card joins with this probability (<1 => partial
//                 views => more variance + less "hand-fed")
//   weighting     how the next list is chosen: 'overlap' (cohere with what's
//                 chosen), 'theme' (stay on the mechanic), or 'uniform'
//   themeExp      exponent on theme weight when rolling the primary
// ===========================================================================
const MERGED = { targetSize: 150, targetJitter: 8, themeExp: 1.5 };

function generateMerged(rng, lists, seedArchetypes, themeArchetypes, knobs) {
  const {
    includeProb = 1,
    weighting = "overlap",
    themeCoreFrac = 0, // seed this fraction of the on-color theme cards (the per-Dreamcaller "core")
    themeKeep = false, // theme cards bypass the dropout when folding a list
  } = knobs ?? {};
  const { core, archLists } = poolData;

  const themeCards = new Set();
  for (const slug of themeArchetypes ?? [])
    for (const c of archLists.get(slug) ?? []) themeCards.add(c);
  const themeOverlap = (set) => {
    let n = 0;
    for (const c of set) if (themeCards.has(c)) n++;
    return n;
  };

  // Eligible primaries: the Dreamcaller's archetypes that have a merged list.
  const eligible = (seedArchetypes ?? []).filter(
    (a) => lists.has(a) && colorPrefix(a) !== "",
  );
  let identity = new Set();
  let primary = null;
  if (eligible.length > 0) {
    primary = weightedPick(
      rng,
      eligible,
      eligible.map((a) => (1 + themeOverlap(lists.get(a))) ** MERGED.themeExp),
    );
    for (const ch of colorPrefix(primary)) identity.add(ch);
  } else {
    // Open pool: pick any list as the primary.
    const all = [...lists.keys()];
    primary = all[Math.floor(rng() * all.length)];
    for (const ch of colorPrefix(primary)) identity.add(ch);
  }

  // Candidate pool: on-color lists (every prefix letter inside the identity).
  const onColor = [...lists.keys()].filter((label) =>
    [...colorPrefix(label)].every((ch) => identity.has(ch)),
  );

  const target = randInt(
    rng,
    MERGED.targetSize - MERGED.targetJitter,
    MERGED.targetSize + MERGED.targetJitter,
  );
  const counts = new Map([...core].map((c) => [c, 1]));
  const bump = (c) => counts.set(c, (counts.get(c) ?? 0) + 1);
  const fold = (set) => {
    for (const c of shuffle(rng, [...set])) {
      if (poolSize(counts) >= target) break;
      const keep = (themeKeep && themeCards.has(c)) || includeProb >= 1 || rng() < includeProb;
      if (keep) bump(c);
    }
  };

  // Per-Dreamcaller theme core: always-seed a fraction of the on-color theme
  // cards (theme cards that belong to some on-color archetype list), so a themed
  // pool reliably leads with its mechanic instead of drifting off-theme.
  if (themeCoreFrac > 0 && themeCards.size > 0) {
    const onColorUnion = new Set();
    for (const label of onColor) for (const c of lists.get(label)) onColorUnion.add(c);
    for (const c of themeCards)
      if (onColorUnion.has(c) && (themeCoreFrac >= 1 || rng() < themeCoreFrac)) bump(c);
  }

  fold(lists.get(primary));
  const used = new Set([primary]);
  let stall = 0;
  while (poolSize(counts) < target && stall < 30) {
    const cands = onColor.filter((l) => !used.has(l));
    if (cands.length === 0) break;
    const poolKeys = new Set(counts.keys());
    const weightOf = (label) => {
      const set = lists.get(label);
      if (weighting === "uniform") return 1;
      if (weighting === "theme") return (1 + themeOverlap(set)) ** MERGED.themeExp;
      let ov = 0; // 'overlap' with what is already chosen
      for (const c of set) if (poolKeys.has(c)) ov++;
      return 1 + ov;
    };
    const pick = weightedPick(rng, cands, cands.map(weightOf));
    used.add(pick);
    const before = poolSize(counts);
    fold(lists.get(pick));
    stall = poolSize(counts) === before ? stall + 1 : 0;
  }

  const identityStr = [...COLORS].filter((c) => identity.has(c)).join("");
  return { counts, identity: identityStr, primary };
}

// ===========================================================================
// METRICS — identical definitions to the spine experiment's Measurement A, so
// the two algorithms are judged on the same yardstick, plus cross-seed variance.
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
function themeTideOf(themeArch) {
  const tide = new Set();
  for (const slug of themeArch)
    for (const c of poolData.archLists.get(slug) ?? []) tide.add(c);
  return tide;
}

// Micro-coherence ground truth: how often do two cards ACTUALLY co-occur in a
// real deck? Merged lists discard within-deck structure (two cards in the
// br-aristocrats merged list may never share a real deck), whereas the
// `decklists` oracle folds whole real decks. If that structure matters, the
// oracle's pools will pair its distinctive cards in real decks more often.
const realDecks = decklistsData
  .map((d) => new Set(d))
  .filter((s) => s.size >= MIN_DECK && s.size <= MAX_DECK);
const cardToDecks = new Map(); // name -> Set<deckIdx>
realDecks.forEach((d, i) => {
  for (const c of d) {
    let s = cardToDecks.get(c);
    if (!s) cardToDecks.set(c, (s = new Set()));
    s.add(i);
  }
});
function coocCount(a, b) {
  const da = cardToDecks.get(a), db = cardToDecks.get(b);
  if (!da || !db) return 0;
  const [small, big] = da.size < db.size ? [da, db] : [db, da];
  let n = 0;
  for (const x of small) if (big.has(x)) n++;
  return n;
}

const themed = dreamcallers.filter((d) => DREAMCALLER_THEMES[d.name]);
const seeds = [1, 7, 13, 42, 99, 256, 1000, 31337, 555, 8675309];

// Run one algorithm over every themed Dreamcaller x seed and aggregate metrics.
// `gen(dc, seed)` must return { counts, identity }.
function evaluate(gen) {
  let uniq = 0, size = 0, recall = 0, coverage = 0, n = 0;
  let pairJac = 0, pairN = 0;
  let coc = 0, cocN = 0;
  for (const dc of themed) {
    const themeArch = DREAMCALLER_THEMES[dc.name];
    const tide = themeTideOf(themeArch);
    const setsForDc = [];
    for (const seed of seeds) {
      const { counts, identity } = gen(dc, seed);
      const poolSet = new Set(counts.keys());
      setsForDc.push(poolSet);
      const legal = legalForIdentity(identity);
      const onColorTide = new Set([...tide].filter((c) => legal.has(c)));
      let inter = 0;
      for (const c of poolSet) if (onColorTide.has(c)) inter++;
      uniq += poolSet.size;
      size += poolSize(counts);
      recall += inter / (poolSet.size || 1);
      coverage += onColorTide.size ? inter / onColorTide.size : 0;
      n++;
      // micro-coherence: avg real-deck co-occurrence over distinctive (non-core)
      // card pairs, capped at 70 cards/pool to bound cost.
      const nc = [...poolSet].filter((c) => !poolData.core.has(c)).slice(0, 70);
      for (let i = 0; i < nc.length; i++)
        for (let j = i + 1; j < nc.length; j++) {
          coc += coocCount(nc[i], nc[j]);
          cocN++;
        }
    }
    for (let i = 0; i < setsForDc.length; i++)
      for (let j = i + 1; j < setsForDc.length; j++) {
        pairJac += jaccard(setsForDc[i], setsForDc[j]);
        pairN++;
      }
  }
  return {
    uniq: uniq / n,
    size: size / n,
    recall: recall / n,
    coverage: coverage / n,
    variance: pairJac / pairN, // avg pairwise Jaccard across seeds; LOWER = more varied
    coc: coc / cocN, // avg real-deck co-occurrence of distinctive card pairs; HIGHER = more micro-coherent
  };
}

const oracle = (dc, seed) =>
  generatePoolFromData(poolData, seed, dc.draftArchetypes ?? [], "decklists", DREAMCALLER_THEMES[dc.name]);

const fmt = (m) =>
  `uniq ${m.uniq.toFixed(1).padStart(5)}  recall ${m.recall.toFixed(3)}  ` +
  `coverage ${m.coverage.toFixed(3)}  varJac ${m.variance.toFixed(3)}  coc ${m.coc.toFixed(2)}`;

if (isMainModule) {
console.log("=".repeat(78));
console.log("MERGED ARCHETYPE LISTS — corpus collapse summary (threshold = 2 decks)");
const baseLists = buildMergedLists(2);
const sizes = [...baseLists.values()].map((s) => s.size);
console.log(`  lists produced            : ${baseLists.size}  (design cap is 100)`);
console.log(`  cards per list  min/avg/max: ${Math.min(...sizes)} / ${(sizes.reduce((a, b) => a + b, 0) / sizes.length).toFixed(1)} / ${Math.max(...sizes)}`);
// How many themed Dreamcallers actually have an eligible primary list?
let withPrimary = 0;
for (const dc of themed) {
  const elig = (dc.draftArchetypes ?? []).filter((a) => baseLists.has(a));
  if (elig.length > 0) withPrimary++;
}
console.log(`  themed Dreamcallers with >=1 eligible merged list: ${withPrimary}/${themed.length}`);
console.log("");

console.log("=".repeat(78));
console.log("BASELINE vs CANDIDATE  (20 themed Dreamcallers x 10 seeds = 200 pools each)");
console.log("  recall   = fraction of pool carrying the theme tide   (coherence; decklists 0.506)");
console.log("  coverage = fraction of on-color theme tide in the pool (hand-fed-ness; decklists 0.707)");
console.log("  varJac   = avg pairwise Jaccard across seeds           (variance; LOWER = more varied)");
console.log("  coc      = avg real-deck co-occurrence of distinctive pairs (micro-coherence; HIGHER = cards really get played together)");
console.log("-".repeat(78));
console.log(`  decklists oracle                  : ${fmt(evaluate(oracle))}`);
// Option C contrast: the SAME simple selector, but over the broad existing
// draftLists (tag lists) instead of the merged real-deck lists. If coc drops,
// the offline merge step is what buys the micro-coherence.
const tagGen = (dc, seed) =>
  generateMerged(makeRng(seed >>> 0), poolData.draftLists, dc.draftArchetypes ?? [],
    DREAMCALLER_THEMES[dc.name], { includeProb: 0.7, weighting: "overlap", themeCoreFrac: 1.0, themeKeep: true });
console.log(`  tag lists (existing draftLists)   : ${fmt(evaluate(tagGen))}   <- option C: skip the merge step`);
console.log("");

// --- knob sweep for the simple selector --------------------------------------
const configs = [
  // no theme core — theme bias only on the primary roll (drifts off-theme)
  { threshold: 2, includeProb: 1.0, weighting: "overlap" },
  { threshold: 2, includeProb: 0.7, weighting: "overlap" },
  { threshold: 2, includeProb: 0.7, weighting: "theme" },
  // add the per-Dreamcaller theme core + theme-keep, dialing recall back up
  { threshold: 2, includeProb: 0.7, weighting: "overlap", themeKeep: true },
  { threshold: 2, includeProb: 0.7, weighting: "overlap", themeCoreFrac: 0.5, themeKeep: true },
  { threshold: 2, includeProb: 0.7, weighting: "overlap", themeCoreFrac: 0.8, themeKeep: true },
  { threshold: 2, includeProb: 0.6, weighting: "theme", themeCoreFrac: 0.8, themeKeep: true },
  { threshold: 2, includeProb: 0.7, weighting: "overlap", themeCoreFrac: 1.0, themeKeep: true },
];
const listCache = new Map();
const listsFor = (t) => {
  if (!listCache.has(t)) listCache.set(t, buildMergedLists(t));
  return listCache.get(t);
};
for (const cfg of configs) {
  const lists = listsFor(cfg.threshold);
  const gen = (dc, seed) =>
    generateMerged(
      makeRng(seed >>> 0),
      lists,
      dc.draftArchetypes ?? [],
      DREAMCALLER_THEMES[dc.name],
      cfg,
    );
  const parts = [`thr=${cfg.threshold}`, `p=${cfg.includeProb}`, `w=${cfg.weighting}`];
  if (cfg.themeKeep) parts.push("keep");
  if (cfg.themeCoreFrac) parts.push(`core=${cfg.themeCoreFrac}`);
  console.log(`  ${`merged  ${parts.join(" ")}`.padEnd(48)}: ${fmt(evaluate(gen))}`);
}
console.log("=".repeat(78));
}
