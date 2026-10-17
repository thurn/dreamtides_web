// The D97 run lifecycle cases. Each is a pure `(d97, payload, ctx)` function
// returning the next slice with its log records, or null to bounce.

import type { EventContext, ReducerLogRecord } from "../../eventlog/types";
import {
  avatarIdFromUnknown,
  parseD97RunId,
  parseD97RunSeed,
} from "../../types/identifiers";
import { D97_STARTING_PACKAGE } from "../../content/d97/collection";
import { acquireCopy, emptyCollection } from "../../d97/collection/collection";
import {
  bagSize,
  createRewardBag,
  recordAcquisition,
  takeFromBag,
  type D97BagDraw,
} from "../../d97/collection/reward-bag";
import {
  chooseStartingCollection,
  startingEssence,
} from "../../d97/collection/starting-collection";
import { emptyQuestState } from "../../d97/quests/quests";
import type { D97RunId } from "../../types/identifiers";
import { d97ContentProvider } from "./d97-content";
import type { D97Run, D97State } from "./d97-state";

/** A D97 case's applied result. */
export interface D97Transition {
  readonly d97: D97State;
  readonly logRecords: readonly ReducerLogRecord[];
}

/** Hex digits of one [0, 1) draw, at its full 52-bit precision. */
function drawHex(value: number): string {
  return Math.floor(value * 0x10000000000000)
    .toString(16)
    .padStart(13, "0");
}

/** The 32-bit seed one [0, 1) draw names. */
function drawSeed(value: number): number {
  return Math.floor(value * 0x100000000) >>> 0;
}

/** The reducer log record of one bag draw: UUIDs and counts only. */
export function bagDrawLogRecord(
  runId: D97RunId,
  draw: D97BagDraw,
): ReducerLogRecord {
  return {
    event: "d97_bag_draw",
    fields: {
      runId,
      avatarId: draw.bag.avatarId,
      cardId: draw.cardId,
      remaining: draw.remaining,
      bagSize: draw.bagSize,
    },
  };
}

/**
 * `D97_START_RUN { avatarId }` starts the run on the overworld with any
 * roster Avatar. The run's id comes from the event's seq and its seed from
 * the event's random stream, so both are recorded outcomes of this event.
 * The same stream deals the Avatar's reward bag and chooses the Standard
 * starting package; both are stored, never re-derived.
 */
export function startRun(
  d97: D97State,
  payload: Record<string, unknown>,
  ctx: EventContext,
): D97Transition | null {
  if (d97.run !== null || d97.screen.type !== "avatarSelect") return null;
  const avatarId = avatarIdFromUnknown(payload.avatarId);
  const content = d97ContentProvider();
  if (avatarId === null || content === null || !content.avatarIds.has(avatarId)) {
    return null;
  }
  let drawIndex = 0;
  const random = (): number => ctx.rng(drawIndex++);
  const runId = parseD97RunId(`event:${String(ctx.seq)}`);
  const runSeed = parseD97RunSeed(`${drawHex(random())}${drawHex(random())}`);
  const dealSeed = drawSeed(random());
  const deal = content.dealRewardPool(avatarId, dealSeed);
  let bag = createRewardBag({
    avatarId,
    dealSeed,
    joinedTideIds: deal.joinedTideIds,
    dealt: deal.cards,
  });
  const dealtBagSize = bagSize(bag);
  const starting = chooseStartingCollection({
    bag,
    content,
    tuning: D97_STARTING_PACKAGE,
    random,
  });
  const battlesFought = 0;
  const provenance = { channel: "starting", battleCount: battlesFought } as const;
  let collection = emptyCollection();
  const drawRecords: ReducerLogRecord[] = [];
  for (const cardId of starting.keptCardIds) {
    const draw = takeFromBag(bag, cardId);
    if (draw === null) continue;
    bag = draw.bag;
    drawRecords.push(bagDrawLogRecord(runId, draw));
    collection = acquireCopy(collection, {
      runSeed,
      cardId,
      provenance,
      zone: "deck",
    }).collection;
  }
  for (const cardId of starting.starterCardIds) {
    bag = recordAcquisition(bag, cardId);
    collection = acquireCopy(collection, {
      runSeed,
      cardId,
      provenance,
      zone: "deck",
    }).collection;
  }
  const run: D97Run = {
    runId,
    runSeed,
    avatarId,
    startedAt: ctx.timestamp,
    essence: startingEssence(D97_STARTING_PACKAGE),
    battlesFought,
    collection,
    bag,
    encounters: {},
    returnAnchorId: null,
    quests: emptyQuestState(),
    flags: [],
  };
  return {
    d97: { screen: { type: "overworld" }, run },
    logRecords: [
      {
        event: "d97_run_started",
        fields: {
          runId: run.runId,
          runSeed: run.runSeed,
          avatarId: run.avatarId,
        },
      },
      {
        event: "d97_reward_bag_dealt",
        fields: {
          runId,
          avatarId,
          dealSeed,
          joinedTideIds: bag.joinedTideIds,
          distinctCardCount: bag.entries.length,
          bagSize: dealtBagSize,
        },
      },
      ...drawRecords,
      {
        event: "d97_starting_package_built",
        fields: {
          runId,
          avatarId,
          difficulty: D97_STARTING_PACKAGE.difficulty,
          essence: run.essence,
          keptCardIds: starting.keptCardIds,
          cutCardIds: starting.cutCardIds,
          starterCardIds: starting.starterCardIds,
          copyIds: collection.copies.map((copy) => copy.copyId),
          deckSize: collection.copies.length,
        },
      },
    ],
  };
}
