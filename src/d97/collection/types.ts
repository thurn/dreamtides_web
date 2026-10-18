// The Dreamtides 97 collection and reward-bag shapes a run folds into its
// state (decision P5: plain JSON-safe data, every catalog reference a UUID).

import type { CardId } from "../../types/card-identity";
import type {
  AvatarId,
  D97OwnedCopyId,
  TideId,
} from "../../types/identifiers";

/**
 * How an owned copy entered the collection: the starting package, a bag
 * draw, a won ante, a victory bundle's bag draw, or a shop purchase. Later
 * channels join this union.
 */
export type D97AcquisitionChannel = "starting" | "bag" | "ante" | "bundle" | "shop";

/** Where an owned copy and its acquisition came from. */
export interface D97CopyProvenance {
  readonly channel: D97AcquisitionChannel;
  /** Battles the run had fought when the copy was acquired. */
  readonly battleCount: number;
  /** The Essence paid, for a bought copy only. */
  readonly price?: number;
}

/**
 * A per-copy change: transfiguration, spark bonus, or a keyword or type
 * change. No system applies one yet, so the union has no members; each
 * system adds its own kind.
 */
export type D97CopyModification = never;

/** Which half of the collection a copy sits in. */
export type D97CopyZone = "deck" | "reserve";

/** One owned copy of a catalog card. */
export interface D97OwnedCopy {
  readonly copyId: D97OwnedCopyId;
  readonly cardId: CardId;
  readonly zone: D97CopyZone;
  readonly modifications: readonly D97CopyModification[];
  readonly provenance: D97CopyProvenance;
}

/** Every copy the run owns: the active deck plus the reserve. */
export interface D97Collection {
  /** Owned copies in acquisition order. */
  readonly copies: readonly D97OwnedCopy[];
  /** The ordinal the next acquired copy's id derives from. */
  readonly nextCopyOrdinal: number;
}

/**
 * One Avatar's pinned pool as the reward bag reads it (Appendix A §A2,
 * decision P29): its tide set, the tide set's rings over eligible cards, and
 * the pool its pinned tides4 deal dealt. Content, never state.
 */
export interface D97AvatarPool {
  readonly avatarId: AvatarId;
  /** The tide set: the signature tide, then its three facets. */
  readonly tideIds: readonly TideId[];
  /** Ring 1: the signature tide's eligible cards, in card-UUID order. */
  readonly ring1: readonly CardId[];
  /** Ring 2: the facets' eligible cards outside ring 1, in card-UUID order. */
  readonly ring2: readonly CardId[];
  /** The pinned dealt pool: the Avatar's battle draft pool. */
  readonly dealt: readonly { readonly cardId: CardId; readonly copies: number }[];
}

/**
 * Every Avatar's reward bag (Appendix A §A2), as a run stores it: the
 * campaign's capacity stage and, per Avatar, the copies of each card acquired
 * from that Avatar's bag. Every Avatar's bag exists from run start; one with
 * no draws has no entry. The rings and capacities are content.
 */
export interface D97RewardBags {
  /** The highest capacity stage opened so far. */
  readonly stage: number;
  /** `drawn(c)` per Avatar: copies acquired from that Avatar's bag, by card UUID. */
  readonly drawn: Readonly<Partial<Record<AvatarId, Readonly<Partial<Record<CardId, number>>>>>>;
}

/** One card of a bag view: its ring, its capacity at the current stage, and its draws. */
export interface D97BagEntry {
  readonly cardId: CardId;
  readonly ring: 1 | 2;
  readonly capacity: number;
  readonly drawn: number;
}

/**
 * One Avatar's reward bag at the run's current stage, derived from its
 * pinned pool and the run's bag state: one entry per tide-set eligible card,
 * in card-UUID order, with `w(c) = capacity(c) − drawn(c)`.
 */
export interface D97RewardBag {
  readonly avatarId: AvatarId;
  readonly stage: number;
  readonly entries: readonly D97BagEntry[];
}
