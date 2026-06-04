// Validate the shipped Dreamcaller signatures (the `signature-cards` field in
// dreamcallers_v2.toml): feed each real
// signature through the idf3 A'' starter-draw scheme and measure, using each
// Dreamcaller's real archetype-labeled decks as ground truth (which the steering
// never sees), whether the draw lands on the Dreamcaller's decks and spreads
// across them. Mirrors the metrics of the idf3 experiment but with the SHIPPED
// signatures rather than auto-derived ones.
//
// Run: node scripts/idf3-validate-signatures.mjs

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (p) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));
const cards = readJson("public/cards_v2-data.json");
const decklistsData = readJson("public/decklists-data.json");
const dreamcallers = readJson("public/dreamcallers-v2-data.json");

// The shipped signatures, recovered from the generated Dreamcaller data
// (sourced from the `signature-cards` field in dreamcallers_v2.toml).
const DREAMCALLER_SIGNATURES = Object.fromEntries(
  dreamcallers
    .filter((d) => Array.isArray(d.signatureCards) && d.signatureCards.length > 0)
    .map((d) => [d.name, d.signatureCards]),
);

// A'' constants (design Section 5.1) + idf/idf2 corpus knobs.
const SIG = { alpha: 2, cap: 0.4, anchorCount: 3, eps: 0.05 };
const IDF = { minDeckSize: 16, maxDeckSize: 34 };
const IDF2 = { twinTau: 0.5, diversityBeta: 0.5 };

// Corpus + labels, recovered exactly as in idf3-signature-experiment.mjs.
const COLORS = "wubrg";
const colorPrefix = (n) => {
  const h = n.split("-")[0];
  return h.length > 0 && [...h].every((c) => COLORS.includes(c)) ? h : "";
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

const keep = [];
const labels = [];
for (let i = 0; i < decklistsData.length; i++) {
  const s = new Set(decklistsData[i]);
  if (s.size >= IDF.minDeckSize && s.size <= IDF.maxDeckSize) {
    keep.push(s);
    labels.push(rawLabels[i]);
  }
}
const N = keep.length;
const df = new Map();
for (const s of keep) for (const c of s) df.set(c, (df.get(c) ?? 0) + 1);
const idf = new Map();
for (const [c, d] of df) idf.set(c, Math.log((N + 1) / d));
const idfOf = (c) => idf.get(c) ?? 0;
const decks = keep.map((cardsSet) => {
  let sq = 0;
  for (const c of cardsSet) sq += idfOf(c) ** 2;
  return { cards: cardsSet, norm: Math.sqrt(sq) || 1 };
});
const cosine = (a, b) => {
  const [s, l] = a.cards.size <= b.cards.size ? [a, b] : [b, a];
  let dot = 0;
  for (const c of s.cards) if (l.cards.has(c)) dot += idfOf(c) ** 2;
  return dot / (a.norm * b.norm);
};
const sim = Array.from({ length: N }, () => new Float64Array(N));
const twins = new Float64Array(N);
for (let i = 0; i < N; i++)
  for (let j = i + 1; j < N; j++) {
    const s = cosine(decks[i], decks[j]);
    sim[i][j] = sim[j][i] = s;
    if (s >= IDF2.twinTau) {
      twins[i]++;
      twins[j]++;
    }
  }
const div = new Float64Array(N);
for (let i = 0; i < N; i++) div[i] = 1 / (1 + twins[i]) ** IDF2.diversityBeta;

function anchorSim(signature) {
  const sset = new Set(signature.filter((c) => idfOf(c) > 0));
  let psq = 0;
  for (const c of sset) psq += idfOf(c) ** 2;
  const pnorm = Math.sqrt(psq) || 1;
  const probeCos = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    let dot = 0;
    for (const c of sset) if (decks[i].cards.has(c)) dot += idfOf(c) ** 2;
    probeCos[i] = dot / (pnorm * decks[i].norm);
  }
  const anchors = [...Array(N).keys()]
    .filter((i) => probeCos[i] > 0)
    .sort((a, b) => probeCos[b] - probeCos[a] || a - b)
    .slice(0, SIG.anchorCount);
  const aff = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    let mx = 0;
    for (const a of anchors) {
      const s = a === i ? 1 : sim[a][i];
      if (s > mx) mx = s;
    }
    aff[i] = mx;
  }
  return { aff, probeSize: sset.size };
}

console.log(
  `Validating shipped signature-cards via A'' (alpha=${SIG.alpha}, cap=${SIG.cap}, m=${SIG.anchorCount}) over ${N} decks.\n`,
);
const head =
  "Dreamcaller".padEnd(18) +
  ["probe", "trueDk", "onIdent", "effGood", "maxShare"].map((h) => h.padStart(9)).join("");
console.log(head);
console.log("-".repeat(head.length));
const byName = new Map(dreamcallers.map((d) => [d.name, d]));
let sums = { onId: 0, eff: 0, max: 0, n: 0 };
for (const [name, signature] of Object.entries(DREAMCALLER_SIGNATURES)) {
  const dc = byName.get(name);
  const arch = new Set(dc?.draftArchetypes ?? []);
  const trueSet = new Set();
  for (let i = 0; i < N; i++) if (labels[i] && arch.has(labels[i])) trueSet.add(i);
  const { aff, probeSize } = anchorSim(signature);
  const w = Array.from(div, (d, i) => (SIG.eps + Math.min(aff[i], SIG.cap)) ** SIG.alpha * d);
  let total = 0;
  for (const x of w) total += x;
  let onId = 0;
  for (const i of trueSet) onId += w[i] / total;
  let eff = 0,
    maxShare = 0;
  if (onId > 0) {
    let s2 = 0;
    for (const i of trueSet) {
      const q = w[i] / total / onId;
      s2 += q * q;
      if (q > maxShare) maxShare = q;
    }
    eff = 1 / s2;
  }
  sums.onId += onId;
  sums.eff += eff;
  sums.max += maxShare;
  sums.n++;
  console.log(
    name.padEnd(18) +
      [
        `${probeSize}/${signature.length}`,
        String(trueSet.size),
        onId.toFixed(3),
        eff.toFixed(1),
        maxShare.toFixed(3),
      ]
        .map((c) => c.padStart(9))
        .join(""),
  );
}
console.log("-".repeat(head.length));
console.log(
  "AVERAGE".padEnd(18) +
    ["", "", (sums.onId / sums.n).toFixed(3), (sums.eff / sums.n).toFixed(1), (sums.max / sums.n).toFixed(3)]
      .map((c) => c.padStart(9))
      .join(""),
);
console.log(`
onIdent  P(drawn starter is one of the Dreamcaller's labeled decks). HIGHER=match.
effGood  effective # of distinct fitting decks the draw spreads across. HIGHER=broad.
maxShare single most-drawn fitting deck's share. LOWER=no collapse.
(Baseline diversity-only onIdent over these Dreamcallers is ~0.16.)`);
