import { testJourneySeed } from "../types/test-identities";
import { testEventActor } from "../types/test-identities";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { EventContext, GameEvent, Genesis } from "../eventlog/types";
import type { FoldState } from "../rules/fold-state";
import { genesisFoldState } from "../rules/fold-state";
import { reduceGameEvent } from "../rules/reducer";
import {
  BATTLE_SITE_ID,
  AVATAR_ID,
  DRAFT_SITE_ID,
  ESSENCE_SITE_ID,
  NEXT_NODE_ID,
  NODE_ID,
  SHOP_SITE_ID,
  clearReplayFixtureProviders,
  registerReplayFixtureProviders,
} from "../rules/replay/fixture-providers";
import { parseSiteId } from "../types/identifiers";
import { testDreamscapeId, testAvatarId } from "../types/test-identities";

const GENESIS: Genesis = {
  seed: testJourneySeed("journey-flow-reducer"),
  reducerVersion: "test",
  createdAt: 0,
  contentConfig: {
    poolVariant: "tides4",
  },
};

function apply(
  state: FoldState,
  seq: number,
  type: GameEvent["type"],
  payload: Record<string, unknown>,
): FoldState {
  const event: GameEvent = {
    type,
    payload,
    actor: testEventActor("player"),
    clientTimestamp: "1970-01-01T00:00:00.000Z",
    basedOnSeq: seq - 1,
  };
  const context: EventContext = {
    seq,
    timestamp: event.clientTimestamp,
    rng: () => 0.25,
    intervening: [],
  };
  const result = reduceGameEvent(state, event, context);
  expect(result.outcome).toBe("applied");
  return result.state;
}

function reachBattle(): { state: FoldState; seq: number } {
  let state = genesisFoldState(GENESIS);
  let seq = 1;
  state = apply(state, seq++, "START_JOURNEY", {
    avatarId: testAvatarId(AVATAR_ID),
  });
  for (const siteId of [ESSENCE_SITE_ID, SHOP_SITE_ID, DRAFT_SITE_ID]) {
    state = apply(state, seq++, "ENTER_SITE", { siteId: parseSiteId(siteId) });
    state = apply(state, seq++, "COMPLETE_SITE", { siteId: parseSiteId(siteId) });
  }
  state = apply(state, seq++, "ENTER_SITE", {
    siteId: parseSiteId(BATTLE_SITE_ID),
  });
  state = apply(state, seq++, "BEGIN_BATTLE", {
    siteId: parseSiteId(BATTLE_SITE_ID),
  });
  return { state, seq };
}

beforeEach(registerReplayFixtureProviders);
afterEach(clearReplayFixtureProviders);

describe("authoritative journey flow", () => {
  it("commits reward, site completion, Atlas progress, routing, and teardown in one END_BATTLE fold", () => {
    const reached = reachBattle();
    const before = reached.state;
    let state = apply(before, reached.seq, "BATTLE_COMMAND", {
      command: { id: "SKIP_TO_REWARDS" },
    });
    state = apply(state, reached.seq + 1, "END_BATTLE", {});

    expect(state.battle).toBeNull();
    expect(state.journey).toMatchObject({
      completionLevel: 1,
      essence: before.journey.essence + 75,
      currentDreamscape: null,
      activeSiteId: null,
      screen: { type: "atlas" },
    });
    expect(state.journey.visitedSites).toContain(BATTLE_SITE_ID);
    expect(state.journey.atlas.nodes[NODE_ID].state).toBe("completed");
    expect(state.journey.atlas.nodes[NEXT_NODE_ID]).toMatchObject({
      state: "available",
      dreamscapeId: testDreamscapeId("dreamscape-next"),
    });
  });

  it("derives defeat from the terminal board and leaves progression untouched", () => {
    const reached = reachBattle();
    const before = reached.state;
    let state = apply(before, reached.seq, "BATTLE_COMMAND", {
      command: { id: "FORCE_RESULT", result: "defeat" },
    });
    state = apply(state, reached.seq + 1, "END_BATTLE", {
      result: "victory",
    });

    expect(state.battle).toBeNull();
    expect(state.journey.screen.type).toBe("journeyFailed");
    expect(state.journey.failureSummary?.result).toBe("defeat");
    expect(state.journey.completionLevel).toBe(before.journey.completionLevel);
    expect(state.journey.atlas).toEqual(before.journey.atlas);
  });

  it("keeps a non-terminal battle intact when END_BATTLE is submitted early", () => {
    const reached = reachBattle();
    const event: GameEvent = {
      type: "END_BATTLE",
      payload: {},
      actor: testEventActor("player"),
      clientTimestamp: "1970-01-01T00:00:00.000Z",
      basedOnSeq: reached.seq - 1,
    };
    const result = reduceGameEvent(reached.state, event, {
      seq: reached.seq,
      timestamp: event.clientTimestamp,
      rng: () => 0.25,
      intervening: [],
    });

    expect(result.outcome).toBe("bounced");
    expect(result.state).toBe(reached.state);
  });
});
