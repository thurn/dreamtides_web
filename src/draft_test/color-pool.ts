// Browser port of `scripts/generate-color-pool.mjs`. It builds a random,
// color-coherent Dreamtides card pool of 180-220 cards from the same three
// families of curated lists the Node script uses — see
// `docs/cards2/color_pool_generation_algorithm.md` for the full design.
//
// The Node script reads the lists from disk; here Vite inlines every list file
// at build time via `import.meta.glob(..., '?raw')`, so the algorithm can run
// entirely in the browser. The output is a multiset of card *names*; the caller
// maps those names onto `cards_v2.toml` records.

// Raw contents of every list file, keyed by absolute path from the project
// root (e.g. "/docs/archetype_lists/abandon.txt").
const archRaw = import.meta.glob("/docs/archetype_lists/*.txt", {
  query: "?raw",
  import: "default",
  eager: true,
});
const draftRaw = import.meta.glob("/docs/drafts_adapted/*.txt", {
  query: "?raw",
  import: "default",
  eager: true,
});

// --- tunable constants (kept in sync with the Node script) -------------------
const LO = 180;
const HI = 220;
const COLORS = "wubrg";
const K_WEIGHTS: Record<number, number> = { 1: 0.1, 2: 0.5, 3: 0.32, 4: 0.08 };
const T_ON = 0.55; // archetype is "on-color" if >= this fraction is legal
const TOPK = 3; // sample among the best neighbors in the theme walk
const ALPHA = 1.0; // weight exponent on overlap score
const JIT = 15; // how far below the ceiling the random target may fall

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

// --- load the lists ----------------------------------------------------------
function basename(path: string): string {
  const file = path.split("/").pop() ?? path;
  return file.endsWith(".txt") ? file.slice(0, -4) : file;
}
function parseList(raw: string): Set<string> {
  return new Set(
    raw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
  );
}
function loadRaw(raw: Record<string, unknown>): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const [path, contents] of Object.entries(raw)) {
    out.set(basename(path), parseList(String(contents)));
  }
  return out;
}

const archLists = loadRaw(archRaw);
const core = archLists.get("core") ?? new Set<string>();
archLists.delete("core");
const draftLists = loadRaw(draftRaw);

// Leading run of color letters in a filename ('' if it has no color prefix).
function colorPrefix(name: string): string {
  const head = name.split("-")[0];
  const isColors =
    head.length > 0 && [...head].every((c) => COLORS.includes(c));
  return isColors ? head : "";
}
const draftPrefix = new Map(
  [...draftLists.keys()].map((n) => [n, colorPrefix(n)]),
);

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
function generate(rng: () => number): {
  C: Set<string>;
  selected: string[];
  counts: Map<string, number>;
} {
  // 1. choose a color identity C
  const k = Number(
    weightedPick(
      rng,
      Object.keys(K_WEIGHTS),
      Object.values(K_WEIGHTS),
    ),
  );
  const C = new Set(shuffle(rng, [...COLORS]).slice(0, k));

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
    if (n.includes("-")) themes.set(`D:${n}`, draftLists.get(n) ?? new Set());
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
  addTheme(themeNames[Math.floor(rng() * themeNames.length)]);

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
 * Generate a fresh random pool. Pass a `seed` to reproduce a previous run;
 * omit it for a new random pool each call. Copy counts in the returned map are
 * capped at 2, matching the 2-copy rule the design doc describes.
 */
export function generatePool(seed?: number): GeneratedPool {
  const resolvedSeed =
    seed === undefined ? (Math.random() * 2 ** 32) >>> 0 : seed >>> 0;
  const { C, selected, counts } = generate(makeRng(resolvedSeed));

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
