// The `tides` variant: the human-legible counterpart of `idf3`. Where `idf3`
// grows each pool from a corpus of hundreds of real decklists through IDF
// probes, anchors, and affinity-weighted draws, `tides` builds a pool by a
// process a player can be told in one sentence:
//
//   "There are 32 preconstructed decks called tides — each has a known
//    decklist you can go read. We shuffle together five of them (two of your
//    Dreamcaller's favored tides and three drawn at random) and deal the
//    first 200 cards, never more than 2 copies of a card."
//
// The tide decks themselves are baked offline by `scripts/bake-tides.mjs`
// from the same decklist corpus `idf3` reads (committed as `data/tides.jsonc`,
// rendered for players as `docs/cards2/tide_decklists.md`), and each
// Dreamcaller's favored tides are baked there too, by the same signature
// IDF-cosine probe `idf3` finds its anchors with. So all of `idf3`'s "magic"
// happens at bake time, where it is inspectable; at runtime the entire
// algorithm is the tide selection, one shuffle, and one deal below.

import { shuffle } from "./rng.ts";
import type { PoolStrategy } from "./strategy.ts";
import {
  missingPoolData,
  type PoolData,
  type VariantResult,
} from "./types.ts";
import type { TideDecksJson } from "./tides-io.ts";

interface TidesTuning {
  // Tide decks combined per pool (the core tide, when the artifact carries
  // one, is additional and goes into every pool).
  tideCount: number;
  // How many of those come from the Dreamcaller's baked favored list; the
  // rest are drawn at random from the remaining tides. The favored list is
  // wider than this (see `favoredPerDreamcaller` in scripts/bake-tides.mjs),
  // so which favored tides appear varies run to run.
  favoredDraw: number;
  // Copies dealt into the pool, matching the quest's pool size.
  dealSize: number;
  // Max copies of any single card dealt (the pool-wide 2-copy rule).
  cap: number;
}
export const TIDES: TidesTuning = {
  tideCount: 5,
  favoredDraw: 2,
  dealSize: 200,
  cap: 2,
};

/**
 * Build a pool by combining tide decks: draw `favoredDraw` of the
 * Dreamcaller's baked favored tides plus random tides up to `tideCount`,
 * shuffle their cards (and the core tide's, when the artifact carries one)
 * into one bag, and deal `targetSize` copies with at most `cap` copies of any
 * card. Tide-deck cards are keyed by cards_v2 UUID and mapped to current
 * display names through `poolData.cardNameById`; UUIDs absent from that map
 * (cards no longer in the catalog) are skipped. Without a `dreamcallerId` or a
 * baked favored entry, all `tideCount` tides are drawn at random.
 */
export function generateTides(
  rng: () => number,
  poolData: PoolData,
  dreamcallerId?: string,
  targetSize?: number,
): VariantResult {
  const data: TideDecksJson | undefined = poolData.tideDecks;
  if (!data) {
    missingPoolData(
      "tides",
      "no tide decks are bundled (data/tides.jsonc, served as /tides-data.json)",
    );
  }

  // Tide selection. Both draws shuffle a copy of their candidate list, so the
  // rng call order (favored shuffle, then random shuffle, then the bag
  // shuffle) is fixed per seed regardless of which Dreamcaller is in play.
  const favoredPool =
    dreamcallerId === undefined
      ? []
      : (data.favoredTidesByDreamcaller[dreamcallerId] ?? []);
  const favored = shuffle(rng, [...favoredPool]).slice(0, TIDES.favoredDraw);
  const chosenSet = new Set(favored);
  const others = data.tides
    .map((t) => t.id)
    .filter((id) => id !== data.coreTideId && !chosenSet.has(id));
  const random = shuffle(rng, others).slice(
    0,
    Math.max(0, TIDES.tideCount - favored.length),
  );
  const chosen = [...favored, ...random];

  // The bag: every copy of every card in the chosen tides (plus the core
  // tide), as current display names. When no card index is available (the
  // synthetic pools some tests build), the artifact's informational names are
  // used directly.
  const tideById = new Map(data.tides.map((t) => [t.id, t]));
  const deckIds =
    data.coreTideId === undefined ? chosen : [data.coreTideId, ...chosen];
  const bag: string[] = [];
  for (const id of deckIds) {
    const tide = tideById.get(id);
    if (!tide) continue;
    for (const card of tide.cards) {
      const name = poolData.cardNameById
        ? poolData.cardNameById.get(card.id)
        : card.name;
      if (name === undefined) continue;
      for (let i = 0; i < card.copies; i += 1) bag.push(name);
    }
  }

  // One shuffle, one deal: take cards in bag order, skipping any already at
  // the copy cap, until the pool reaches the target size or the bag is empty.
  shuffle(rng, bag);
  const dealSize = targetSize ?? TIDES.dealSize;
  const counts = new Map<string, number>();
  let size = 0;
  for (const name of bag) {
    if (size >= dealSize) break;
    const have = counts.get(name) ?? 0;
    if (have >= TIDES.cap) continue;
    counts.set(name, have + 1);
    size += 1;
  }

  // No color identity (this variant reads nothing but the tide decks); the
  // labels record the algorithm and the tide ids the pool was dealt from.
  return { C: new Set(), selected: ["tides", ...deckIds], counts };
}

/** Strategy adapter for the `tides` algorithm. */
export const tidesStrategy: PoolStrategy = {
  id: "tides",
  description:
    "Shuffle together a few of the 32 preconstructed tide decks (favoring the " +
    "Dreamcaller's baked favored tides) and deal the pool.",
  generate: ({ rng, poolData, dreamcallerId, targetSize }) =>
    generateTides(rng, poolData, dreamcallerId, targetSize),
};
