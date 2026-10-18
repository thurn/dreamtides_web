// The shape of a pinned Dreamtides 97 pool (decision P29, Appendix A §A2):
// one Avatar's curated tides4 output, chosen offline by
// `scripts/d97/curate-pools.ts` and committed as content. A pinned pool names
// the Avatar's tide set (its signature tide, its own or a fixed borrowed one,
// and three facet tides) and the pool the tides4 deal dealt over that tide
// set, with the copy counts as dealt (eligible cards only, Appendix A §A1).
// The reward bag's rings are the tide set's eligible cards; the dealt pool is
// the Avatar's battle draft pool.

import type { Uuid } from "../../define";
import { parseCardId, type CardId } from "../../../types/card-identity";
import { parseAvatarId, parseTideId, type AvatarId, type TideId } from "../../../types/identifiers";

/** One dealt card and its copy count. */
export interface D97PinnedCard {
  readonly cardId: CardId;
  readonly copies: number;
}

/** One Avatar's pinned pool. */
export interface D97PinnedPool {
  readonly avatarId: AvatarId;
  /** The signature tide: the Avatar's own, or the one it borrows. */
  readonly signatureTideId: TideId;
  /** Whether the signature tide is borrowed from another Avatar. */
  readonly borrowedSignature: boolean;
  /** The three facet tides, in curation order. */
  readonly facetTideIds: readonly [TideId, TideId, TideId];
  /** The 32-bit seed the pinned tides4 deal was dealt from. */
  readonly dealSeed: number;
  /** The dealt pool, one entry per card in card-UUID order. */
  readonly dealt: readonly D97PinnedCard[];
}

/** A pinned pool as its module writes it: raw UUIDs, dealt cards as `[cardId, copies]`. */
export interface D97PinnedPoolSource {
  readonly avatarId: Uuid;
  readonly signatureTideId: Uuid;
  readonly borrowedSignature: boolean;
  readonly facetTideIds: readonly [Uuid, Uuid, Uuid];
  readonly dealSeed: number;
  readonly dealt: readonly (readonly [Uuid, number])[];
}

/** Parse a pinned pool module's source; throws on a malformed UUID or copy count. */
export function pinnedPool(source: D97PinnedPoolSource): D97PinnedPool {
  const [first, second, third] = source.facetTideIds;
  return {
    avatarId: parseAvatarId(source.avatarId),
    signatureTideId: parseTideId(source.signatureTideId),
    borrowedSignature: source.borrowedSignature,
    facetTideIds: [parseTideId(first), parseTideId(second), parseTideId(third)],
    dealSeed: source.dealSeed,
    dealt: source.dealt.map(([cardId, copies]) => {
      if (!Number.isInteger(copies) || copies <= 0) throw new Error(`Pinned pool ${source.avatarId} deals ${String(copies)} copies of ${cardId}`);
      return { cardId: parseCardId(cardId), copies };
    }),
  };
}
