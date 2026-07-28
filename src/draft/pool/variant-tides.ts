// The `tides` variant: the human-legible counterpart of `idf3`. Where `idf3`
// grows each pool from a corpus of hundreds of real decklists through IDF
// probes, anchors, and affinity-weighted draws, `tides` builds a pool by a
// process a player can be told in one sentence:
//
//   "There are 32 preconstructed decks called tides — each has a known
//    decklist you can go read. We shuffle together one of your DreamAvatar's
//    favored tides with tides drawn at random until there are enough cards,
//    then deal the first 200, never more than 2 copies of a card."
//
// The tide decks themselves are baked offline by `scripts/bake-tides.mjs`
// from the same decklist corpus `idf3` reads (committed as `data/tides.jsonc`,
// rendered for players as `docs/cards2/tide_decklists.md`), and each
// DreamAvatar's favored tides are baked there too, by the same signature
// IDF-cosine probe `idf3` finds its anchors with. So all of `idf3`'s "magic"
// happens at bake time, where it is inspectable; at runtime the entire
// algorithm is the tide selection, one shuffle, and one deal below.
//
// Joining tides until a full pool is dealable (rather than joining a fixed
// number) is what keeps the pool CONCENTRATED the way `idf3` pools are: a
// large favored tide plus one or two random tides fills the pool, so the
// favored identity occupies a large share of it, while a run that draws small
// tides simply pulls in more of them to reach full size.

import { asCardId, type CardId } from "../../types/card-identity.ts";
import { shuffle } from "./rng.ts";
import type { PoolStrategy } from "./strategy.ts";
import {
  missingPoolData,
  type PoolData,
  type VariantResult,
} from "./types.ts";
import type { TideDecksJson } from "./tides-io.ts";

interface TidesTuning {
  // How many tides come from the avatar's baked favored list; the rest
  // are drawn at random from the remaining tides. The favored list is wider
  // than this (see `favoredPerDreamAvatar` in scripts/bake-tides.mjs), so
  // which favored tide appears varies run to run.
  favoredDraw: number;
  // Copies dealt into the pool, matching the journey's pool size. Tides keep
  // joining the shuffle until this many copies are dealable, so the pool
  // reaches full size whether the drawn tides are large or small.
  dealSize: number;
  // Max copies of any single card dealt (the pool-wide 2-copy rule).
  cap: number;
}
export const TIDES: TidesTuning = {
  favoredDraw: 1,
  dealSize: 200,
  cap: 2,
};

/**
 * Build a pool by combining tide decks: draw `favoredDraw` of the
 * DreamAvatar's baked favored tides, keep adding random tides until the
 * combined cards can deal a full pool, shuffle everything (with the core
 * tide's cards, when the artifact carries one) into one bag, and deal
 * `targetSize` copies with at most `cap` copies of any card. Tide-deck cards
 * are keyed by cards_v2 UUID; the catalog index (`poolData.cardNameById`) gates
 * membership, so a UUID absent from it (a card dropped from the catalog) is
 * skipped. Without a `dreamAvatarId` or a baked favored entry,
 * every tide is drawn at random.
 */
export function generateTides(
  rng: () => number,
  poolData: PoolData,
  dreamAvatarId?: string,
  targetSize?: number,
): VariantResult {
  const data: TideDecksJson | undefined = poolData.tideDecks;
  if (!data) {
    missingPoolData(
      "tides",
      "no tide decks are bundled (data/tides.jsonc, served as /tides-data.json)",
    );
  }
  const dealSize = targetSize ?? TIDES.dealSize;

  // Tide selection. Both draws shuffle a copy of their candidate list (the
  // favored shuffle, then the random shuffle, then the bag shuffle below), so
  // the pool is deterministic per (seed, DreamAvatar).
  const favoredPool =
    dreamAvatarId === undefined
      ? []
      : (data.favoredTidesByDreamAvatar[dreamAvatarId] ?? []);
  const favored = shuffle(rng, [...favoredPool]).slice(0, TIDES.favoredDraw);
  const chosenSet = new Set(favored);
  const others = shuffle(
    rng,
    data.tides
      .map((t) => t.id)
      .filter((id) => id !== data.coreTideId && !chosenSet.has(id)),
  );

  // The bag: every copy of every card in the joined tides, as current display
  // names — the core tide first when the artifact carries one, then the
  // favored draw, then random tides in their shuffled order until a full pool
  // is dealable. `dealable` counts the copies the deal below can actually use
  // (the bag total minus copies beyond the per-card cap), so small tides keep
  // joining until the pool reaches full size. When no card index is available
  // (the synthetic pools some tests build), the artifact's informational
  // names are used directly.
  const tideById = new Map(data.tides.map((t) => [t.id, t]));
  const bag: CardId[] = [];
  const bagCounts = new Map<CardId, number>();
  let dealable = 0;
  const deckIds: string[] = [];
  const joinTide = (id: string): void => {
    const tide = tideById.get(id);
    if (!tide) return;
    deckIds.push(id);
    for (const card of tide.cards) {
      // Skip cards whose UUID is no longer in the catalog (the index, when
      // present, is the source of truth for catalog membership).
      if (poolData.cardNameById && !poolData.cardNameById.has(card.id)) continue;
      const cardId = asCardId(card.id);
      for (let i = 0; i < card.copies; i += 1) {
        const have = bagCounts.get(cardId) ?? 0;
        bagCounts.set(cardId, have + 1);
        bag.push(cardId);
        if (have < TIDES.cap) dealable += 1;
      }
    }
  };
  if (data.coreTideId !== undefined) joinTide(data.coreTideId);
  for (const id of favored) joinTide(id);
  for (const id of others) {
    if (dealable >= dealSize) break;
    joinTide(id);
  }

  // One shuffle, one deal: take cards in bag order, skipping any already at
  // the copy cap, until the pool reaches the target size or the bag is empty.
  shuffle(rng, bag);
  const counts = new Map<CardId, number>();
  let size = 0;
  for (const cardId of bag) {
    if (size >= dealSize) break;
    const have = counts.get(cardId) ?? 0;
    if (have >= TIDES.cap) continue;
    counts.set(cardId, have + 1);
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
    "Shuffle together an avatar-favored tide deck with random tide decks " +
    "until a full pool can be dealt from the 32 preconstructed tides.",
  generate: ({ rng, poolData, dreamAvatarId, targetSize }) =>
    generateTides(rng, poolData, dreamAvatarId, targetSize),
};
