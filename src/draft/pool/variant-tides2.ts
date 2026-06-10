// The `tides2` variant: an affinity-selected counterpart to `tides`. Both build
// a draft pool from preconstructed "tide decks" a player can read, but they
// differ in how tides are chosen, so the two can be compared side by side:
//
//   tides  — shuffle one of the Dreamcaller's favored tides with tides drawn at
//            random until the pool is full.
//   tides2 — draw a lead tide from the Dreamcaller's curated tide pool, then
//            shuffle in the lead's allied tides (decks chosen to combine well
//            with it) until the pool is full.
//
// One sentence a player can be told:
//
//   "There are preconstructed decks called tides — each has a known decklist you
//    can go read. Each tide lists its allied tides (decks that work well
//    together), and each Dreamcaller has a tide pool it draws from. We draw a
//    lead tide from your Dreamcaller's pool, shuffle it together with its allies
//    until there are enough cards, and deal the first 200, never more than 2
//    copies of a card."
//
// `tides2`'s decks are baked by `npm run bake-tides2` (smaller, purer tides than
// `tides`, committed as `data/tides2.jsonc`, rendered as
// `docs/cards2/tides2_decklists.md`). The relationships that steer selection —
// each tide's allied tides, and each Dreamcaller's tide pool — are curated data
// committed in `data/tides2_relationships.jsonc` (seeded once by
// `scripts/seed-tide-relationships.mjs`, then hand-owned). So all of the
// algorithm's "magic" lives in inspectable committed data; at runtime the entire
// algorithm is the tide selection, one shuffle, and one deal below.
//
// Every tide that joins a pool is justified by a published relationship — the
// Dreamcaller's tide pool (for the lead) or the lead's allies list (for the
// fill) — never a uniform-random draw over all tides. Joining allies until a
// full pool is dealable (rather than a fixed number) keeps the pool
// concentrated: a lead tide plus one or two of its allies fills the pool, so the
// lead's identity occupies a large share of it, reinforced (not diluted) by
// allies chosen to combine well with it.

import { shuffle } from "./rng.ts";
import type { PoolStrategy } from "./strategy.ts";
import {
  missingPoolData,
  type PoolData,
  type VariantResult,
} from "./types.ts";
import type { TideDecksJson } from "./tides-io.ts";
import type { TideRelationshipsJson } from "./tide-relationships-io.ts";

interface Tides2Tuning {
  // How many of the lead's allies are shuffled into the join order. The fill
  // walks this shuffled prefix (then the remaining allies in baked order, then
  // breadth-first through allies' allies) until the pool is full, so a pool
  // typically uses the lead plus the first one or two shuffled allies — the
  // shuffle is what gives a Dreamcaller pool-to-pool variety for a fixed lead.
  allyShuffleWindow: number;
  // Copies dealt into the pool, matching the quest's pool size. Tides keep
  // joining the shuffle until this many copies are dealable, so the pool reaches
  // full size whether the joined tides are large or small.
  dealSize: number;
  // Max copies of any single card dealt (the pool-wide 2-copy rule).
  cap: number;
}
export const TIDES2: Tides2Tuning = {
  allyShuffleWindow: 6,
  dealSize: 200,
  cap: 2,
};

/**
 * Build a pool by combining tide decks: draw a lead tide from the Dreamcaller's
 * curated tide pool, join the lead's allied tides (a lightly shuffled prefix
 * first, then the rest of its allies, then breadth-first through allies' allies)
 * until the combined cards can deal a full pool, shuffle everything (with the
 * core tide's cards, when the artifact carries one) into one bag, and deal
 * `targetSize` copies with at most `cap` copies of any card. Tide-deck cards are
 * keyed by cards_v2 UUID and mapped to current display names through
 * `poolData.cardNameById`; UUIDs absent from that map (cards no longer in the
 * catalog) are skipped.
 *
 * Every joining tide is justified by a published relationship in
 * `poolData.tides2Relationships`. A Dreamcaller without a tide-pool entry (stale
 * data) falls back to a shuffled draw over all tides for its lead; load-time
 * validation flags such gaps, so this should never fire in production.
 */
export function generateTides2(
  rng: () => number,
  poolData: PoolData,
  dreamcallerId?: string,
  targetSize?: number,
): VariantResult {
  const data: TideDecksJson | undefined = poolData.tides2Decks;
  if (!data) {
    missingPoolData(
      "tides2",
      "no tide decks are bundled (data/tides2.jsonc, served as /tides2-data.json)",
    );
  }
  const relationships: TideRelationshipsJson | undefined =
    poolData.tides2Relationships;
  if (!relationships) {
    missingPoolData(
      "tides2",
      "no tide relationships are bundled (data/tides2_relationships.jsonc, served " +
        "as /tides2-relationships-data.json); run `npm run seed-tide-relationships`",
    );
  }
  const dealSize = targetSize ?? TIDES2.dealSize;
  const allTideIds = data.tides.map((t) => t.id);

  // Lead selection: shuffle a copy of the Dreamcaller's tide pool and take the
  // first id. A missing entry (no Dreamcaller, stale data) falls back to a
  // shuffled draw over every tide so the variant still produces a pool.
  const leadPool =
    dreamcallerId === undefined
      ? undefined
      : relationships.tidePoolByDreamcaller[dreamcallerId];
  const leadCandidates =
    leadPool && leadPool.length > 0 ? leadPool : allTideIds;
  const lead = shuffle(rng, [...leadCandidates])[0];

  // Fill order: the lead's allies, with the front `allyShuffleWindow` shuffled
  // for run-to-run variety, then the remaining allies in baked order, then a
  // breadth-first walk through allies' allies. Every id is a published
  // relationship; the order is deduplicated as it is built so each tide joins at
  // most once.
  const alliesOf = (id: string): string[] => relationships.alliesByTide[id] ?? [];
  const fillOrder: string[] = [];
  const queued = new Set<string>([lead]);
  const enqueue = (id: string): void => {
    if (queued.has(id)) return;
    queued.add(id);
    fillOrder.push(id);
  };
  const leadAllies = alliesOf(lead);
  const window = leadAllies.slice(0, TIDES2.allyShuffleWindow);
  const rest = leadAllies.slice(TIDES2.allyShuffleWindow);
  for (const id of shuffle(rng, [...window])) enqueue(id);
  for (const id of rest) enqueue(id);
  // Breadth-first through allies' allies, so a lead whose direct allies cannot
  // fill the pool still grows along published relationships rather than a
  // uniform-random draw.
  for (let i = 0; i < fillOrder.length; i += 1) {
    for (const id of alliesOf(fillOrder[i])) enqueue(id);
  }

  // The bag: every copy of every card in the joined tides, as current display
  // names — the core tide first when the artifact carries one, then the lead,
  // then its allies in fill order until a full pool is dealable. `dealable`
  // counts the copies the deal below can actually use (the bag total minus
  // copies beyond the per-card cap), so small tides keep joining until the pool
  // reaches full size. When no card index is available (the synthetic pools some
  // tests build), the artifact's informational names are used directly.
  const tideById = new Map(data.tides.map((t) => [t.id, t]));
  const bag: string[] = [];
  const bagCounts = new Map<string, number>();
  let dealable = 0;
  const deckIds: string[] = [];
  const joinTide = (id: string): void => {
    const tide = tideById.get(id);
    if (!tide) return;
    deckIds.push(id);
    for (const card of tide.cards) {
      const name = poolData.cardNameById
        ? poolData.cardNameById.get(card.id)
        : card.name;
      if (name === undefined) continue;
      for (let i = 0; i < card.copies; i += 1) {
        const have = bagCounts.get(name) ?? 0;
        bagCounts.set(name, have + 1);
        bag.push(name);
        if (have < TIDES2.cap) dealable += 1;
      }
    }
  };
  if (data.coreTideId !== undefined) joinTide(data.coreTideId);
  joinTide(lead);
  for (const id of fillOrder) {
    if (dealable >= dealSize) break;
    joinTide(id);
  }

  // One shuffle, one deal: take cards in bag order, skipping any already at the
  // copy cap, until the pool reaches the target size or the bag is empty.
  shuffle(rng, bag);
  const counts = new Map<string, number>();
  let size = 0;
  for (const name of bag) {
    if (size >= dealSize) break;
    const have = counts.get(name) ?? 0;
    if (have >= TIDES2.cap) continue;
    counts.set(name, have + 1);
    size += 1;
  }

  // No color identity (this variant reads nothing but the tide decks); the
  // labels record the algorithm and the tide ids the pool was dealt from.
  return { C: new Set(), selected: ["tides2", ...deckIds], counts };
}

/** Strategy adapter for the `tides2` algorithm. */
export const tides2Strategy: PoolStrategy = {
  id: "tides2",
  description:
    "Draw a lead tide from the Dreamcaller's tide pool and shuffle in its " +
    "allied tides until a full pool can be dealt from the preconstructed tides.",
  generate: ({ rng, poolData, dreamcallerId, targetSize }) =>
    generateTides2(rng, poolData, dreamcallerId, targetSize),
};
