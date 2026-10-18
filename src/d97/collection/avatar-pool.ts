// An Avatar's reward-bag pool from its pinned pool (Appendix A §A2, decision
// P29): the tide set's rings over eligible cards, and the pinned dealt pool.
// Pure: the tide catalog and the eligibility test arrive as arguments.

import type { D97PinnedPool } from "../../content/d97/pools/schema";
import type { CardId } from "../../types/card-identity";
import type { TideId } from "../../types/identifiers";
import type { D97AvatarPool } from "./types";

function codeUnits(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * The bag pool `pinned` names: ring 1 is the signature tide's eligible cards,
 * ring 2 the facets' eligible cards outside ring 1, both in card-UUID order;
 * the dealt pool keeps the pinned copies of every card the catalog still
 * knows. Null when the tide catalog lacks one of the tide set's tides.
 */
export function avatarPoolOf(
  pinned: D97PinnedPool,
  tideCardIds: (tideId: TideId) => readonly CardId[] | null,
  eligible: (cardId: CardId) => boolean,
  known: (cardId: CardId) => boolean,
): D97AvatarPool | null {
  const signature = tideCardIds(pinned.signatureTideId);
  const facets = pinned.facetTideIds.map(tideCardIds);
  if (signature === null || facets.some((cards) => cards === null)) return null;
  const ring1 = new Set(signature.filter(eligible));
  const ring2 = new Set(facets.flatMap((cards) => (cards ?? []).filter((cardId) => eligible(cardId) && !ring1.has(cardId))));
  return {
    avatarId: pinned.avatarId,
    tideIds: [pinned.signatureTideId, ...pinned.facetTideIds],
    ring1: [...ring1].sort(codeUnits),
    ring2: [...ring2].sort(codeUnits),
    dealt: pinned.dealt.filter((entry) => known(entry.cardId)),
  };
}
