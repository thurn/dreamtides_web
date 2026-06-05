// The `decklists` variant. It ignores the synthesized archetype themes the
// other variants walk and instead grows a pool out of real, human-shaped
// decklists (`docs/drafts_dt`, bundled to `decklists-data.json`): pick a
// Dreamcaller strategy, grab a real decklist rich in that strategy's cards as
// the "starter", then repeatedly add the decklists most *similar* to the starter
// until the pool reaches the target size. Similarity is cosine over IDF-weighted
// card vectors, so the distinctive cards two decks share count for much more than
// ubiquitous ones (e.g. the near-omnipresent Abandon cards).

import { COLORS } from "./constants.ts";
import { randInt, shuffle, weightedPick } from "./rng.ts";
import type { PoolStrategy } from "./strategy.ts";
import type { PoolData, VariantResult } from "./types.ts";
import { colorPrefix, poolSize } from "./util.ts";
import { generate } from "./variant-color-pool.ts";

// Knobs for the `decklists` variant. Grouped here so tuning is a one-stop edit.
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
        (s) => s.size >= DECKLISTS.minDeckSize && s.size <= DECKLISTS.maxDeckSize,
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
export function generateDecklists(
  rng: () => number,
  poolData: PoolData,
  seedArchetypes?: readonly string[],
  themeArchetypes?: readonly string[],
  targetSize?: number,
): VariantResult {
  const corpus = deckCorpus(poolData);
  if (!corpus) return generate(rng, poolData, seedArchetypes, targetSize);

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
  const center = targetSize ?? DECKLISTS.targetSize;
  const target = randInt(
    rng,
    center - DECKLISTS.targetJitter,
    center + DECKLISTS.targetJitter,
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

/** Strategy adapter for the `decklists` algorithm. */
export const decklistsStrategy: PoolStrategy = {
  id: "decklists",
  description:
    "Grows the pool from real human-built decklists by IDF-weighted cosine " +
    "similarity to a starter deck, biased toward the Dreamcaller's theme.",
  generate: ({ rng, poolData, seedArchetypes, themeArchetypes, targetSize }) =>
    generateDecklists(rng, poolData, seedArchetypes, themeArchetypes, targetSize),
};
