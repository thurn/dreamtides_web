import { describe, expect, it } from "vitest";
import type { EventContext, GameEvent, Genesis } from "../eventlog/types";
import {
  TUTORIAL_OPPONENT_CARD_ID,
  TUTORIAL_PLAYER_CARD_ID,
  TUTORIAL_PLAYER_CARD_INSTANCE_ID,
} from "../data/tutorial-opponent-card";
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
    ).toEqual({
      phase: "loading",
      journeyId: "genesis:front-door-seed",
      tutorial: null,
    });
    expect(
      genesisFoldState({ ...GENESIS, frontDoorEntry: "tutorial" }).frontDoor,
    ).toEqual({
      phase: "tutorial",
      journeyId: "genesis:front-door-seed",
      tutorial: null,
    });
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
      tutorial: null,
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
      tutorial: null,
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

  it("folds a validated tutorial snapshot and advances only its current action", () => {
    const start = genesisFoldState({ ...GENESIS, frontDoorEntry: "tutorial" });
    const begun = reduceGameEvent(
      start,
      event("BEGIN_TUTORIAL", {
        actions: [
          {
            id: "welcome",
            action: "display-speech-bubble",
            text: "A first line.",
            wait: 0.5,
          },
          {
            id: "how-to-play",
            action: "display-how-to-play",
            text: "Shared configured instructions.",
            wait: 0,
          },
          {
            id: "end-turn",
            action: "end-turn",
            wait: 0,
          },
        ],
      }),
      context(1),
    );

    expect(begun.outcome).toBe("applied");
    expect(begun.state.frontDoor.tutorial).toMatchObject({
      runId: "event:1",
      currentActionIndex: 0,
      playerCardPlay: null,
    });

    const wrong = reduceGameEvent(
      begun.state,
      event("COMPLETE_TUTORIAL_ACTION", {
        runId: "event:1",
        actionId: "how-to-play",
      }),
      context(2),
    );
    expect(wrong.outcome).toBe("bounced");

    const first = reduceGameEvent(
      begun.state,
      event("COMPLETE_TUTORIAL_ACTION", {
        runId: "event:1",
        actionId: "welcome",
      }),
      context(2),
    );
    expect(first.outcome).toBe("applied");
    expect(first.state.frontDoor.tutorial?.currentActionIndex).toBe(1);

    const second = reduceGameEvent(
      first.state,
      event("COMPLETE_TUTORIAL_ACTION", {
        runId: "event:1",
        actionId: "how-to-play",
      }),
      context(3),
    );
    expect(second.outcome).toBe("applied");
    expect(second.state.frontDoor.tutorial?.currentActionIndex).toBe(2);

    const prematureEnd = reduceGameEvent(
      second.state,
      event("COMPLETE_TUTORIAL_ACTION", {
        runId: "event:1",
        actionId: "end-turn",
      }),
      context(4),
    );
    expect(prematureEnd.outcome).toBe("bounced");

    const played = reduceGameEvent(
      second.state,
      event("FRONT_DOOR_ACTION", {
        surface: "tutorial",
        actionId: "play-card",
        detail: {
          runId: "event:1",
          cardInstanceId: TUTORIAL_PLAYER_CARD_INSTANCE_ID,
          cardId: TUTORIAL_PLAYER_CARD_ID,
          targetSlotId: "player-back-4",
        },
      }),
      context(5),
    );
    expect(played.outcome).toBe("applied");
    expect(played.state.frontDoor.tutorial?.playerCardPlay).toEqual({
      cardInstanceId: TUTORIAL_PLAYER_CARD_INSTANCE_ID,
      cardId: TUTORIAL_PLAYER_CARD_ID,
      targetSlotId: "player-back-4",
    });

    const duplicate = reduceGameEvent(
      played.state,
      event("FRONT_DOOR_ACTION", {
        surface: "tutorial",
        actionId: "play-card",
        detail: {
          runId: "event:1",
          cardInstanceId: TUTORIAL_PLAYER_CARD_INSTANCE_ID,
          cardId: TUTORIAL_PLAYER_CARD_ID,
          targetSlotId: null,
        },
      }),
      context(6),
    );
    expect(duplicate.outcome).toBe("bounced");

    const ended = reduceGameEvent(
      played.state,
      event("COMPLETE_TUTORIAL_ACTION", {
        runId: "event:1",
        actionId: "end-turn",
      }),
      context(7),
    );
    expect(ended.outcome).toBe("applied");
    expect(ended.state.frontDoor.tutorial?.currentActionIndex).toBeNull();
  });

  it("starts a tutorial at a validated authored action id", () => {
    const start = genesisFoldState({ ...GENESIS, frontDoorEntry: "tutorial" });
    const actions = [
      {
        id: "welcome",
        action: "display-speech-bubble",
        text: "A first line.",
        wait: 1,
      },
      {
        id: "tail-start",
        action: "display-speech-bubble",
        text: "The testable tail.",
        wait: 1,
      },
    ];

    const begun = reduceGameEvent(
      start,
      event("BEGIN_TUTORIAL", { actions, startActionId: "tail-start" }),
      context(1),
    );
    expect(begun.outcome).toBe("applied");
    expect(begun.state.frontDoor.tutorial).toMatchObject({
      runId: "event:1",
      actions,
      currentActionIndex: 1,
    });

    const staleId = reduceGameEvent(
      start,
      event("BEGIN_TUTORIAL", { actions, startActionId: "missing" }),
      context(2),
    );
    expect(staleId.outcome).toBe("bounced");
  });

  it("reconstructs the player card play when starting after the interactive end-turn beat", () => {
    const start = genesisFoldState({ ...GENESIS, frontDoorEntry: "tutorial" });
    const actions = [
      {
        id: "how-to-play",
        action: "display-how-to-play",
        text: "Play a character.",
        wait: 0,
      },
      {
        id: "end-turn",
        action: "end-turn",
        wait: 0,
      },
      {
        id: "opponent-character-advance",
        action: "reposition-opponent-character",
        cardId: TUTORIAL_OPPONENT_CARD_ID,
        wait: 0,
      },
      {
        id: "challenge-positioning-how-to-play",
        action: "display-how-to-play",
        text: "Position characters in the front rank.",
        wait: 0,
      },
    ];

    const atEndTurn = reduceGameEvent(
      start,
      event("BEGIN_TUTORIAL", { actions, startActionId: "end-turn" }),
      context(1),
    );
    expect(atEndTurn.outcome).toBe("applied");
    expect(atEndTurn.state.frontDoor.tutorial?.playerCardPlay).toBeNull();

    const afterEndTurn = reduceGameEvent(
      start,
      event("BEGIN_TUTORIAL", {
        actions,
        startActionId: "challenge-positioning-how-to-play",
      }),
      context(2),
    );
    expect(afterEndTurn.outcome).toBe("applied");
    expect(afterEndTurn.state.frontDoor.tutorial).toMatchObject({
      currentActionIndex: 3,
      playerCardPlay: {
        cardInstanceId: TUTORIAL_PLAYER_CARD_INSTANCE_ID,
        cardId: TUTORIAL_PLAYER_CARD_ID,
        targetSlotId: null,
      },
    });
  });
});
