// The D97 run lifecycle case, declared in ./events/run.ts. It is a pure
// `(input, payload, ctx)` function returning the next slice with its log
// records, or null to bounce.

import type { EventContext, ReducerLogRecord } from "../../eventlog/types";
import {
  parseD97RunId,
  parseD97RunSeed,
  type AvatarId,
  type D97DreamId,
} from "../../types/identifiers";
import { D97_STARTING_PACKAGE } from "../../content/d97/collection";
import {
  acquireForRun,
  type D97AcquiringRun,
} from "../../d97/collection/acquisition";
import { emptyCollection } from "../../d97/collection/collection";
import { bagSize, createRewardBag } from "../../d97/collection/reward-bag";
import {
  chooseStartingCollection,
  startingEssence,
} from "../../d97/collection/starting-collection";
import { emptyQuestState } from "../../d97/quests/quests";
import { d97ContentProvider } from "./d97-content";
import type { D97Run, D97State } from "./d97-state";
import type { D97SelectInput } from "./events/spec";

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

/**
 * `D97_START_RUN { avatarId, dreamId? }` starts the run on the overworld with
 * any roster Avatar, in the registered dream `dreamId` names (the content's
 * default dream when omitted; a dream the content does not register bounces). The run's id comes from the event's seq and its seed from
 * the event's random stream, so both are recorded outcomes of this event.
 * The same stream deals the Avatar's reward bag and chooses the Standard
 * starting package; both are stored, never re-derived. The start dream's
 * waypoint is active from the start.
 */
export function startRun(
  _input: D97SelectInput,
  payload: { readonly avatarId: AvatarId; readonly dreamId?: D97DreamId },
  ctx: EventContext,
): D97Transition | null {
  const { avatarId } = payload;
  const content = d97ContentProvider();
  if (content === null || !content.avatarIds.has(avatarId)) {
    return null;
  }
  const requested = payload.dreamId ?? content.defaultDreamId;
  const dream = requested === null ? undefined : content.dreams.get(requested)?.definition;
  if (dream === undefined) return null;
  let drawIndex = 0;
  const random = (): number => ctx.rng(drawIndex++);
  const runId = parseD97RunId(`event:${String(ctx.seq)}`);
  const runSeed = parseD97RunSeed(`${drawHex(random())}${drawHex(random())}`);
  const dealSeed = drawSeed(random());
  const deal = content.dealRewardPool(avatarId, dealSeed);
  const dealtBag = createRewardBag({
    avatarId,
    dealSeed,
    joinedTideIds: deal.joinedTideIds,
    dealt: deal.cards,
  });
  const dealtBagSize = bagSize(dealtBag);
  const starting = chooseStartingCollection({
    bag: dealtBag,
    content,
    tuning: D97_STARTING_PACKAGE,
    random,
  });
  const battlesFought = 0;
  let acquiring: D97AcquiringRun = {
    runId,
    runSeed,
    battlesFought,
    collection: emptyCollection(),
    bag: dealtBag,
  };
  const drawRecords: ReducerLogRecord[] = [];
  const acquisitions = [
    ...starting.keptCardIds.map((cardId) => ({ cardId, source: "draw" as const })),
    ...starting.starterCardIds.map((cardId) => ({ cardId, source: "named" as const })),
  ];
  for (const { cardId, source } of acquisitions) {
    // A kept card the bag no longer holds is not acquired.
    const acquired = acquireForRun(acquiring, { cardId, channel: "starting", zone: "deck", source });
    if (acquired === null) continue;
    acquiring = acquired.run;
    drawRecords.push(...acquired.logRecords);
  }
  const { collection, bag } = acquiring;
  const run: D97Run = {
    runId,
    runSeed,
    avatarId,
    dreamId: dream.id,
    startedAt: ctx.timestamp,
    essence: startingEssence(D97_STARTING_PACKAGE),
    battlesFought,
    collection,
    bag,
    encounters: {},
    returnAnchorId: null,
    quests: emptyQuestState(),
    flags: [],
    // The start dream's waypoint is active from the start (Appendix B §B6).
    activeWaypointIds: [dream.topology.waypointAnchorId],
    lastPlace: null,
    shops: {},
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
          dreamId: run.dreamId,
          activeWaypointIds: run.activeWaypointIds,
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
