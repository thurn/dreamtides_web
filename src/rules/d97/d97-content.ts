// The content seam D97 reducer cases read. The app registers it from the
// loaded catalogs before any event folds (src/session/providers/), so the
// cases stay pure and every fold of a log on one build sees the same content.

import type { D97DealtCard } from "../../d97/collection/reward-bag";
import type { D97StartingCollectionContent } from "../../d97/collection/starting-collection";
import type { D97TierKnob } from "../../content/d97/encounters";
import type { BattleInit as EngineBattleInit } from "../../engine";
import type { CardId } from "../../types/card-identity";
import type { AvatarId, BattleId, DreamsignId, TideId } from "../../types/identifiers";
import type { D97BattleInit } from "../battle/fold";
import type { D97Encounter, D97Run } from "./d97-state";

/** One Avatar's dealt tides4 pool. */
export interface D97PoolDeal {
  /** The tides the deal joined, in join order. */
  readonly joinedTideIds: readonly TideId[];
  /** Dealt copies per card (Starter cards excluded, per-card caps applied). */
  readonly cards: readonly D97DealtCard[];
}

/** An opponent's constructed deck (Appendix B §B9). */
export interface D97OpponentBuild {
  readonly deck: readonly CardId[];
  readonly draftPool: readonly CardId[];
  readonly dreamsignIds: readonly DreamsignId[];
  readonly signatureCardIds: readonly CardId[];
}

/** What starting an encounter's battle needs beyond loaded content. */
export interface D97BattleStartInput {
  readonly run: D97Run;
  readonly encounter: D97Encounter;
  readonly battleId: BattleId;
  /** The battle's engine seed. */
  readonly seed: number;
  readonly playerAnteCopyId: D97BattleInit["playerAnteCopyId"];
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
  /**
   * Build `avatarId`'s opponent deck at a tier knob from a 32-bit seed.
   * Deterministic in its arguments; null when the Avatar has no pool.
   */
  readonly buildOpponentDeck: (input: {
    readonly avatarId: AvatarId;
    readonly seed: number;
    readonly knob: D97TierKnob;
    readonly deckSize: number;
    readonly signatureCount: number;
  }) => D97OpponentBuild | null;
  /**
   * The display init and engine init of an encounter's battle.
   * Deterministic in its input; null when content is missing.
   */
  readonly startBattle: (input: D97BattleStartInput) => {
    readonly init: D97BattleInit;
    readonly engineInit: EngineBattleInit;
  } | null;
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
