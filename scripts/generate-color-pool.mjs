// Generate a random Dreamtides card pool of 180-220 cards using the
// color-identity algorithm documented in docs/cards2/color_pool_generation_algorithm.md.
//
// Card names are written newline-delimited to stdout; a 2-of is printed twice,
// so the line count equals the pool size. A one-line summary (color identity,
// size, themes) is written to stderr so stdout stays pipeable.
//
// Usage:
//   node scripts/generate-color-pool.mjs            # random pool
//   node scripts/generate-color-pool.mjs --seed 42  # reproducible pool
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const ARCH_DIR = join(ROOT, "docs/archetype_lists");
const DRAFT_DIR = join(ROOT, "docs/drafts_adapted");

// --- tunable constants (see the design doc) -----------------------------------
const LO = 180;
const HI = 220;
const COLORS = "wubrg";
const K_WEIGHTS = { 1: 0.1, 2: 0.5, 3: 0.32, 4: 0.08 }; // colors per pool
const T_ON = 0.55; // archetype is "on-color" if >= this fraction is legal
const TOPK = 3; // sample among the best neighbors in the theme walk
const ALPHA = 1.0; // weight exponent on overlap score
const JIT = 15; // how far below the ceiling the random target may fall

// --- seedable RNG (mulberry32) so runs are reproducible with --seed ------------
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
function randInt(rng, lo, hi) {
  return lo + Math.floor(rng() * (hi - lo + 1));
}
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

// --- load the lists ------------------------------------------------------------
function loadDir(dir) {
  const out = new Map();
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".txt"))) {
    const cards = readFileSync(join(dir, f), "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    out.set(f.slice(0, -4), new Set(cards));
  }
  return out;
}

const archLists = loadDir(ARCH_DIR);
const core = archLists.get("core");
archLists.delete("core");
const draftLists = loadDir(DRAFT_DIR);

// Leading run of color letters in a filename ('' if it has no color prefix).
function colorPrefix(name) {
  const head = name.split("-")[0];
  const isColors = head.length > 0 && [...head].every((c) => COLORS.includes(c));
  return isColors ? head : "";
}
const draftPrefix = new Map([...draftLists.keys()].map((n) => [n, colorPrefix(n)]));

const inter = (set, other) => {
  let n = 0;
  for (const c of set) if (other.has(c)) n++;
  return n;
};
// Pool size counts copies, capped at 2 per card.
const poolSize = (counts) => {
  let n = 0;
  for (const v of counts.values()) n += Math.min(2, v);
  return n;
};

// --- the algorithm -------------------------------------------------------------
function generate(rng) {
  // 1. choose a color identity C
  const k = Number(
    weightedPick(rng, Object.keys(K_WEIGHTS), Object.values(K_WEIGHTS)),
  );
  const C = new Set(shuffle(rng, [...COLORS]).slice(0, k));

  // 2. on-color draft lists -> legal card pool for this identity
  const onColorDraft = [...draftLists.keys()].filter((n) => {
    const p = draftPrefix.get(n);
    return p !== "" && [...p].every((c) => C.has(c));
  });
  const legal = new Set(core);
  for (const n of onColorDraft) for (const c of draftLists.get(n)) legal.add(c);

  // 3. candidate themes: on-color mechanic archetypes + color+archetype slices
  const themes = new Map();
  for (const [a, cards] of archLists) {
    if (inter(cards, legal) / cards.size >= T_ON) {
      themes.set(`A:${a}`, new Set([...cards].filter((c) => legal.has(c))));
    }
  }
  for (const n of onColorDraft) {
    if (n.includes("-")) themes.set(`D:${n}`, draftLists.get(n));
  }
  if (themes.size === 0) {
    for (const n of onColorDraft) themes.set(`D:${n}`, draftLists.get(n));
  }

  // 4. seed + overlap-weighted synergy walk among themes
  const counts = new Map([...core].map((c) => [c, 1]));
  const selected = [];
  const addTheme = (name) => {
    selected.push(name);
    for (const c of themes.get(name)) counts.set(c, (counts.get(c) ?? 0) + 1);
  };
  const themeNames = [...themes.keys()];
  addTheme(themeNames[Math.floor(rng() * themeNames.length)]);

  while (poolSize(counts) < LO) {
    const union = new Set();
    for (const s of selected) for (const c of themes.get(s)) union.add(c);
    const cands = themeNames
      .filter((s) => !selected.includes(s))
      .map((s) => [s, inter(themes.get(s), union)])
      .filter(([, score]) => score > 0)
      .sort((x, y) => y[1] - x[1])
      .slice(0, TOPK);
    if (cands.length === 0) break;
    const pick = weightedPick(
      rng,
      cands.map(([s]) => s),
      cands.map(([, score]) => score ** ALPHA),
    );
    addTheme(pick);
  }

  // 4a. if still short, fill with the most-shared on-color staples (1-ofs)
  if (poolSize(counts) < LO) {
    const freq = new Map();
    for (const n of onColorDraft) {
      for (const c of draftLists.get(n)) freq.set(c, (freq.get(c) ?? 0) + 1);
    }
    const fillers = [...freq.entries()]
      .sort((x, y) => y[1] - x[1])
      .map(([c]) => c)
      .filter((c) => !counts.has(c));
    for (const c of fillers) {
      if (poolSize(counts) >= LO) break;
      counts.set(c, 1);
    }
  }

  // 4b. jitter: demote a random subset of 2-ofs down to a random target size
  const cap = Math.min(poolSize(counts), HI);
  const target = randInt(rng, Math.max(LO, cap - JIT), cap);
  const twos = shuffle(
    rng,
    [...counts.entries()].filter(([, v]) => v >= 2).map(([c]) => c),
  );
  for (const c of twos) {
    if (poolSize(counts) <= target) break;
    counts.set(c, 1);
  }

  // 4c. fallback fringe-trim (rare): cut cards unique to the last theme
  if (poolSize(counts) > target && selected.length > 0) {
    const others = new Set(core);
    for (const s of selected.slice(0, -1)) {
      for (const c of themes.get(s)) others.add(c);
    }
    const fringe = shuffle(
      rng,
      [...themes.get(selected[selected.length - 1])].filter(
        (c) => counts.has(c) && !others.has(c),
      ),
    );
    for (const c of fringe) {
      if (poolSize(counts) <= Math.max(target, LO)) break;
      counts.delete(c);
    }
  }

  return { C, selected, counts };
}

// --- run -----------------------------------------------------------------------
function parseSeed(argv) {
  const i = argv.indexOf("--seed");
  if (i !== -1 && argv[i + 1] != null) return Number(argv[i + 1]) >>> 0;
  const eq = argv.find((a) => a.startsWith("--seed="));
  if (eq) return Number(eq.slice("--seed=".length)) >>> 0;
  return (Math.random() * 2 ** 32) >>> 0;
}

const seed = parseSeed(process.argv.slice(2));
const { C, selected, counts } = generate(makeRng(seed));

// Expand the pool to one line per copy (2-ofs printed twice), sorted by name.
const lines = [];
for (const [card, count] of [...counts.entries()].sort((a, b) =>
  a[0].localeCompare(b[0]),
)) {
  for (let i = 0; i < Math.min(2, count); i++) lines.push(card);
}
process.stdout.write(`${lines.join("\n")}\n`);

const identity = [...COLORS].filter((c) => C.has(c)).join("");
process.stderr.write(
  `# identity=${identity} seed=${seed} size=${lines.length} themes=${selected.join(", ")}\n`,
);
