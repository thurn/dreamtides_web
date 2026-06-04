// Browser port of `scripts/generate-color-pool.mjs`. It builds a random,
// color-coherent Dreamtides card pool of 180-220 cards from per-card metadata —
// see `docs/cards2/draft_pool_algorithms.md` for the full design.
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

// --- pool-generation variants ------------------------------------------------
// `default` is the original color-identity algorithm. `diverse` is an
// experimental variant tuned to spread cards and archetypes more evenly across
// pools (see `docs/cards2/draft_pool_algorithms.md`). The two are selectable
// side by side via the `variant` argument and the draft test `?algo=` URL
// parameter. To make a variant the primary one, change `DEFAULT_POOL_VARIANT`;
// to retire the experiment, delete the `diverse` branch and `generateDiverse`.
export type PoolVariant = "default" | "diverse" | "decklists";
export const DEFAULT_POOL_VARIANT: PoolVariant = "default";

// Knobs for the `decklists` variant. It ignores the synthesized archetype
// themes the other variants walk and instead grows a pool out of real,
// human-shaped decklists (`docs/drafts_dt`, bundled to `decklists-data.json`):
// pick a Dreamcaller strategy, grab a real decklist rich in that strategy's
// cards as the "starter", then repeatedly add the decklists most *similar* to
// the starter until the pool reaches the target size. Similarity is cosine over
// IDF-weighted card vectors, so the distinctive cards two decks share count for
// much more than ubiquitous ones (e.g. the near-omnipresent Abandon cards).
// Grouped here so tuning is a one-stop edit.
interface DecklistsTuning {
  targetSize: number;
  targetJitter: number;
  minDeckSize: number;
  maxDeckSize: number;
  starterTopK: number;
  starterAlpha: number;
  growTopK: number;
  growTemperature: number;
  themeStrategyExp: number;
  themeStarterBoost: number;
  themeGrowBoost: number;
  spineArchetypes: number;
}
const DECKLISTS: DecklistsTuning = {
  // Desired pool size in copies (each card capped at 2). The pool lands within
  // +/- targetJitter of this. ~150 plays as a focused single-archetype pool.
  targetSize: 150,
  // Random wobble around targetSize so the size varies run to run.
  targetJitter: 8,
  // Ignore decklists smaller than this — the tail of partial/near-empty files
  // carries too little signal to anchor or match on.
  minDeckSize: 16,
  // Ignore decklists larger than this — the handful of 50-91 card files are
  // aggregates, not drafted decks, and would dominate any overlap score.
  maxDeckSize: 34,
  // Pick the starter by sampling among the N decklists that best fit the rolled
  // strategy (weighted by fit^starterAlpha), rather than always the single best
  // — that is a big source of run-to-run variety.
  starterTopK: 25,
  // Exponent on starter fit when sampling: higher = tighter to the best fits.
  starterAlpha: 2,
  // Each growth step samples among the N decklists most similar to the starter.
  // Small keeps the pool focused; larger lets it drift toward the archetype's
  // edges.
  growTopK: 10,
  // Softmax temperature for growth picks. Lower = almost always take the most
  // similar deck (tight, archetype-pure pools); higher = flatter sampling
  // (looser, more varied pools).
  growTemperature: 0.35,
  // Theme bias (only when the Dreamcaller has theme archetypes). The strategy
  // roll weights each eligible strategy by (1 + theme cards in it)^this, so an
  // abandon Dreamcaller rolls aristocrats far more than off-theme green ramp.
  // 0 = roll uniformly regardless of theme.
  themeStrategyExp: 1.5,
  // Theme bias on starter choice: a candidate decklist's fit score is scaled by
  // (1 + this * theme-cosine), pulling the starter toward decks dense in the
  // Dreamcaller's theme cards. 0 = ignore theme when picking the starter.
  themeStarterBoost: 2,
  // Theme bias on each growth step: similarity to the starter is scaled by
  // (1 + this * theme-cosine), so the snowball keeps pulling in theme-dense
  // decks instead of drifting to whatever co-occurs in the colors. 0 = ignore.
  themeGrowBoost: 2.5,
  // The pool's "spine" is the starter's top-N mechanic archetypes. During
  // growth only cards on the spine are absorbed from each neighbor deck, so the
  // pool's *card list* stays one strategy instead of dragging in each
  // neighbor's off-archetype half (which is what made pools feel like a scatter
  // of every archetype). 1 = a single pure archetype; 2 keeps a natural primary
  // + secondary pairing; a large value effectively disables the gate.
  spineArchetypes: 2,
};

// Knobs for the `diverse` variant. Grouped here so tuning is a one-stop edit.
interface DiverseTuning {
  seedExponent: number;
  walkExploration: number;
  reachExponent: number;
  themeBudget: number | null;
  inclusionK: number;
  fillExponent: number;
}
const DIVERSE: DiverseTuning = {
  // Seed: weight the opening archetype (which sets the color identity) by
  // 1 / reach^seedExponent, so identities that few archetypes can reach —
  // notably multi-color ones — are seeded more often. This lifts otherwise
  // starved multi-color archetypes. 0 = seed uniformly at random.
  seedExponent: 1,
  // Walk: 1 = always pick the next theme uniformly at random among on-color
  // candidates (kills the rich-get-richer overlap bias); 0 = behave like the
  // default overlap-weighted walk. Values in between mix the two per step.
  walkExploration: 1,
  // Walk: down-weight a candidate theme by 1 / reach^reachExponent, where reach
  // is how many identities the theme is eligible in. A larger exponent pushes
  // selection harder toward themes eligible in fewer identities (e.g. multi-color
  // and niche themes), countering the dominance of broadly-eligible mechanic and
  // one-color themes.
  reachExponent: 1.5,
  // Walk: cap the number of themes a pool draws before it switches to uniform
  // fill. A smaller budget gives each pool a few focused archetypes and lets the
  // uniform fill carry the rest, which flattens archetype usage; `null` keeps
  // adding themes until the size floor is reached.
  themeBudget: 6,
  // Alternate tagging: when a theme is added, each card is included with
  // probability min(1, inclusionK / themeBreadth), where themeBreadth is how
  // many archetype themes the card is tagged into. Broadly-tagged cards thus
  // contribute less per theme while narrowly-tagged cards stay reliable, which
  // flattens both inclusion rate and 2-of accumulation.
  inclusionK: 3,
  // Fill: when the pool is short, sample legal non-pool cards weighted by
  // 1 / colorBreadth^fillExponent, where colorBreadth is how many bare-color
  // lists the card is legal in. This favors cards legal in fewer color combos
  // (which are otherwise rarely fill candidates), countering the legality-breadth
  // bias. 0 = uniform fill.
  fillExponent: 1,
};

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
  /**
   * Real per-deck card lists used by the `decklists` variant. Optional because
   * the theme-based variants and the Node tooling do not need them; when absent
   * the `decklists` variant falls back to the `default` algorithm.
   */
  decklists?: readonly (readonly string[])[];
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
  /** Which generation variant produced this pool. */
  variant: PoolVariant;
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
export function buildPoolData(
  cards: readonly PoolCard[],
  decklists?: readonly (readonly string[])[],
): PoolData {
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
    decklists,
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

// --- the diverse variant -----------------------------------------------------
// How many archetype themes each card is tagged into ("theme breadth"), cached
// per PoolData. This is the data signal the diverse variant uses to down-weight
// broadly-tagged cards. Bare color lists are not themes, so they do not count.
const breadthCache = new WeakMap<PoolData, Map<string, number>>();
function themeBreadth(poolData: PoolData): Map<string, number> {
  const cached = breadthCache.get(poolData);
  if (cached) return cached;
  const breadth = new Map<string, number>();
  const bump = (c: string): void => {
    breadth.set(c, (breadth.get(c) ?? 0) + 1);
  };
  for (const set of poolData.archLists.values()) for (const c of set) bump(c);
  for (const [key, set] of poolData.draftLists) {
    if (key.includes("-")) for (const c of set) bump(c);
  }
  breadthCache.set(poolData, breadth);
  return breadth;
}

// How many bare-color lists each card is legal in ("color breadth"), cached per
// PoolData. The diverse fill uses it to down-weight cards legal in many color
// combinations, which are otherwise over-sampled because they are fill
// candidates in nearly every pool.
const colorBreadthCache = new WeakMap<PoolData, Map<string, number>>();
function colorBreadth(poolData: PoolData): Map<string, number> {
  const cached = colorBreadthCache.get(poolData);
  if (cached) return cached;
  const breadth = new Map<string, number>();
  for (const [key, set] of poolData.draftLists) {
    if (key.includes("-")) continue;
    for (const c of set) breadth.set(c, (breadth.get(c) ?? 0) + 1);
  }
  colorBreadthCache.set(poolData, breadth);
  return breadth;
}

/**
 * Sample `count` distinct items from `items`, weighted, without replacement,
 * using the Efraimidis-Spirakis key trick (key = u^(1/weight), take the
 * largest). Returns fewer than `count` only if `items` is shorter.
 */
function weightedSample<T>(
  rng: () => number,
  items: readonly T[],
  weight: (item: T) => number,
  count: number,
): T[] {
  return [...items]
    .map((item): [T, number] => [item, rng() ** (1 / Math.max(1e-9, weight(item)))])
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([item]) => item);
}

// Canonical color-identity string (ordered w/u/b/r/g) for a color set or prefix.
function canonicalColors(colors: Iterable<string>): string {
  const set = new Set(colors);
  return [...COLORS].filter((c) => set.has(c)).join("");
}

// On-color candidate themes for identity `C`: the default variant's step-2/3
// candidacy logic, shared by `generateDiverse` and `themeReach`. `allowedDraft`,
// when set, restricts the color-archetype themes to a Dreamcaller's list.
function diverseCandidateThemes(
  poolData: PoolData,
  C: Set<string>,
  allowedDraft: Set<string> | null,
): Map<string, Set<string>> {
  const { core, archLists, draftLists } = poolData;
  const onColorDraft = [...draftLists.keys()].filter((n) => {
    const p = colorPrefix(n);
    return p !== "" && [...p].every((c) => C.has(c));
  });
  const legal = new Set(core);
  for (const n of onColorDraft) {
    for (const c of draftLists.get(n) ?? []) legal.add(c);
  }
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
  return themes;
}

// "Theme reach": the expected number of pools in which a theme is an on-color
// candidate, weighted by how often the diverse variant rolls each identity
// (identity == one seed archetype's colors, so each identity's weight is the
// count of color-archetypes with those colors). Themes eligible in many
// identities — mechanic themes and one-color themes — have high reach; the walk
// down-weights them by 1/reach so selection spreads more evenly. Cached.
const reachCache = new WeakMap<PoolData, Map<string, number>>();
function themeReach(poolData: PoolData): Map<string, number> {
  const cached = reachCache.get(poolData);
  if (cached) return cached;
  const identityWeight = new Map<string, number>();
  for (const key of poolData.draftLists.keys()) {
    if (!key.includes("-")) continue;
    const p = colorPrefix(key);
    if (p === "") continue;
    const canon = canonicalColors(p);
    identityWeight.set(canon, (identityWeight.get(canon) ?? 0) + 1);
  }
  const reach = new Map<string, number>();
  for (const [idStr, weight] of identityWeight) {
    const themes = diverseCandidateThemes(poolData, new Set([...idStr]), null);
    for (const name of themes.keys()) {
      reach.set(name, (reach.get(name) ?? 0) + weight);
    }
  }
  reachCache.set(poolData, reach);
  return reach;
}

/**
 * The `diverse` variant. It keeps the color-identity skeleton but flattens the
 * distribution: it seeds the identity from a uniformly chosen archetype, walks
 * themes weighted toward those eligible in fewer identities (inverse reach),
 * includes each theme's cards with a probability inverse to how broadly the card
 * is tagged, and fills any shortfall by sampling legal cards uniformly. Core
 * cards still seed every pool.
 */
function generateDiverse(
  rng: () => number,
  poolData: PoolData,
  seedArchetypes?: readonly string[],
): {
  C: Set<string>;
  selected: string[];
  counts: Map<string, number>;
} {
  const { core, draftLists } = poolData;
  const breadth = themeBreadth(poolData);
  const reach = themeReach(poolData);

  // 1. choose a color identity by seeding from one archetype. A Dreamcaller
  // restricts the seed pool to its own archetypes; otherwise any color+archetype
  // list is an equally likely seed, so every archetype seeds pools at the same
  // base rate regardless of how many colors it needs.
  const eligibleSeeds = (seedArchetypes ?? []).filter(
    (a) => draftLists.has(a) && colorPrefix(a) !== "",
  );
  const seeded = eligibleSeeds.length > 0;
  const allowedDraft = seeded ? new Set(seedArchetypes) : null;
  const seedPool = seeded
    ? eligibleSeeds
    : [...draftLists.keys()].filter(
        (n) => n.includes("-") && colorPrefix(n) !== "",
      );
  const seed = weightedPick(
    rng,
    seedPool,
    seedPool.map(
      (a) => 1 / Math.max(1, reach.get(`D:${a}`) ?? 1) ** DIVERSE.seedExponent,
    ),
  );
  const C = new Set([...colorPrefix(seed)]);
  const seedThemeName = `D:${seed}`;

  // 2-3. legal cards and candidate themes for this identity.
  const onColorDraft = [...draftLists.keys()].filter((n) => {
    const p = colorPrefix(n);
    return p !== "" && [...p].every((c) => C.has(c));
  });
  const legal = new Set(core);
  for (const n of onColorDraft) {
    for (const c of draftLists.get(n) ?? []) legal.add(c);
  }
  const themes = diverseCandidateThemes(poolData, C, allowedDraft);

  // 4. walk: add themes (seed first), including each card with probability
  // inverse to its theme breadth. Subsequent themes are chosen by inverse reach
  // (the diverse walk), optionally falling back to the overlap walk.
  const counts = new Map<string, number>([...core].map((c) => [c, 1]));
  const selected: string[] = [];
  const includeProb = (card: string): number =>
    Math.min(1, DIVERSE.inclusionK / Math.max(1, breadth.get(card) ?? 1));
  const addTheme = (name: string): void => {
    selected.push(name);
    for (const c of themes.get(name) ?? []) {
      if (rng() < includeProb(c)) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
  };
  const themeNames = [...themes.keys()];
  addTheme(themes.has(seedThemeName) ? seedThemeName : themeNames[0]);

  while (poolSize(counts) < LO) {
    if (DIVERSE.themeBudget !== null && selected.length >= DIVERSE.themeBudget) {
      break;
    }
    const remaining = themeNames.filter((s) => !selected.includes(s));
    if (remaining.length === 0) break;
    let pick: string;
    if (rng() < DIVERSE.walkExploration) {
      pick = weightedPick(
        rng,
        remaining,
        remaining.map(
          (s) => 1 / Math.max(1, reach.get(s) ?? 1) ** DIVERSE.reachExponent,
        ),
      );
    } else {
      const union = new Set<string>();
      for (const s of selected) for (const c of themes.get(s) ?? []) union.add(c);
      const cands = remaining
        .map((s): [string, number] => [
          s,
          inter(themes.get(s) ?? new Set(), union),
        ])
        .filter(([, score]) => score > 0)
        .sort((x, y) => y[1] - x[1])
        .slice(0, TOPK);
      if (cands.length === 0) break;
      pick = weightedPick(
        rng,
        cands.map(([s]) => s),
        cands.map(([, score]) => score ** ALPHA),
      );
    }
    addTheme(pick);
  }

  // 5. fill to a random target size by sampling legal non-pool cards uniformly,
  // so diverse pools vary across the whole 180-220 band rather than pinning to
  // the floor.
  const target = randInt(rng, LO, HI);
  if (poolSize(counts) < target) {
    const cBreadth = colorBreadth(poolData);
    const candidates = [...legal].filter((c) => !counts.has(c));
    const fillers = weightedSample(
      rng,
      candidates,
      (c) => 1 / Math.max(1, cBreadth.get(c) ?? 1) ** DIVERSE.fillExponent,
      target - poolSize(counts),
    );
    for (const c of fillers) counts.set(c, 1);
  }

  // 5a. if the legal set was too small to reach the target with 1-ofs, promote
  // random 1-ofs to 2-ofs.
  if (poolSize(counts) < target) {
    const ones = shuffle(
      rng,
      [...counts.entries()].filter(([, v]) => v === 1).map(([c]) => c),
    );
    for (const c of ones) {
      if (poolSize(counts) >= target) break;
      counts.set(c, 2);
    }
  }

  // 6. if theme inclusion overshot the target, demote random 2-ofs back down.
  if (poolSize(counts) > target) {
    const twos = shuffle(
      rng,
      [...counts.entries()].filter(([, v]) => v >= 2).map(([c]) => c),
    );
    for (const c of twos) {
      if (poolSize(counts) <= target) break;
      counts.set(c, 1);
    }
  }

  return { C, selected, counts };
}

// --- the decklists variant ---------------------------------------------------
// IDF weighting and per-deck norms over the *filtered* real decklists, cached
// per PoolData. Filtering drops the near-empty and aggregate files so they
// neither anchor a pool nor dominate similarity. IDF (log of inverse document
// frequency) is what makes "similar" mean "shares distinctive cards" rather
// than "shares popular cards": a card in nearly every deck gets ~0 weight.
interface DeckVector {
  cards: Set<string>;
  norm: number;
}
interface DeckCorpus {
  decks: DeckVector[];
  idf: Map<string, number>;
}
const deckCorpusCache = new WeakMap<PoolData, DeckCorpus | null>();
function deckCorpus(poolData: PoolData): DeckCorpus | null {
  const cached = deckCorpusCache.get(poolData);
  if (cached !== undefined) return cached;
  let corpus: DeckCorpus | null = null;
  const source = poolData.decklists;
  if (source && source.length > 0) {
    const filtered = source
      .map((d) => new Set(d))
      .filter(
        (s) =>
          s.size >= DECKLISTS.minDeckSize && s.size <= DECKLISTS.maxDeckSize,
      );
    if (filtered.length > 0) {
      const n = filtered.length;
      const df = new Map<string, number>();
      for (const s of filtered) for (const c of s) df.set(c, (df.get(c) ?? 0) + 1);
      const idf = new Map<string, number>();
      for (const [c, d] of df) idf.set(c, Math.log((n + 1) / d));
      const decks = filtered.map((cards): DeckVector => {
        let sq = 0;
        for (const c of cards) {
          const w = idf.get(c) ?? 0;
          sq += w * w;
        }
        return { cards, norm: Math.sqrt(sq) || 1 };
      });
      corpus = { decks, idf };
    }
  }
  deckCorpusCache.set(poolData, corpus);
  return corpus;
}

// Build a pool by snowballing real decklists. Roll one of the Dreamcaller's
// strategies (biased toward its theme), take a real decklist rich in that
// strategy's and the theme's cards as the starter, then keep adding the
// decklists most similar to the starter and dense in the theme until the target
// size. `themeArchetypes` are the Dreamcaller's mechanic-archetype tide slugs
// (e.g. `abandon`); when empty the pool is unbiased. Falls back to the `default`
// algorithm when no usable decklists are bundled.
function generateDecklists(
  rng: () => number,
  poolData: PoolData,
  seedArchetypes?: readonly string[],
  themeArchetypes?: readonly string[],
): { C: Set<string>; selected: string[]; counts: Map<string, number> } {
  const corpus = deckCorpus(poolData);
  if (!corpus) return generate(rng, poolData, seedArchetypes);

  const { core, archLists, draftLists } = poolData;
  const { decks, idf } = corpus;
  const idfOf = (c: string): number => idf.get(c) ?? 0;

  // 0. The Dreamcaller's theme: the union of cards in its mechanic-archetype
  //    tide lists. `themeCosine` measures how dense a deck is in those cards
  //    (IDF-weighted, 0..1); it is 0 throughout when the Dreamcaller has no
  //    theme, so every theme term below collapses to 1 and the pool is unbiased.
  const themeCards = new Set<string>();
  for (const slug of themeArchetypes ?? []) {
    for (const c of archLists.get(slug) ?? []) themeCards.add(c);
  }
  let themeSq = 0;
  for (const c of themeCards) themeSq += idfOf(c) ** 2;
  const themeNorm = Math.sqrt(themeSq) || 1;
  const themeCosine = (deck: DeckVector): number => {
    if (themeCards.size === 0) return 0;
    let dot = 0;
    for (const c of deck.cards) if (themeCards.has(c)) dot += idfOf(c) ** 2;
    return dot / (themeNorm * deck.norm);
  };

  // 1. Roll one strategy off the Dreamcaller's list (the archetype role),
  //    weighted toward strategies that overlap the theme so an abandon
  //    Dreamcaller lands on aristocrats rather than off-theme green ramp. An
  //    open-pool Dreamcaller (no list) leaves it unset, so the starter is then
  //    any real decklist.
  const eligible = (seedArchetypes ?? []).filter(
    (a) => draftLists.has(a) && colorPrefix(a) !== "",
  );
  let strategyLabel = "open";
  let strategyPrefix = "";
  let strategyCards: Set<string> | null = null;
  if (eligible.length > 0) {
    const rolled = weightedPick(
      rng,
      eligible,
      eligible.map((a) => {
        let themeHits = 0;
        for (const c of draftLists.get(a) ?? []) if (themeCards.has(c)) themeHits++;
        return (1 + themeHits) ** DECKLISTS.themeStrategyExp;
      }),
    );
    strategyLabel = `D:${rolled}`;
    strategyPrefix = colorPrefix(rolled);
    strategyCards = draftLists.get(rolled) ?? null;
  }

  // 2. Pick the starter: the decklist that best fits the rolled strategy (most
  //    shared IDF weight with its cards), boosted toward decks dense in the
  //    theme, and sampled among the top fits so the same strategy yields a
  //    different starter run to run.
  const randomDeck = (): Set<string> =>
    decks[Math.floor(rng() * decks.length)].cards;
  let starter: Set<string>;
  if (strategyCards && strategyCards.size > 0) {
    const sc = strategyCards;
    const scored = decks
      .map((d): [Set<string>, number] => {
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
            scored.map(([cards]) => cards),
            scored.map(([, fit]) => fit ** DECKLISTS.starterAlpha),
          )
        : randomDeck();
  } else {
    starter = randomDeck();
  }

  // 3. Anchor similarity to the starter (not the drifting pool) so the whole
  //    pool stays orbiting one archetype, and boost candidates dense in the
  //    theme so the snowball keeps the Dreamcaller's strategy instead of
  //    drifting to whatever else co-occurs in the colors.
  let anchorSq = 0;
  for (const c of starter) anchorSq += idfOf(c) ** 2;
  const anchorNorm = Math.sqrt(anchorSq) || 1;
  const growScore = (deck: DeckVector): number => {
    let dot = 0;
    for (const c of deck.cards) if (starter.has(c)) dot += idfOf(c) ** 2;
    const sim = dot / (anchorNorm * deck.norm);
    return sim * (1 + DECKLISTS.themeGrowBoost * themeCosine(deck));
  };

  // 3b. The pool's spine: the archetypes growth is allowed to absorb, so the
  //     pool's card list stays one strategy instead of dragging in each
  //     neighbor deck's off-archetype half. It always includes the Dreamcaller's
  //     theme (so a themed pool can never gate its own theme out — important for
  //     splashy themes like outsiders that are rarely a deck's *dominant* tide),
  //     then fills with the starter's other dominant archetypes up to
  //     spineArchetypes.
  const spine = new Set<string>();
  for (const slug of themeArchetypes ?? []) if (archLists.has(slug)) spine.add(slug);
  const spineBudget = Math.max(DECKLISTS.spineArchetypes, spine.size);
  const spineHits = new Map<string, number>();
  for (const [slug, set] of archLists) {
    let n = 0;
    for (const c of starter) if (set.has(c)) n++;
    if (n > 0) spineHits.set(slug, n);
  }
  for (const [slug] of [...spineHits.entries()].sort((a, b) => b[1] - a[1])) {
    if (spine.size >= spineBudget) break;
    spine.add(slug);
  }
  const onSpine = (c: string): boolean => {
    if (spine.size === 0) return true;
    for (const slug of spine) if (archLists.get(slug)?.has(c)) return true;
    return false;
  };

  // 4. Seed the pool with core staples + the starter, then snowball the
  //    most-similar decklists until the jittered target, taking only each
  //    neighbor's on-spine cards. A card reaches 2 copies only when two
  //    different decks include it (cap at 2). Shuffling each deck's cards lets
  //    us stop exactly at the target.
  const target = randInt(
    rng,
    DECKLISTS.targetSize - DECKLISTS.targetJitter,
    DECKLISTS.targetSize + DECKLISTS.targetJitter,
  );
  const counts = new Map<string, number>([...core].map((c) => [c, 1]));
  const bump = (c: string): void => {
    counts.set(c, (counts.get(c) ?? 0) + 1);
  };
  for (const c of starter) bump(c);

  const used = new Set<Set<string>>([starter]);
  let stall = 0;
  while (poolSize(counts) < target && stall < 30) {
    const cands = decks
      .filter((d) => !used.has(d.cards))
      .map((d): [DeckVector, number] => [d, growScore(d)])
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
    const before = poolSize(counts);
    for (const c of shuffle(rng, [...pick.cards])) {
      if (poolSize(counts) >= target) break;
      if (onSpine(c)) bump(c);
    }
    stall = poolSize(counts) === before ? stall + 1 : 0;
  }

  // 5. Identity + labels for display. With a rolled strategy the identity is
  //    its color prefix (e.g. "ubg"), matching the theme-based variants. For an
  //    open pool, take the colors a meaningful share of the pool actually sits
  //    in, so the identity reflects the real decklists rather than every color
  //    a lone splash card touches.
  const C = new Set<string>();
  if (strategyPrefix !== "") {
    for (const letter of strategyPrefix) C.add(letter);
  } else {
    const unique = counts.size || 1;
    for (const letter of COLORS) {
      const list = draftLists.get(letter);
      if (!list) continue;
      let n = 0;
      for (const c of counts.keys()) if (list.has(c)) n++;
      if (n / unique >= 0.18) C.add(letter);
    }
  }
  let domArch: string | null = null;
  let domScore = 0;
  for (const [a, set] of archLists) {
    let s = 0;
    for (const c of counts.keys()) if (set.has(c)) s++;
    if (s > domScore) {
      domScore = s;
      domArch = a;
    }
  }
  const selected = [strategyLabel];
  if (domArch) selected.push(`A:${domArch}`);
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
  variant: PoolVariant = DEFAULT_POOL_VARIANT,
  themeArchetypes?: readonly string[],
): GeneratedPool {
  return generatePoolFromData(
    buildPoolData(cards),
    seed,
    seedArchetypes,
    variant,
    themeArchetypes,
  );
}

/**
 * Generate a pool from prebuilt {@link PoolData}. Pass `seedArchetypes` (a
 * Dreamcaller's `draftArchetypes`) to seed construction from one of those
 * archetypes; omit it for the unconstrained random pool. Pass `variant` to
 * select the generation algorithm (see {@link PoolVariant}). Pass
 * `themeArchetypes` (a Dreamcaller's mechanic-archetype tide slugs) to bias the
 * `decklists` variant toward that theme; the other variants ignore it.
 */
export function generatePoolFromData(
  poolData: PoolData,
  seed?: number,
  seedArchetypes?: readonly string[],
  variant: PoolVariant = DEFAULT_POOL_VARIANT,
  themeArchetypes?: readonly string[],
): GeneratedPool {
  const resolvedSeed =
    seed === undefined ? (Math.random() * 2 ** 32) >>> 0 : seed >>> 0;
  const rng = makeRng(resolvedSeed);
  const { C, selected, counts } =
    variant === "diverse"
      ? generateDiverse(rng, poolData, seedArchetypes)
      : variant === "decklists"
        ? generateDecklists(rng, poolData, seedArchetypes, themeArchetypes)
        : generate(rng, poolData, seedArchetypes);

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
    variant,
  };
}
