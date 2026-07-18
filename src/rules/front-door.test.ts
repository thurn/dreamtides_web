import { describe, expect, it } from "vitest";
import type { EventContext, GameEvent, Genesis } from "../eventlog/types";
import { genesisFoldState } from "./fold-state";
import { reduceGameEvent } from "./reducer";

const GENESIS: Genesis = {
  seed: "front-door-seed",
  reducerVersion: "test",
  createdAt: 0,
  contentConfig: {
    poolVariant: "test",
    draftMode: "pool",
    fresh20PackSize: null,
  },
};

function event(
  type: string,
  payload: Record<string, unknown>,
  basedOnSeq = 0,
  actor = "player-a",
): GameEvent {
  return {
    type,
    payload,
    actor,
    clientTimestamp: "1970-01-01T00:00:00.000Z",
    basedOnSeq,
  };
}

function context(
  seq: number,
  intervening: EventContext["intervening"] = [],
): EventContext {
  return {
    seq,
    rng: () => 0,
    timestamp: "1970-01-01T00:00:00.000Z",
    intervening,
  };
}

describe("front-door reducer", () => {
  it("derives direct loading and tutorial entries from room genesis", () => {
    expect(
      genesisFoldState({ ...GENESIS, frontDoorEntry: "loading" }).frontDoor,
    ).toEqual({ phase: "loading", journeyId: "genesis:front-door-seed" });
    expect(
      genesisFoldState({ ...GENESIS, frontDoorEntry: "tutorial" }).frontDoor,
    ).toEqual({ phase: "tutorial", journeyId: "genesis:front-door-seed" });
  });

  it("folds New Journey through the animated main, loading, and tutorial phases", () => {
    const start = genesisFoldState(GENESIS);
    const exiting = reduceGameEvent(
      start,
      event("FRONT_DOOR_ACTION", {
        surface: "main",
        actionId: "new-journey",
      }),
      context(1),
    );
    expect(exiting.outcome).toBe("applied");
    expect(exiting.state.frontDoor).toEqual({
      phase: "mainExiting",
      journeyId: "event:1",
    });

    const loading = reduceGameEvent(
      exiting.state,
      event(
        "ADVANCE_FRONT_DOOR",
        { from: "mainExiting", journeyId: "event:1" },
        1,
      ),
      context(2),
    );
    expect(loading.outcome).toBe("applied");
    expect(loading.state.frontDoor.phase).toBe("loading");

    const tutorial = reduceGameEvent(
      loading.state,
      event("ADVANCE_FRONT_DOOR", { from: "loading", journeyId: "event:1" }, 2),
      context(3),
    );
    expect(tutorial.outcome).toBe("applied");
    expect(tutorial.state.frontDoor.phase).toBe("tutorial");
  });

  it("lets the first player advance while stale duplicate transitions bounce", () => {
    const start = genesisFoldState(GENESIS);
    const first = reduceGameEvent(
      start,
      event("FRONT_DOOR_ACTION", {
        surface: "main",
        actionId: "new-journey",
      }),
      context(1),
    );
    const duplicate = reduceGameEvent(
      first.state,
      event("FRONT_DOOR_ACTION", {
        surface: "main",
        actionId: "new-journey",
      }),
      context(2, [{ seq: 1, actor: "player-a", type: "FRONT_DOOR_ACTION" }]),
    );

    expect(duplicate.outcome).toBe("bounced");
    expect(duplicate.state).toBe(first.state);
  });

  it("accepts either player's New Journey intent across a partner's menu action", () => {
    const start = genesisFoldState(GENESIS);
    const social = reduceGameEvent(
      start,
      event("FRONT_DOOR_ACTION", { surface: "main", actionId: "github" }),
      context(1),
    );
    const journey = reduceGameEvent(
      social.state,
      event(
        "FRONT_DOOR_ACTION",
        { surface: "main", actionId: "new-journey" },
        0,
        "player-b",
      ),
      context(2, [{ seq: 1, actor: "player-a", type: "FRONT_DOOR_ACTION" }]),
    );

    expect(journey.outcome).toBe("applied");
    expect(journey.state.frontDoor).toEqual({
      phase: "mainExiting",
      journeyId: "event:2",
    });
  });

  it("records non-journey menu actions without changing the shared scene", () => {
    const start = genesisFoldState(GENESIS);
    const result = reduceGameEvent(
      start,
      event("FRONT_DOOR_ACTION", { surface: "main", actionId: "github" }),
      context(1),
    );

    expect(result.outcome).toBe("applied");
    expect(result.state.frontDoor).toEqual(start.frontDoor);
  });
});
