// The Dreamtides 97 collection and reward-bag shapes a run folds into its
// state (decision P5: plain JSON-safe data, every catalog reference a UUID).

import type { CardId } from "../../types/card-identity";
import type {
  AvatarId,
  D97OwnedCopyId,
  TideId,
} from "../../types/identifiers";

/** How an owned copy entered the collection. Later channels join this union. */
export type D97AcquisitionChannel = "starting" | "bag";

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

/** One card's reward-bag accounting. */
export interface D97BagEntry {
  readonly cardId: CardId;
  /** The dealt copy count: the most copies the bag ever supplies. */
  readonly target: number;
  /** Copies of the card acquired in the run through any channel. */
  readonly acquired: number;
}

/**
 * Reward bag v0 (decision P29): the tides4 pool the journey's draft would deal
 * the run's Avatar, stored as copy targets when the run starts.
 */
export interface D97RewardBag {
  readonly avatarId: AvatarId;
  /** The 32-bit seed the pool was dealt from, for diagnostics. */
  readonly dealSeed: number;
  /** The tides the deal joined, in join order. */
  readonly joinedTideIds: readonly TideId[];
  /** One entry per dealt card, sorted by card UUID. */
  readonly entries: readonly D97BagEntry[];
}
