// The `tides3` variant: the human-legible counterpart of `sigseed`. Where
// `sigseed` grows each pool live from a random subset of an avatar's
// signature cards through the pick-affinity corpus, `tides3` bakes that growth
// offline into 32 preconstructed decks ("tides") and builds a pool by a process
// a player can be told in one sentence:
//
//   "There are 32 preconstructed decks called tides — each has a known decklist
//    you can go read. We combine a few of them at the start of a journey: your
//    DreamAvatar's own signature tide leads, shuffled together with broad tides
//    until there are enough cards, then we deal the first 150, never more than
//    2 copies of a card."
//
// The tides are baked by `scripts/bake-tides3.mjs` from the exact corpus and
// affinity grower `sigseed` uses (committed as `data/tides3.jsonc`, rendered for
// players as `docs/cards2/tides3_decklists.md`):
//   * a SIGNATURE tide is one signatured DreamAvatar's full-signature `sigseed`
//     pool baked as a deck — the deterministic centre of the pools `sigseed`
//     grows for that DreamAvatar from its signature;
//   * a NEUTRAL tide is a broad, format-spanning deck (the kind of pool `sigseed`
//     reduces to — plain `pickcohere` — for a signatureless DreamAvatar).
//
// So all of `sigseed`'s "magic" happens at bake time, where it is inspectable;
// at runtime the entire algorithm is the tide selection, one shuffle, and one
// deal below. A pool draws ONE lead tide and always joins it, then FILLS with
// shuffled broad tides until the deal size is dealable. The lead is a coherent
// signature tide, so the pool stays anchored on a single identity the way a
// `sigseed` pool does, while the shuffled fill and the deal of 150 from a larger
// bag give run-to-run variety. A signatured DreamAvatar has one lead candidate —
// its own signature tide — so it always leans the same way. A neutral DreamAvatar
// has many lead candidates (the signature tides, the format's coherent
// archetypes); one is drawn at random each run, so its pool is a coherent pool
// that leans toward a different archetype each time — exactly how `sigseed`
// reduces to a coherent, randomly-themed `pickcohere` pool for a signatureless
// DreamAvatar. The pool is keyed by cards_v2 UUID; the catalog index
// (`poolData.cardNameById`) gates which UUIDs are dealable.

import { asCardId, type CardId } from "../../types/card-identity.ts";
import { shuffle } from "./rng.ts";
import type { PoolStrategy } from "./strategy.ts";
import {
  missingPoolData,
  type PoolData,
  type VariantResult,
} from "./types.ts";
import type { Tides3DecksJson } from "./tides3-io.ts";

interface Tides3Tuning {
  // Copies dealt into the pool. Pinned to `sigseed`'s pool size (150) rather
  // than the journey's 200 so `tides3` reproduces the same pools `sigseed` ships;
  // the passed `targetSize` is ignored, exactly as `sigseed`/`pickfit` ignore it.
  dealSize: number;
  // Max copies of any single card dealt (the pool-wide 2-copy rule).
  cap: number;
  // Fewest fill tides to mix in, even when the lead tide alone could already
  // deal a full pool. A signature lead tide is baked LARGER than `dealSize` so
  // the deal takes a random subset of it (reproducing the run-to-run variety
  // `sigseed` gets from a random signature subset); this still mixes in a broad
  // tide for the generic tail, so every pool genuinely combines decks.
  minFillTides: number;
}
export const TIDES3: Tides3Tuning = {
  dealSize: 150,
  cap: 2,
  minFillTides: 1,
};

/**
 * Build a pool by combining tide decks: draw one of the avatar's lead tides
 * at random, shuffle its fill tides, join the lead and then fill tides until the
 * combined cards can deal a full pool, shuffle everything into one bag, and deal
 * `TIDES3.dealSize` copies with at most `TIDES3.cap` copies of any card. A
 * signatured DreamAvatar has a single lead candidate (its own signature tide), so
 * its lead is fixed; a neutral DreamAvatar has many (the signature tides), so its
 * pool leans toward a random coherent archetype each run. Tide-deck cards are
 * keyed by cards_v2 UUID and mapped to current display names through
 * `poolData.cardNameById`; UUIDs absent from that map (cards no longer in the
 * catalog) are skipped. Without a `dreamAvatarId` or a baked tide pool, every
 * tide is shuffled together (a robustness fallback; load-time validation requires
 * an entry per DreamAvatar).
 */
export function generateTides3(
  rng: () => number,
  poolData: PoolData,
  dreamAvatarId?: string,
): VariantResult {
  const data: Tides3DecksJson | undefined = poolData.tides3Decks;
  if (!data) {
    missingPoolData(
      "tides3",
      "no tide decks are bundled (data/tides3.jsonc, served as /tides3-data.json)",
    );
  }
  const dealSize = TIDES3.dealSize;

  // Tide selection. Draw one lead tide at random from the avatar's
  // candidates (a signatured DreamAvatar has exactly one; a neutral DreamAvatar
  // has many, so it leans toward a random coherent archetype each run), then
  // shuffle the fill tides. A missing entry falls back to a shuffled draw over
  // every tide so the variant still produces a pool.
  const entry = dreamAvatarId
    ? data.tidePoolByDreamAvatar[dreamAvatarId]
    : undefined;
  let lead: string | undefined;
  let fill: string[];
  // The minimum number of fill tides to mix in. A single-lead (signatured) pool
  // forces one broad tail tide, so its fixed lead still combines decks and the
  // deal of 150 from a larger bag gives run-to-run variety. A multi-lead
  // (neutral) pool draws a different coherent archetype each run, so its variety
  // is already covered by the lead draw; it forces no tail and stays a pure,
  // on-theme archetype rather than a lead diluted by an off-theme broad deck.
  let minFill: number;
  if (entry && entry.leads.length > 0) {
    lead = shuffle(rng, [...entry.leads])[0];
    fill = shuffle(rng, [...entry.fill]);
    minFill = entry.leads.length > 1 ? 0 : TIDES3.minFillTides;
  } else {
    lead = undefined;
    fill = shuffle(rng, data.tides.map((t) => t.id));
    minFill = TIDES3.minFillTides;
  }

  // The bag: every copy of every card in the joined tides, as current display
  // names — the lead first, then fill tides in their shuffled order until a full
  // pool is dealable. `dealable` counts the copies the deal below can actually
  // use (the bag total minus copies beyond the per-card cap), so the pool keeps
  // joining tides until it reaches full size. When no card index is available
  // (the synthetic pools some tests build), the artifact's informational names
  // are used directly.
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
        if (have < TIDES3.cap) dealable += 1;
      }
    }
  };
  if (lead !== undefined) joinTide(lead);
  let joinedFill = 0;
  for (const id of fill) {
    if (dealable >= dealSize && joinedFill >= minFill) break;
    joinTide(id);
    joinedFill += 1;
  }

  // One shuffle, one deal: take cards in bag order, skipping any already at the
  // copy cap, until the pool reaches the target size or the bag is empty.
  shuffle(rng, bag);
  const counts = new Map<CardId, number>();
  let size = 0;
  for (const cardId of bag) {
    if (size >= dealSize) break;
    const have = counts.get(cardId) ?? 0;
    if (have >= TIDES3.cap) continue;
    counts.set(cardId, have + 1);
    size += 1;
  }

  // No color identity (this variant reads nothing but the tide decks); the
  // labels record the algorithm and the tide ids the pool was dealt from.
  return { C: new Set(), selected: ["tides3", ...deckIds], counts };
}

/** Strategy adapter for the `tides3` algorithm. */
export const tides3Strategy: PoolStrategy = {
  id: "tides3",
  description:
    "Combine the 32 preconstructed tides into a pool: the avatar's own " +
    "signature tide leads, shuffled together with broad tides until a full pool " +
    "can be dealt. The human-legible counterpart of sigseed.",
  generate: ({ rng, poolData, dreamAvatarId }) =>
    generateTides3(rng, poolData, dreamAvatarId),
};
