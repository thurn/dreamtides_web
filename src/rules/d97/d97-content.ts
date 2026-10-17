// The content seam D97 reducer cases read. The app registers it from the
// loaded catalogs before any event folds (src/session/providers/), so the
// cases stay pure and every fold of a log on one build sees the same content.

import type { D97DealtCard } from "../../d97/collection/reward-bag";
import type { D97StartingCollectionContent } from "../../d97/collection/starting-collection";
import type { AvatarId, TideId } from "../../types/identifiers";

/** One Avatar's dealt tides4 pool. */
export interface D97PoolDeal {
  /** The tides the deal joined, in join order. */
  readonly joinedTideIds: readonly TideId[];
  /** Dealt copies per card (Starter cards excluded, per-card caps applied). */
  readonly cards: readonly D97DealtCard[];
}

/** Fold-relevant D97 content. */
export interface D97ContentProvider extends D97StartingCollectionContent {
  /** Every Avatar a run may start with (the full roster). */
  readonly avatarIds: ReadonlySet<AvatarId>;
  /**
   * Deal `avatarId`'s tides4 pool exactly as the journey's draft would, from
   * a 32-bit seed. Deterministic in its arguments.
   */
  readonly dealRewardPool: (avatarId: AvatarId, seed: number) => D97PoolDeal;
}

let provider: D97ContentProvider | null = null;

/** Register the D97 content before any game event is folded. */
export function registerD97ContentProvider(
  next: D97ContentProvider | null,
): void {
  provider = next;
}

/** The registered D97 content, or null before registration. */
export function d97ContentProvider(): D97ContentProvider | null {
  return provider;
}
