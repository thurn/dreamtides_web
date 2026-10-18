// The pinned-pool catalog against the loaded content: every roster Avatar has
// exactly one pinned pool, which parsed, names a signature tide and three
// facet tides of the tide catalog, deals only catalog cards, and becomes a
// reward-bag pool with a non-empty ring 1.

import { describe, expect, it } from "vitest";
import { loadJourneyContent } from "../../../data/journey-content";
import { createD97ContentProvider } from "../../../session/providers/d97-content-provider";
import { D97_PINNED_POOLS } from ".";

describe("the D97 pinned pools", () => {
  const content = loadJourneyContent();
  const tides = new Map((content.poolContext.poolData.tides4Decks?.tides ?? []).map((tide) => [tide.id, tide]));
  const cardIds = new Set([...content.cardDatabase.values()].map((card) => card.id));
  const provider = createD97ContentProvider(content, null);

  it("pin one pool per roster Avatar", () => {
    expect(D97_PINNED_POOLS.map((pool) => pool.avatarId).sort()).toEqual(content.avatars.map((avatar) => avatar.id).sort());
  });

  it.each(D97_PINNED_POOLS.map((pool) => [pool.avatarId, pool] as const))("%s references known tides and cards", (_, pool) => {
    expect(tides.get(pool.signatureTideId)?.role).toBe("signature");
    expect(pool.facetTideIds).toHaveLength(3);
    for (const facet of pool.facetTideIds) expect(tides.get(facet)?.role).toBe("facet");
    expect(pool.dealt.length).toBeGreaterThan(0);
    for (const { cardId } of pool.dealt) expect(cardIds.has(cardId)).toBe(true);
    expect(provider.rewardPool(pool.avatarId)?.ring1.length).toBeGreaterThan(0);
  });
});
