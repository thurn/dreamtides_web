// The D97 run skeleton contract: a D97 genesis folds a D97 slice on Avatar
// select while a journey genesis folds none; `D97_START_RUN` records the run
// (id, seed, roster Avatar) once, moves to the overworld and logs it; and each
// mode bounces the other mode's events.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eventRng } from "../../eventlog/rng";
import type { Genesis } from "../../eventlog/types";
import { testAvatarId } from "../../types/test-identities";
import { genesisFoldState, type FoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import { ctx, event, GENESIS } from "../reducer-fixtures";
import { registerD97ContentProvider } from "./d97-content";

const D97_GENESIS: Genesis = { ...GENESIS, mode: "d97" };
const ROSTER_AVATAR = testAvatarId("d97-roster-avatar");
const OTHER_AVATAR = testAvatarId("d97-unlisted-avatar");

function startRun(state: FoldState, avatarId: unknown, seq = 1) {
  return reduceGameEvent(
    state,
    event("D97_START_RUN", { avatarId }),
    ctx({ seq, rng: eventRng(D97_GENESIS.seed, seq) }),
  );
}

beforeEach(() => {
  registerD97ContentProvider({ avatarIds: new Set([ROSTER_AVATAR]) });
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
    expect(result.logRecords).toEqual([
      {
        event: "d97_run_started",
        fields: {
          runId: run?.runId,
          runSeed: run?.runSeed,
          avatarId: ROSTER_AVATAR,
        },
      },
    ]);
  });

  it("derives the same run from the same event and a different seed from another seq", () => {
    const genesis = genesisFoldState(D97_GENESIS);
    const first = startRun(genesis, ROSTER_AVATAR, 3).state.d97?.run;
    const replay = startRun(genesis, ROSTER_AVATAR, 3).state.d97?.run;
    const later = startRun(genesis, ROSTER_AVATAR, 4).state.d97?.run;
    expect(replay).toEqual(first);
    expect(later?.runSeed).not.toBe(first?.runSeed);
    expect(later?.runId).not.toBe(first?.runId);
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

describe("mode isolation", () => {
  it("bounces D97 events in a journey game", () => {
    const journey = genesisFoldState(GENESIS);
    const result = startRun(journey, ROSTER_AVATAR);
    expect(result.outcome).toBe("bounced");
    expect(result.state).toBe(journey);
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
