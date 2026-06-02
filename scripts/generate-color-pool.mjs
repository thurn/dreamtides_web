// Generate a random Dreamtides card pool of 180-220 cards using the
// color-identity algorithm documented in docs/cards2/color_pool_generation_algorithm.md.
//
// The pool is sourced entirely from per-card metadata in data/tabula/cards_v2.toml:
//   - core             cards seed every pool
//   - tides            supply the mechanic-archetype themes (one per tide base name)
//   - colors           the bare color-combo lists that define legality + fill
//   - draft-archetypes the color+archetype slices that supply color-tied themes
//
// Card names are written newline-delimited to stdout; a 2-of is printed twice,
// so the line count equals the pool size. A one-line summary (color identity,
// size, themes) is written to stderr so stdout stays pipeable.
//
// Usage:
//   node scripts/generate-color-pool.mjs            # random pool
//   node scripts/generate-color-pool.mjs --seed 42  # reproducible pool
import { readFileSync } from "node:fs";
import { parse } from "smol-toml";

const ROOT = new URL("..", import.meta.url).pathname;
const CARD_TOML = new URL("../data/tabula/cards_v2.toml", import.meta.url)
  .pathname;

// --- tunable constants (see the design doc) -----------------------------------
const LO = 180;
const HI = 220;
const COLORS = "wubrg";
const K_WEIGHTS = { 1: 0.1, 2: 0.5, 3: 0.32, 4: 0.08 }; // colors per pool
const T_ON = 0.55; // archetype is "on-color" if >= this fraction is legal
const TOPK = 3; // sample among the best neighbors in the theme walk
const ALPHA = 1.0; // weight exponent on overlap score
const JIT = 15; // how far below the ceiling the random target may fall

// Mechanic-archetype tide base name -> theme key. The key matches the historical
// archetype-list basename so theme labels (e.g. "A:discard-madness") are stable.
const TIDE_TO_ARCHETYPE = new Map([
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

// --- build the lists from card metadata ----------------------------------------
// The historical generator read one list per file and iterated them in directory
// order, which is the code-unit sort of the `<name>.txt` filenames ('-' < '.', so
// "b-weenie" precedes "b"). Re-key the rebuilt maps in that same order so the
// overlap-weighted walk visits themes identically.
function byFilename(a, b) {
  const fa = `${a}.txt`;
  const fb = `${b}.txt`;
  return fa < fb ? -1 : fa > fb ? 1 : 0;
}
function orderedMap(map) {
  const out = new Map();
  for (const key of [...map.keys()].sort(byFilename)) out.set(key, map.get(key));
  return out;
}
function add(map, key, value) {
  let set = map.get(key);
  if (!set) {
    set = new Set();
    map.set(key, set);
  }
  set.add(value);
}

/**
 * Reconstruct the generator's inputs from cards_v2.toml records. Each card
 * contributes to `core` (if flagged), to one mechanic archetype per tide base
 * name, and to every bare color-combo list and color+archetype slice it belongs
 * to. Returns `{ core, archLists, draftLists }`.
 */
export function buildPoolData(cards) {
  const core = new Set();
  const archLists = new Map();
  const draftLists = new Map();
  for (const card of cards) {
    const name = card.name;
    if (card.core) core.add(name);
    for (const tide of card.tides ?? []) {
      if (tide.endsWith(" Splash")) continue;
      const key = TIDE_TO_ARCHETYPE.get(tide);
      if (key) add(archLists, key, name);
    }
    for (const list of card.colors ?? []) add(draftLists, list, name);
    for (const list of card.draftArchetypes ?? []) add(draftLists, list, name);
  }
  return {
    core,
    archLists: orderedMap(archLists),
    draftLists: orderedMap(draftLists),
  };
}

/** Load and normalize the card records the generator needs from cards_v2.toml. */
export function loadCards(tomlPath = CARD_TOML) {
  const parsed = parse(readFileSync(tomlPath, "utf8"));
  return parsed.cards.map((card) => ({
    name: card.name,
    tides: Array.isArray(card.tides) ? card.tides : [],
    core: card.core === true,
    colors: Array.isArray(card.colors) ? card.colors : [],
    draftArchetypes: Array.isArray(card["draft-archetypes"])
      ? card["draft-archetypes"]
      : [],
  }));
}

// Leading run of color letters in a list name ('' if it has no color prefix).
function colorPrefix(name) {
  const head = name.split("-")[0];
  const isColors = head.length > 0 && [...head].every((c) => COLORS.includes(c));
  return isColors ? head : "";
}

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
function generate(rng, { core, archLists, draftLists }) {
  const draftPrefix = new Map(
    [...draftLists.keys()].map((n) => [n, colorPrefix(n)]),
  );

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

/**
 * Run one generation for `seed` against prebuilt `poolData`, returning the
 * newline-delimited card lines (2-ofs duplicated, sorted by name), the color
 * identity, the selected theme labels, and the pool size.
 */
export function runSeed(seed, poolData) {
  const { C, selected, counts } = generate(makeRng(seed >>> 0), poolData);
  const lines = [];
  for (const [card, count] of [...counts.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    for (let i = 0; i < Math.min(2, count); i++) lines.push(card);
  }
  const identity = [...COLORS].filter((c) => C.has(c)).join("");
  return { lines, identity, themes: selected, size: lines.length };
}

// --- run -----------------------------------------------------------------------
function parseSeed(argv) {
  const i = argv.indexOf("--seed");
  if (i !== -1 && argv[i + 1] != null) return Number(argv[i + 1]) >>> 0;
  const eq = argv.find((a) => a.startsWith("--seed="));
  if (eq) return Number(eq.slice("--seed=".length)) >>> 0;
  return (Math.random() * 2 ** 32) >>> 0;
}

function main() {
  const seed = parseSeed(process.argv.slice(2));
  const poolData = buildPoolData(loadCards());
  const { lines, identity, themes } = runSeed(seed, poolData);
  process.stdout.write(`${lines.join("\n")}\n`);
  process.stderr.write(
    `# identity=${identity} seed=${seed} size=${lines.length} themes=${themes.join(", ")}\n`,
  );
}

// Avoid `import.meta.url` path comparison pitfalls: run only when invoked as the
// entry script, not when imported by tests.
if (process.argv[1] && process.argv[1] === new URL(import.meta.url).pathname) {
  main();
}
