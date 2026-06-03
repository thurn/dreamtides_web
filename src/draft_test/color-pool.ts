// Browser port of `scripts/generate-color-pool.mjs`. It builds a random,
// color-coherent Dreamtides card pool of 180-220 cards from per-card metadata —
// see `docs/cards2/color_pool_generation_algorithm.md` for the full design.
//
// The generator's inputs are reconstructed from `cards_v2.toml` records (loaded
// in the browser via `cards-v2-database.ts`): `core` cards seed every pool,
// `tides` supply the mechanic-archetype themes, and `colors` /
// `draftArchetypes` supply the color-combo lists and color+archetype slices.
// The output is a multiset of card *names*; the caller maps those names onto
// `cards_v2.toml` records.

// --- tunable constants (kept in sync with the Node script) -------------------
const LO = 180;
const HI = 220;
const COLORS = "wubrg";
const K_WEIGHTS: Record<number, number> = { 1: 0.1, 2: 0.5, 3: 0.32, 4: 0.08 };
const T_ON = 0.55; // archetype is "on-color" if >= this fraction is legal
const TOPK = 3; // sample among the best neighbors in the theme walk
const ALPHA = 1.0; // weight exponent on overlap score
const JIT = 15; // how far below the ceiling the random target may fall

// Mechanic-archetype tide base name -> theme key. The key matches the historical
// archetype-list basename so theme labels (e.g. "A:discard-madness") are stable.
const TIDE_TO_ARCHETYPE = new Map<string, string>([
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

/** The card fields the pool generator reads. `CardData` satisfies this shape. */
export interface PoolCard {
  name: string;
  tides?: readonly string[];
  core?: boolean;
  colors?: readonly string[];
  draftArchetypes?: readonly string[];
}

/** The generator's reconstructed inputs. */
export interface PoolData {
  core: Set<string>;
  archLists: Map<string, Set<string>>;
  draftLists: Map<string, Set<string>>;
}

/** Result of one pool generation. */
export interface GeneratedPool {
  /** Chosen color identity as ordered w/u/b/r/g letters, e.g. "ubr". */
  identity: string;
  /** Selected theme labels, e.g. "A:storm" or "D:ur-welder". */
  themes: string[];
  /** Card name -> copy count (1 or 2). */
  counts: Map<string, number>;
  /** Seed used for this run, so a pool can be reproduced. */
  seed: number;
  /** Total copies in the pool (sum of counts, each capped at 2). */
  size: number;
}

/**
 * Expand a pool's copy counts into newline-ready card lines: names sorted, a
 * 2-of duplicated, so the line count equals the pool size. Shared by the Node
 * generator/simulation tooling so its output matches the in-app pool exactly.
 */
export function poolToLines(counts: Map<string, number>): string[] {
  const lines: string[] = [];
  for (const [card, count] of [...counts.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    for (let i = 0; i < Math.min(2, count); i++) lines.push(card);
  }
  return lines;
}

// --- seedable RNG (mulberry32) so runs are reproducible with a seed ----------
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randInt(rng: () => number, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}
function shuffle<T>(rng: () => number, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function weightedPick<T>(rng: () => number, items: T[], weights: number[]): T {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

// --- build the lists from card metadata --------------------------------------
// The historical generator read one list per file and iterated them in directory
// order, which is the code-unit sort of the `<name>.txt` filenames ('-' < '.', so
// "b-weenie" precedes "b"). Re-key the rebuilt maps in that same order so the
// overlap-weighted walk visits themes identically.
function byFilename(a: string, b: string): number {
  const fa = `${a}.txt`;
  const fb = `${b}.txt`;
  return fa < fb ? -1 : fa > fb ? 1 : 0;
}
function orderedMap(map: Map<string, Set<string>>): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const key of [...map.keys()].sort(byFilename)) {
    out.set(key, map.get(key) ?? new Set<string>());
  }
  return out;
}
function addTo(map: Map<string, Set<string>>, key: string, value: string): void {
  let set = map.get(key);
  if (!set) {
    set = new Set<string>();
    map.set(key, set);
  }
  set.add(value);
}

/**
 * Reconstruct the generator's inputs from card records. Each card contributes
 * to `core` (if flagged), to one mechanic archetype per tide base name, and to
 * every bare color-combo list and color+archetype slice it belongs to.
 */
export function buildPoolData(cards: readonly PoolCard[]): PoolData {
  const core = new Set<string>();
  const archLists = new Map<string, Set<string>>();
  const draftLists = new Map<string, Set<string>>();
  for (const card of cards) {
    if (card.core) core.add(card.name);
    for (const tide of card.tides ?? []) {
      const key = TIDE_TO_ARCHETYPE.get(tide);
      if (key) addTo(archLists, key, card.name);
    }
    for (const list of card.colors ?? []) addTo(draftLists, list, card.name);
    for (const list of card.draftArchetypes ?? []) {
      addTo(draftLists, list, card.name);
    }
  }
  return {
    core,
    archLists: orderedMap(archLists),
    draftLists: orderedMap(draftLists),
  };
}

// Leading run of color letters in a list name ('' if it has no color prefix).
function colorPrefix(name: string): string {
  const head = name.split("-")[0];
  const isColors =
    head.length > 0 && [...head].every((c) => COLORS.includes(c));
  return isColors ? head : "";
}

function inter(set: Set<string>, other: Set<string>): number {
  let n = 0;
  for (const c of set) if (other.has(c)) n++;
  return n;
}
// Pool size counts copies, capped at 2 per card.
function poolSize(counts: Map<string, number>): number {
  let n = 0;
  for (const v of counts.values()) n += Math.min(2, v);
  return n;
}

// --- the algorithm -----------------------------------------------------------
function generate(
  rng: () => number,
  { core, archLists, draftLists }: PoolData,
  seedArchetypes?: readonly string[],
): {
  C: Set<string>;
  selected: string[];
  counts: Map<string, number>;
} {
  const draftPrefix = new Map(
    [...draftLists.keys()].map((n) => [n, colorPrefix(n)]),
  );

  // A Dreamcaller can seed pool construction with a list of draft archetypes.
  // We pick one of those archetypes at random, adopt its colors as the identity,
  // and restrict the walk's color+archetype themes to the listed ones (on-color
  // mechanic-tide archetypes still join the walk). Only archetypes that exist in
  // the pool data and carry a color prefix are eligible seeds.
  const eligibleSeeds = (seedArchetypes ?? []).filter(
    (a) => draftLists.has(a) && colorPrefix(a) !== "",
  );
  const seeded = eligibleSeeds.length > 0;
  const allowedDraft = seeded ? new Set(seedArchetypes) : null;

  // 1. choose a color identity C
  let C: Set<string>;
  let seedThemeName: string | null = null;
  if (seeded) {
    const seed = eligibleSeeds[Math.floor(rng() * eligibleSeeds.length)];
    C = new Set([...colorPrefix(seed)]);
    seedThemeName = `D:${seed}`;
  } else {
    const k = Number(
      weightedPick(
        rng,
        Object.keys(K_WEIGHTS),
        Object.values(K_WEIGHTS),
      ),
    );
    C = new Set(shuffle(rng, [...COLORS]).slice(0, k));
  }

  // 2. on-color draft lists -> legal card pool for this identity
  const onColorDraft = [...draftLists.keys()].filter((n) => {
    const p = draftPrefix.get(n);
    return p !== "" && p !== undefined && [...p].every((c) => C.has(c));
  });
  const legal = new Set(core);
  for (const n of onColorDraft) {
    for (const c of draftLists.get(n) ?? []) legal.add(c);
  }

  // 3. candidate themes: on-color mechanic archetypes + color+archetype slices
  const themes = new Map<string, Set<string>>();
  for (const [a, cards] of archLists) {
    if (inter(cards, legal) / cards.size >= T_ON) {
      themes.set(`A:${a}`, new Set([...cards].filter((c) => legal.has(c))));
    }
  }
  for (const n of onColorDraft) {
    if (!n.includes("-")) continue;
    if (allowedDraft !== null && !allowedDraft.has(n)) continue;
    themes.set(`D:${n}`, draftLists.get(n) ?? new Set());
  }
  if (themes.size === 0) {
    for (const n of onColorDraft) {
      themes.set(`D:${n}`, draftLists.get(n) ?? new Set());
    }
  }

  // 4. seed + overlap-weighted synergy walk among themes
  const counts = new Map<string, number>([...core].map((c) => [c, 1]));
  const selected: string[] = [];
  const addTheme = (name: string): void => {
    selected.push(name);
    for (const c of themes.get(name) ?? []) {
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
  };
  const themeNames = [...themes.keys()];
  if (seedThemeName !== null && themes.has(seedThemeName)) {
    addTheme(seedThemeName);
  } else {
    addTheme(themeNames[Math.floor(rng() * themeNames.length)]);
  }

  while (poolSize(counts) < LO) {
    const union = new Set<string>();
    for (const s of selected) {
      for (const c of themes.get(s) ?? []) union.add(c);
    }
    const cands = themeNames
      .filter((s) => !selected.includes(s))
      .map((s): [string, number] => [s, inter(themes.get(s) ?? new Set(), union)])
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
    const freq = new Map<string, number>();
    for (const n of onColorDraft) {
      for (const c of draftLists.get(n) ?? []) {
        freq.set(c, (freq.get(c) ?? 0) + 1);
      }
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
      for (const c of themes.get(s) ?? []) others.add(c);
    }
    const fringe = shuffle(
      rng,
      [...(themes.get(selected[selected.length - 1]) ?? [])].filter(
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
 * Generate a fresh random pool from the given card records. Pass a `seed` to
 * reproduce a previous run; omit it for a new random pool each call. Copy counts
 * in the returned map are capped at 2, matching the 2-copy rule the design doc
 * describes. For repeated generation, build `PoolData` once with
 * {@link buildPoolData} and call {@link generatePoolFromData}.
 */
export function generatePool(
  cards: readonly PoolCard[],
  seed?: number,
  seedArchetypes?: readonly string[],
): GeneratedPool {
  return generatePoolFromData(buildPoolData(cards), seed, seedArchetypes);
}

/**
 * Generate a pool from prebuilt {@link PoolData}. Pass `seedArchetypes` (a
 * Dreamcaller's `draftArchetypes`) to seed construction from one of those
 * archetypes; omit it for the unconstrained random pool.
 */
export function generatePoolFromData(
  poolData: PoolData,
  seed?: number,
  seedArchetypes?: readonly string[],
): GeneratedPool {
  const resolvedSeed =
    seed === undefined ? (Math.random() * 2 ** 32) >>> 0 : seed >>> 0;
  const { C, selected, counts } = generate(
    makeRng(resolvedSeed),
    poolData,
    seedArchetypes,
  );

  const capped = new Map<string, number>();
  for (const [card, count] of counts) {
    capped.set(card, Math.min(2, count));
  }

  const identity = [...COLORS].filter((c) => C.has(c)).join("");
  return {
    identity,
    themes: selected,
    counts: capped,
    seed: resolvedSeed,
    size: poolSize(counts),
  };
}
