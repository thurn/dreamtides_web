// The D97 run contract: a D97 genesis folds a D97 slice on Avatar select
// while a journey genesis folds none; `D97_START_RUN` records the run (id,
// seed, roster Avatar, and its dream: the requested registered dream, or the
// content's default dream) once, opens every Avatar's reward bag at the
// run-start stage, draws the Standard starting package from ring 1, moves to the overworld and logs it; equip and unequip move owned
// copies between the deck and the reserve; and each mode bounces the other
// mode's events.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  D97_COLLECTION,
  D97_STARTING_PACKAGE,
} from "../../content/d97/collection";
import { acquireForRun } from "../../d97/collection/acquisition";
import { activeRewardBag, bagWeight } from "../../d97/collection/reward-bag";
import { eventRng } from "../../eventlog/rng";
import type { Genesis } from "../../eventlog/types";
import { testAvatarId, testCardId } from "../../types/test-identities";
import { genesisFoldState, type FoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import { ctx, event, GENESIS } from "../reducer-fixtures";
import { d97ContentProvider, registerD97ContentProvider } from "./d97-content";
import {
  SYNTHETIC_BAG_TUNING,
  SYNTHETIC_STARTERS,
  syntheticD97Content,
  syntheticPoolCardIds,
} from "./d97-content.fixtures";
import { SYNTHETIC_DREAM_A, SYNTHETIC_DREAM_B } from "./d97-dreams.fixtures";
import type { D97Run } from "./d97-state";

const D97_GENESIS: Genesis = { ...GENESIS, mode: "d97" };
const ROSTER_AVATAR = testAvatarId("d97-roster-avatar");
const OTHER_AVATAR = testAvatarId("d97-unlisted-avatar");
const POOL_SIZE = 40;
const STARTER_DILUTION =
  D97_STARTING_PACKAGE.starterBase +
  D97_STARTING_PACKAGE.starterPerDifficulty * D97_STARTING_PACKAGE.difficulty;

function startRun(state: FoldState, avatarId: unknown, seq = 1, extra: Record<string, unknown> = {}) {
  return reduceGameEvent(
    state,
    event("D97_START_RUN", { avatarId, ...extra }),
    ctx({ seq, rng: eventRng(D97_GENESIS.seed, seq) }),
  );
}

function startedState(): FoldState {
  return startRun(genesisFoldState(D97_GENESIS), ROSTER_AVATAR).state;
}

function runOf(state: FoldState): D97Run {
  const run = state.d97?.run;
  if (run === undefined || run === null) throw new Error("no D97 run");
  return run;
}

function deckEdit(
  state: FoldState,
  type: "D97_EQUIP_COPY" | "D97_UNEQUIP_COPY",
  copyId: unknown,
) {
  return reduceGameEvent(state, event(type, { copyId }), ctx({ seq: 2 }));
}

/** A started run with its first `count` deck copies moved to the reserve. */
function withReserve(state: FoldState, count: number): FoldState {
  let next = state;
  for (const copy of runOf(state).collection.copies.slice(0, count)) {
    next = deckEdit(next, "D97_UNEQUIP_COPY", copy.copyId).state;
  }
  return next;
}

beforeEach(() => {
  registerD97ContentProvider(
    syntheticD97Content({ avatarIds: [ROSTER_AVATAR], poolSize: POOL_SIZE }),
  );
});

afterEach(() => {
  registerD97ContentProvider(null);
});

describe("D97 genesis", () => {
  it("folds a D97 slice on Avatar select only for a D97 genesis", () => {
    expect(genesisFoldState(D97_GENESIS).d97).toEqual({
      screen: { type: "avatarSelect" },
      run: null,
    });
    expect("d97" in genesisFoldState(GENESIS)).toBe(false);
    expect("d97" in genesisFoldState({ ...GENESIS, mode: "journey" })).toBe(
      false,
    );
  });
});

describe("D97_START_RUN", () => {
  it("records the run with its roster Avatar, moves to the overworld and logs it", () => {
    const result = startRun(genesisFoldState(D97_GENESIS), ROSTER_AVATAR, 3);
    expect(result.outcome).toBe("applied");
    const run = result.state.d97?.run;
    expect(result.state.d97?.screen).toEqual({ type: "overworld" });
    expect(run?.avatarId).toBe(ROSTER_AVATAR);
    expect(run?.runId).toBeTruthy();
    expect(run?.runSeed).toBeTruthy();
    expect(result.logRecords?.[0]).toEqual({
      event: "d97_run_started",
      fields: {
        runId: run?.runId,
        runSeed: run?.runSeed,
        avatarId: ROSTER_AVATAR,
        dreamId: SYNTHETIC_DREAM_A.id,
        activeWaypointIds: [SYNTHETIC_DREAM_A.topology.waypointAnchorId],
      },
    });
    expect(run?.activeWaypointIds).toEqual([SYNTHETIC_DREAM_A.topology.waypointAnchorId]);
  });

  it("records the run's dream: the content's default dream, or the registered dream requested", () => {
    const genesis = genesisFoldState(D97_GENESIS);
    expect(startRun(genesis, ROSTER_AVATAR).state.d97?.run?.dreamId).toBe(SYNTHETIC_DREAM_A.id);
    const other = startRun(genesis, ROSTER_AVATAR, 1, { dreamId: SYNTHETIC_DREAM_B.id });
    expect(other.state.d97?.run?.dreamId).toBe(SYNTHETIC_DREAM_B.id);
    expect(other.logRecords?.[0]?.fields).toMatchObject({ dreamId: SYNTHETIC_DREAM_B.id });
  });

  it("bounces a dream the content does not register", () => {
    const genesis = genesisFoldState(D97_GENESIS);
    expect(startRun(genesis, ROSTER_AVATAR, 1, { dreamId: "d9700000-0000-4000-8000-0000000000ff" }).outcome).toBe("bounced");
    expect(startRun(genesis, ROSTER_AVATAR, 1, { dreamId: "not a dream" }).outcome).toBe("bounced");
  });

  it("derives the same run from the same event and a different seed from another seq", () => {
    const genesis = genesisFoldState(D97_GENESIS);
    const first = startRun(genesis, ROSTER_AVATAR, 3);
    const replay = startRun(genesis, ROSTER_AVATAR, 3);
    const later = startRun(genesis, ROSTER_AVATAR, 4).state.d97?.run;
    expect(replay.state).toEqual(first.state);
    expect(replay.logRecords).toEqual(first.logRecords);
    expect(later?.runSeed).not.toBe(first.state.d97?.run?.runSeed);
    expect(later?.runId).not.toBe(first.state.d97?.run?.runId);
  });

  it("opens every bag at the run-start stage, with draws only from the starting picks", () => {
    const result = startRun(genesisFoldState(D97_GENESIS), ROSTER_AVATAR);
    const run = runOf(result.state);
    expect(run.bags.stage).toBe(SYNTHETIC_BAG_TUNING.stages[0]?.stage);
    expect(Object.keys(run.bags.drawn)).toEqual([ROSTER_AVATAR]);
    const opened = result.logRecords?.find((record) => record.event === "d97_reward_bags_opened");
    expect(opened?.fields).toMatchObject({ runId: run.runId, avatarId: ROSTER_AVATAR, stage: run.bags.stage, ring1Size: POOL_SIZE });
  });

  it("builds the Standard starting package: Essence and distinct copies all in the deck", () => {
    const run = runOf(startedState());
    const copies = run.collection.copies;
    expect(run.essence).toBe(
      (D97_STARTING_PACKAGE.essenceDifficultyBase -
        D97_STARTING_PACKAGE.difficulty) *
        D97_STARTING_PACKAGE.essencePerStep,
    );
    expect(copies).toHaveLength(D97_STARTING_PACKAGE.pickCount);
    expect(new Set(copies.map((copy) => copy.cardId)).size).toBe(copies.length);
    expect(new Set(copies.map((copy) => copy.copyId)).size).toBe(copies.length);
    expect(copies.every((copy) => copy.zone === "deck")).toBe(true);
    for (const copy of copies) {
      expect(copy.modifications).toEqual([]);
      expect(copy.provenance).toEqual({ channel: "starting", battleCount: 0 });
    }
    expect(
      copies.filter((copy) => SYNTHETIC_STARTERS.includes(copy.cardId)),
    ).toHaveLength(STARTER_DILUTION);
  });

  it("draws every kept pick from ring 1 of the bag and logs each draw by UUID", () => {
    const result = startRun(genesisFoldState(D97_GENESIS), ROSTER_AVATAR);
    const run = runOf(result.state);
    const draws = (result.logRecords ?? []).filter(
      (record) => record.event === "d97_bag_draw",
    );
    const picked = run.collection.copies.filter(
      (copy) => !SYNTHETIC_STARTERS.includes(copy.cardId),
    );
    expect(draws.map((draw) => draw.fields.cardId)).toEqual(
      picked.map((copy) => copy.cardId),
    );
    const bag = activeRewardBag(d97ContentProvider()!, run);
    const ring1Capacity = SYNTHETIC_BAG_TUNING.stages[0]?.ring1Capacity ?? 0;
    const ring1 = new Set(syntheticPoolCardIds(POOL_SIZE));
    for (const copy of picked) {
      expect(ring1.has(copy.cardId)).toBe(true);
      expect(run.bags.drawn[ROSTER_AVATAR]?.[copy.cardId]).toBe(1);
      expect(bagWeight(bag, copy.cardId)).toBe(ring1Capacity - 1);
    }
    for (const draw of draws) {
      expect(Object.keys(draw.fields).sort()).toEqual([
        "avatarId",
        "bagSize",
        "cardId",
        "remaining",
        "ring",
        "runId",
        "source",
        "stage",
      ]);
      expect(draw.fields.runId).toBe(run.runId);
      expect(draw.fields.avatarId).toBe(ROSTER_AVATAR);
      expect(draw.fields.ring).toBe(1);
    }
  });

  it("bounces an Avatar outside the roster, a malformed id and a second start", () => {
    const genesis = genesisFoldState(D97_GENESIS);
    expect(startRun(genesis, OTHER_AVATAR).outcome).toBe("bounced");
    expect(startRun(genesis, "not-a-uuid").outcome).toBe("bounced");
    expect(startRun(genesis, undefined).outcome).toBe("bounced");
    const started = startRun(genesis, ROSTER_AVATAR).state;
    const again = startRun(started, ROSTER_AVATAR, 2);
    expect(again.outcome).toBe("bounced");
    expect(again.state).toBe(started);
  });

  it("bounces before the D97 content is registered", () => {
    registerD97ContentProvider(null);
    expect(startRun(genesisFoldState(D97_GENESIS), ROSTER_AVATAR).outcome).toBe(
      "bounced",
    );
  });
});

describe("D97_EQUIP_COPY and D97_UNEQUIP_COPY", () => {
  it("unequips a deck copy into the reserve and equips it back, logging each move", () => {
    const started = startedState();
    const copy = runOf(started).collection.copies[0];
    if (copy === undefined) throw new Error("no copy");
    const unequipped = deckEdit(started, "D97_UNEQUIP_COPY", copy.copyId);
    expect(unequipped.outcome).toBe("applied");
    const reserveCopy = runOf(unequipped.state).collection.copies.find(
      (candidate) => candidate.copyId === copy.copyId,
    );
    expect(reserveCopy?.zone).toBe("reserve");
    expect(unequipped.logRecords).toEqual([
      {
        event: "d97_copy_unequipped",
        fields: {
          runId: runOf(started).runId,
          copyId: copy.copyId,
          cardId: copy.cardId,
          deckSize: D97_STARTING_PACKAGE.pickCount - 1,
          collectionSize: D97_STARTING_PACKAGE.pickCount,
        },
      },
    ]);
    const equipped = deckEdit(unequipped.state, "D97_EQUIP_COPY", copy.copyId);
    expect(equipped.outcome).toBe("applied");
    expect(equipped.state.d97?.run?.collection).toEqual(
      runOf(started).collection,
    );
    expect(equipped.logRecords?.[0]?.event).toBe("d97_copy_equipped");
  });

  it("bounces unknown, malformed and wrong-zone copies", () => {
    const started = startedState();
    const copy = runOf(started).collection.copies[0];
    const stranger = acquireForRun(runOf(started), {
      cardId: testCardId("d97-stranger-card"),
      channel: "bag",
      zone: "reserve",
      source: "named",
    }, d97ContentProvider()!).copy;
    for (const type of ["D97_EQUIP_COPY", "D97_UNEQUIP_COPY"] as const) {
      expect(deckEdit(started, type, stranger.copyId).outcome).toBe("bounced");
      expect(deckEdit(started, type, "not-a-copy").outcome).toBe("bounced");
      expect(deckEdit(started, type, undefined).outcome).toBe("bounced");
    }
    expect(deckEdit(started, "D97_EQUIP_COPY", copy?.copyId).outcome).toBe(
      "bounced",
    );
    const reserved = withReserve(started, 1);
    expect(deckEdit(reserved, "D97_UNEQUIP_COPY", copy?.copyId).outcome).toBe(
      "bounced",
    );
  });

  it("refuses to unequip below the minimum deck size", () => {
    const surplus = D97_STARTING_PACKAGE.pickCount - D97_COLLECTION.minimumDeckSize;
    const atMinimum = withReserve(startedState(), surplus);
    const collection = runOf(atMinimum).collection;
    expect(collection.copies.filter((copy) => copy.zone === "deck")).toHaveLength(
      D97_COLLECTION.minimumDeckSize,
    );
    const deckCopy = collection.copies.find((copy) => copy.zone === "deck");
    const refused = deckEdit(atMinimum, "D97_UNEQUIP_COPY", deckCopy?.copyId);
    expect(refused.outcome).toBe("bounced");
    expect(refused.state).toBe(atMinimum);
  });

  it("bounces deck edits before the run starts", () => {
    const genesis = genesisFoldState(D97_GENESIS);
    const copyId = runOf(startedState()).collection.copies[0]?.copyId;
    expect(deckEdit(genesis, "D97_EQUIP_COPY", copyId).outcome).toBe("bounced");
    expect(deckEdit(genesis, "D97_UNEQUIP_COPY", copyId).outcome).toBe("bounced");
  });
});

describe("mode isolation", () => {
  it("bounces D97 events in a journey game", () => {
    const journey = genesisFoldState(GENESIS);
    const result = startRun(journey, ROSTER_AVATAR);
    expect(result.outcome).toBe("bounced");
    expect(result.state).toBe(journey);
    expect(deckEdit(journey, "D97_EQUIP_COPY", undefined).outcome).toBe("bounced");
  });

  it("bounces journey events in a D97 game", () => {
    const d97 = genesisFoldState(D97_GENESIS);
    for (const journeyEvent of [
      event("ADJUST_ESSENCE", { delta: 5 }),
      event("SELECT_AVATAR", { avatarId: ROSTER_AVATAR }),
      event("RESET_JOURNEY", {}),
    ]) {
      const result = reduceGameEvent(d97, journeyEvent, ctx({ seq: 1 }));
      expect(result.outcome).toBe("bounced");
      expect(result.state).toBe(d97);
    }
  });
});
