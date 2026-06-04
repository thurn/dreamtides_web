// One-off authoring aid for the idf3 `signature-cards` lists in
// dreamcallers_v2.toml (docs/cards2/idf3_signature_design.md, Section 4.4).
//
// For every themed Dreamcaller it ranks candidate signature cards two
// independent ways and prints them side by side so a human can pick 4-6:
//
//   THEME lens  -- candidates restricted to the cards tagged with the
//     Dreamcaller's DREAMCALLER_THEMES tide slugs (the archLists build-arounds),
//     scored by (fraction of THEME-DENSE real decks containing the card) x idf.
//     This is the requested basis: it reads DREAMCALLER_THEMES + corpus idf only.
//
//   LABEL lens  -- the experiment's deriveSignature: candidates are every card in
//     the decks whose docs/drafts_dt filename archetype is one of the
//     Dreamcaller's draftArchetypes, scored by (fraction of those decks) x idf.
//     An independent cross-check that never looks at the tide tags.
//
// idf, the size band, and cosine are reproduced verbatim from variant-idf.ts /
// the idf3 experiment so the scores match what the running algorithm would see.
//
// Run: node scripts/idf3-derive-signatures.mjs

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (p) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));

const cards = readJson("public/cards_v2-data.json");
const decklistsData = readJson("public/decklists-data.json");
const dreamcallers = readJson("public/dreamcallers-v2-data.json");

const TIDE_TO_ARCH = new Map([
  ["Abandon", "abandon"],
  ["Blink", "blink"],
  ["Celestial Reverie Combo", "celestial-reverie-combo"],
  ["Cheap Characters", "cheap-characters"],
  ["Cindermarch / Shadow Soloist Combo", "cindermarch-shadow-soloist-combo"],
  ["Discard / Madness", "discard-madness"],
  ["Events", "events"],
  ["Fading Farewell", "fading-farewell"],
  ["Outsiders", "outsiders"],
  ["Reclaim Combo", "reclaim-combo"],
  ["Spirit Animals", "spirit-animals"],
  ["Storm", "storm"],
  ["Survivors", "survivors"],
  ["Wake the Fallen / Shadow March Combo", "wake-the-fallen-combo"],
  ["Warrior Aggro", "warrior-aggro"],
  ["Warrior Combo", "warrior-combo"],
]);

// DREAMCALLER_THEMES, copied from src/draft_test/dreamcallers-v2-database.ts.
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

// archLists: tide slug -> Set of card names (the archetype build-arounds), and a
// card -> its tide slugs, for legibility annotations.
const archLists = new Map();
const cardTides = new Map();
for (const c of cards) {
  const slugs = [];
  for (const t of c.tides ?? []) {
    const k = TIDE_TO_ARCH.get(t);
    if (!k) continue;
    slugs.push(k);
    if (!archLists.has(k)) archLists.set(k, new Set());
    archLists.get(k).add(c.name);
  }
  cardTides.set(c.name, slugs);
}

// === IDF corpus over the size-filtered decklists (verbatim from variant-idf) ===
const IDF = { idfPower: 1, minDf: 1, maxDfFrac: 1, minDeckSize: 16, maxDeckSize: 34 };
const sets = decklistsData
  .map((d) => new Set(d))
  .filter((s) => s.size >= IDF.minDeckSize && s.size <= IDF.maxDeckSize);
const N = sets.length;
const df = new Map();
for (const s of sets) for (const c of s) df.set(c, (df.get(c) ?? 0) + 1);
const maxDf = IDF.maxDfFrac * N;
const idf = new Map();
for (const [c, d] of df)
  idf.set(c, d < IDF.minDf || d > maxDf ? 0 : Math.log((N + 1) / d) ** IDF.idfPower);
const idfOf = (c) => idf.get(c) ?? 0;
const decks = sets.map((cardsSet) => {
  let sq = 0;
  for (const c of cardsSet) sq += idfOf(c) ** 2;
  return { cards: cardsSet, norm: Math.sqrt(sq) || 1 };
});

// === LABEL lens: recover docs/drafts_dt archetype label per deck (idf3 expt) ===
const COLORS = "wubrg";
const colorPrefix = (name) => {
  const head = name.split("-")[0];
  return head.length > 0 && [...head].every((c) => COLORS.includes(c)) ? head : "";
};
const FILE_RE =
  /^\d{4}-\d{2}-\d{2}-(.+)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const validNames = new Set(cards.map((c) => c.name));
const rawLabels = [];
for (const file of readdirSync(resolve(ROOT, "docs/drafts_dt")).sort()) {
  if (!file.endsWith(".txt")) continue;
  const lines = readFileSync(resolve(ROOT, "docs/drafts_dt", file), "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && validNames.has(l));
  if (lines.length === 0) continue;
  const m = FILE_RE.exec(file.replace(/\.txt$/u, ""));
  let label = m ? m[1] : null;
  if (label && (colorPrefix(label) === "" || label === colorPrefix(label))) label = null;
  rawLabels.push(label);
}
// rawLabels is index-aligned with decklistsData (pre size-filter). Re-filter in
// lockstep so labels line up with `decks`.
const labels = [];
for (let i = 0; i < decklistsData.length; i++) {
  const s = new Set(decklistsData[i]);
  if (s.size >= IDF.minDeckSize && s.size <= IDF.maxDeckSize) labels.push(rawLabels[i]);
}
if (labels.length !== N) throw new Error(`label misalignment ${labels.length} vs ${N}`);

// === THEME lens scoring ========================================================
// Embodying decks = real decks densest in the theme cards (theme-cosine), the
// "decks you would point to" of Section 4.4 step 1. Candidates = theme cards.
function themeRank(themeSlugs) {
  const themeCards = new Set();
  for (const slug of themeSlugs) for (const c of archLists.get(slug) ?? []) themeCards.add(c);
  let tsq = 0;
  for (const c of themeCards) tsq += idfOf(c) ** 2;
  const themeNorm = Math.sqrt(tsq) || 1;
  const cosOf = decks.map((d) => {
    let dot = 0;
    for (const c of d.cards) if (themeCards.has(c)) dot += idfOf(c) ** 2;
    return dot / (themeNorm * d.norm);
  });
  // Embodying = top decile by theme-cosine (min 30 decks), positive cosine only.
  const order = [...decks.keys()]
    .filter((i) => cosOf[i] > 0)
    .sort((a, b) => cosOf[b] - cosOf[a]);
  const take = Math.max(30, Math.round(order.length * 0.1));
  const embody = order.slice(0, take);
  const cnt = new Map();
  for (const i of embody) for (const c of decks[i].cards) if (themeCards.has(c)) cnt.set(c, (cnt.get(c) ?? 0) + 1);
  const T = embody.length || 1;
  const scored = [];
  for (const [c, n] of cnt) {
    const w = idfOf(c);
    if (w <= 0 || n < 2) continue;
    scored.push({ c, score: (n / T) * w, frac: n / T, idf: w, df: df.get(c) });
  }
  scored.sort((a, b) => b.score - a.score);
  return { scored, embodyCount: T };
}

// === LABEL lens scoring (deriveSignature, verbatim spirit) =====================
function labelRank(draftArchetypes) {
  const arch = new Set(draftArchetypes ?? []);
  const idxs = [];
  for (let i = 0; i < N; i++) if (labels[i] && arch.has(labels[i])) idxs.push(i);
  const cnt = new Map();
  for (const i of idxs) for (const c of decks[i].cards) cnt.set(c, (cnt.get(c) ?? 0) + 1);
  const T = idxs.length || 1;
  const scored = [];
  for (const [c, n] of cnt) {
    if (n < 2) continue;
    const w = idfOf(c);
    if (w <= 0) continue;
    scored.push({ c, score: (n / T) * w, frac: n / T, idf: w, df: df.get(c) });
  }
  scored.sort((a, b) => b.score - a.score);
  return { scored, labelCount: idxs.length };
}

// === HYBRID lens: theme build-arounds (candidate set) scored by how often they
// recur in THIS Dreamcaller's own labeled decks x idf. Restricting candidates to
// the tide build-arounds keeps the list clean (no generic co-occurring staples),
// while the per-Dreamcaller frequency personalizes same-theme Dreamcallers toward
// their actual color / sub-archetype home.
function hybridRank(themeSlugs, draftArchetypes) {
  const themeCards = new Set();
  for (const slug of themeSlugs) for (const c of archLists.get(slug) ?? []) themeCards.add(c);
  const arch = new Set(draftArchetypes ?? []);
  const idxs = [];
  for (let i = 0; i < N; i++) if (labels[i] && arch.has(labels[i])) idxs.push(i);
  const cnt = new Map();
  for (const i of idxs) for (const c of decks[i].cards) if (themeCards.has(c)) cnt.set(c, (cnt.get(c) ?? 0) + 1);
  const T = idxs.length || 1;
  const scored = [];
  for (const [c, n] of cnt) {
    const w = idfOf(c);
    if (w <= 0 || n < 2) continue;
    scored.push({ c, score: (n / T) * w, frac: n / T, idf: w, df: df.get(c) });
  }
  scored.sort((a, b) => b.score - a.score);
  return { scored, count: idxs.length };
}

const tag = (c) => {
  const t = cardTides.get(c) ?? [];
  return t.length ? `[${t.join(",")}]` : "[--]";
};
const row = (r) =>
  `    ${r.c.padEnd(26)} score=${r.score.toFixed(3)} frac=${r.frac.toFixed(2)} idf=${r.idf.toFixed(2)} df=${String(r.df).padStart(3)} ${tag(r.c)}`;

console.log(`Corpus: ${N} size-filtered decks.\n`);
for (const dc of dreamcallers) {
  const themes = DREAMCALLER_THEMES[dc.name];
  if (!themes) continue;
  const hr = hybridRank(themes, dc.draftArchetypes);
  // Coverage: ensure each of a multi-modal Dreamcaller's themes is represented
  // among the top picks; report which themes the top-6 touch.
  const top = hr.scored.slice(0, 8);
  const covered = new Set();
  for (const r of top.slice(0, 6))
    for (const t of cardTides.get(r.c) ?? []) if (themes.includes(t)) covered.add(t);
  const missing = themes.filter((t) => !covered.has(t));
  console.log("=".repeat(78));
  console.log(`${dc.name}   themes=[${themes.join(", ")}]   covered=${[...covered].join("+") || "none"}${missing.length ? `  MISSING:${missing.join(",")}` : ""}`);
  for (const r of top) console.log(row(r));
  console.log("");
}
