// The one way a Dreamtides 97 run gains a card (decision P29). Every
// acquisition, through any channel, adds an owned copy to the collection and
// counts one copy against the reward bag, so `w(c) = target(c) − acquired(c)`
// holds by construction. When the bag held the card, the acquisition logs a
// `d97_bag_draw` record carrying UUIDs and counts only.

import type { ReducerLogRecord } from "../../eventlog/types";
import type { CardId } from "../../types/card-identity";
import type { D97RunId, D97RunSeed } from "../../types/identifiers";
import { ownedCopyId } from "./collection";
import { bagSize, bagWeight } from "./reward-bag";
import type {
  D97AcquisitionChannel,
  D97Collection,
  D97CopyProvenance,
  D97CopyZone,
  D97OwnedCopy,
  D97RewardBag,
} from "./types";

/** The run fields an acquisition reads and writes. */
export interface D97AcquiringRun {
  readonly runId: D97RunId;
  readonly runSeed: D97RunSeed;
  /** Battles fought so far; the new copy's provenance records it. */
  readonly battlesFought: number;
  readonly collection: D97Collection;
  readonly bag: D97RewardBag;
}

/**
 * Where the acquired card came from. `draw`: the card was picked from the
 * bag, which must still hold a copy of it. `named`: the game named the card
 * (a starter, an ante, a quest reward, a shop slot); the run gains it whether
 * or not the bag holds it.
 */
export type D97AcquisitionSource = "draw" | "named";

/** The channel and its price: a shop purchase records the Essence paid. */
type D97AcquisitionPurchase =
  | { readonly channel: "shop"; readonly price: number }
  | {
      readonly channel: Exclude<D97AcquisitionChannel, "shop">;
      readonly price?: never;
    };

/** One acquisition's request. */
export type D97AcquisitionRequest<S extends D97AcquisitionSource> =
  D97AcquisitionPurchase & {
    readonly cardId: CardId;
    readonly zone: D97CopyZone;
    readonly source: S;
  };

/** An acquisition's result: the updated run, the new copy, its log records. */
export interface D97Acquisition<R extends D97AcquiringRun> {
  readonly run: R;
  readonly copy: D97OwnedCopy;
  readonly logRecords: readonly ReducerLogRecord[];
}

/**
 * Add one newly acquired copy of `cardId` in `zone`, its id derived from the
 * run seed and the collection's acquisition ordinal so every fold of the log
 * mints the same id.
 */
function acquireCopy(
  collection: D97Collection,
  args: {
    runSeed: D97RunSeed;
    cardId: CardId;
    provenance: D97CopyProvenance;
    zone: D97CopyZone;
  },
): { collection: D97Collection; copy: D97OwnedCopy } {
  const copy: D97OwnedCopy = {
    copyId: ownedCopyId(args.runSeed, collection.nextCopyOrdinal),
    cardId: args.cardId,
    zone: args.zone,
    modifications: [],
    provenance: args.provenance,
  };
  return {
    collection: {
      copies: [...collection.copies, copy],
      nextCopyOrdinal: collection.nextCopyOrdinal + 1,
    },
    copy,
  };
}

/**
 * Count one acquired copy of `cardId`. A card outside the bag has a target of
 * zero, so its acquisition leaves the bag unchanged; acquisitions past a
 * card's target keep counting, and its weight stays at zero.
 */
function recordAcquisition(bag: D97RewardBag, cardId: CardId): D97RewardBag {
  if (!bag.entries.some((entry) => entry.cardId === cardId)) return bag;
  return {
    ...bag,
    entries: bag.entries.map((entry) =>
      entry.cardId === cardId
        ? { ...entry, acquired: entry.acquired + 1 }
        : entry,
    ),
  };
}

/** The reducer log record of a copy the bag supplied. */
function bagDrawLogRecord(
  runId: D97RunId,
  bag: D97RewardBag,
  cardId: CardId,
): ReducerLogRecord {
  return {
    event: "d97_bag_draw",
    fields: {
      runId,
      avatarId: bag.avatarId,
      cardId,
      remaining: bagWeight(bag, cardId),
      bagSize: bagSize(bag),
    },
  };
}

/**
 * Acquire one copy of `request.cardId` for the run: the copy joins the
 * collection in `request.zone` with its provenance, and the bag counts it.
 * A `draw` the bag cannot supply returns null and changes nothing.
 */
export function acquireForRun<
  R extends D97AcquiringRun,
  S extends D97AcquisitionSource,
>(
  run: R,
  request: D97AcquisitionRequest<S>,
): S extends "named" ? D97Acquisition<R> : D97Acquisition<R> | null;
export function acquireForRun<R extends D97AcquiringRun>(
  run: R,
  request: D97AcquisitionRequest<D97AcquisitionSource>,
): D97Acquisition<R> | null {
  const { cardId } = request;
  const supplied = bagWeight(run.bag, cardId) > 0;
  if (request.source === "draw" && !supplied) return null;
  const provenance: D97CopyProvenance = {
    channel: request.channel,
    battleCount: run.battlesFought,
    ...(request.channel === "shop" ? { price: request.price } : {}),
  };
  const { collection, copy } = acquireCopy(run.collection, {
    runSeed: run.runSeed,
    cardId,
    provenance,
    zone: request.zone,
  });
  const bag = recordAcquisition(run.bag, cardId);
  return {
    run: { ...run, collection, bag },
    copy,
    logRecords: supplied ? [bagDrawLogRecord(run.runId, bag, cardId)] : [],
  };
}
