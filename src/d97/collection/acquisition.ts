// The one way a Dreamtides 97 run gains a card (decision P29). Every
// acquisition, through any channel, adds an owned copy to the collection. An
// acquisition from the active reward bag (a draw, or an offered card the bag
// still holds) also counts one copy in that Avatar's `drawn(c)`, so
// `w(c) = capacity(c) − drawn(c)` holds by construction (Appendix A §A2), and
// logs a `d97_bag_draw` record carrying UUIDs and counts only. Copies from
// other channels (antes, Starter cards, named rewards) never change `w`.

import type { ReducerLogRecord } from "../../eventlog/types";
import type { CardId } from "../../types/card-identity";
import type { D97RunId, D97RunSeed } from "../../types/identifiers";
import { ownedCopyId } from "./collection";
import type { AvatarId } from "../../types/identifiers";
import { activeRewardBag, bagRing, bagSize, bagWeight, recordBagDraw, type D97RewardBagContent } from "./reward-bag";
import type {
  D97AcquisitionChannel,
  D97Collection,
  D97CopyProvenance,
  D97CopyZone,
  D97OwnedCopy,
  D97RewardBags,
} from "./types";

/** The run fields an acquisition reads and writes. */
export interface D97AcquiringRun {
  readonly runId: D97RunId;
  readonly runSeed: D97RunSeed;
  /** Battles fought so far; the new copy's provenance records it. */
  readonly battlesFought: number;
  readonly collection: D97Collection;
  /** The run's current Avatar: its bag is the active one. */
  readonly avatarId: AvatarId;
  readonly bags: D97RewardBags;
}

/**
 * Where the acquired card came from. `draw`: the card was drawn from the
 * active bag, which must still hold a copy of it. `offer`: the card was
 * offered from the bag (a shop slot, a card-choice offer); the run gains it
 * either way, and it counts against the bag if the bag still holds a copy.
 * `named`: the game named the card from outside the bag (a Starter card, an
 * ante); the bag never counts it.
 */
export type D97AcquisitionSource = "draw" | "offer" | "named";

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

/** The reducer log record of a copy the active bag supplied. */
function bagDrawLogRecord(
  runId: D97RunId,
  content: D97RewardBagContent,
  run: D97AcquiringRun,
  cardId: CardId,
  source: D97AcquisitionSource,
): ReducerLogRecord {
  const bag = activeRewardBag(content, run);
  return {
    event: "d97_bag_draw",
    fields: {
      runId,
      avatarId: bag.avatarId,
      cardId,
      source,
      ring: bagRing(bag, cardId),
      stage: bag.stage,
      remaining: bagWeight(bag, cardId),
      bagSize: bagSize(bag),
    },
  };
}

/**
 * Acquire one copy of `request.cardId` for the run: the copy joins the
 * collection in `request.zone` with its provenance, and a draw or an offered
 * card the active bag still holds counts against that bag. A `draw` the bag
 * cannot supply returns null and changes nothing.
 */
export function acquireForRun<
  R extends D97AcquiringRun,
  S extends D97AcquisitionSource,
>(
  run: R,
  request: D97AcquisitionRequest<S>,
  content: D97RewardBagContent,
): S extends "draw" ? D97Acquisition<R> | null : D97Acquisition<R>;
export function acquireForRun<R extends D97AcquiringRun>(
  run: R,
  request: D97AcquisitionRequest<D97AcquisitionSource>,
  content: D97RewardBagContent,
): D97Acquisition<R> | null {
  const { cardId } = request;
  const supplied = request.source !== "named" && bagWeight(activeRewardBag(content, run), cardId) > 0;
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
  const bags = supplied ? recordBagDraw(run.bags, run.avatarId, cardId) : run.bags;
  const next: R = { ...run, collection, bags };
  return {
    run: next,
    copy,
    logRecords: supplied ? [bagDrawLogRecord(run.runId, content, next, cardId, request.source)] : [],
  };
}
