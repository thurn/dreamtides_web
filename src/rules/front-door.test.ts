import { testJourneySeed } from "../types/test-identities";
import { testEventActor } from "../types/test-identities";
import { beforeEach, describe, expect, it } from "vitest";
import type { EventContext, GameEvent, Genesis } from "../eventlog/types";
import {
  TEST_TUTORIAL_CARD_CONSTANTS,
  TEST_TUTORIAL_PLAYER_AVATAR_ID,
} from "../testing/tutorial-configuration-fixture";
import { registerTutorialFrontDoorContentProvider } from "./front-door";
import { genesisFoldState } from "./fold-state";
import { reduceGameEvent } from "./reducer";
import { testAvatarId } from "../types/test-identities";
import { TEST_CONTENT_CONFIG } from "../testing/journey-genesis";

const TUTORIAL_PLAYER_CARD_ID =
  TEST_TUTORIAL_CARD_CONSTANTS.tutorialPlayerCharacterCardId;

beforeEach(() => {
  registerTutorialFrontDoorContentProvider({
    playerCardId: TUTORIAL_PLAYER_CARD_ID,
    journeyAvatarId: testAvatarId(TEST_TUTORIAL_PLAYER_AVATAR_ID),
  });
});

const GENESIS: Genesis = {
  seed: testJourneySeed("front-door-seed"),
  reducerVersion: "test",
  createdAt: 0,
  frontDoorEntry: "main",
  contentConfig: TEST_CONTENT_CONFIG,
};

function event(
  type: GameEvent["type"],
  payload: Record<string, unknown>,
): GameEvent {
  return {
    type,
    payload,
    actor: testEventActor("player-a"),
    clientTimestamp: "1970-01-01T00:00:00.000Z",
  };
}

function context(seq: number): EventContext {
  return {
    contentConfig: TEST_CONTENT_CONFIG,
    seq,
    rng: () => 0,
    timestamp: "1970-01-01T00:00:00.000Z",
  };
}

describe("front-door reducer", () => {
  it("derives direct loading and tutorial entries from game genesis", () => {
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
      event("ADVANCE_FRONT_DOOR", { from: "mainExiting", journeyId: "event:1" }),
      context(2),
    );
    expect(loading.outcome).toBe("applied");
    expect(loading.state.frontDoor.phase).toBe("loading");

    const tutorial = reduceGameEvent(
      loading.state,
      event("ADVANCE_FRONT_DOOR", { from: "loading", journeyId: "event:1" }),
      context(3),
    );
    expect(tutorial.outcome).toBe("applied");
    expect(tutorial.state.frontDoor.phase).toBe("tutorial");
  });

  it("applies the first New Journey transition and bounces a duplicate", () => {
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
      context(2),
    );

    expect(duplicate.outcome).toBe("bounced");
    expect(duplicate.state).toBe(first.state);
  });

  it("accepts New Journey after a menu action that leaves the main menu open", () => {
    const start = genesisFoldState(GENESIS);
    const social = reduceGameEvent(
      start,
      event("FRONT_DOOR_ACTION", { surface: "main", actionId: "github" }),
      context(1),
    );
    const journey = reduceGameEvent(
      social.state,
      event("FRONT_DOOR_ACTION", { surface: "main", actionId: "new-journey" }),
      context(2),
    );

    expect(journey.outcome).toBe("applied");
    expect(journey.state.frontDoor).toEqual({
      phase: "mainExiting",
      journeyId: "event:2",
      tutorial: null,
    });
  });

  it("bounces unavailable main-menu actions", () => {
    const start = genesisFoldState(GENESIS);
    const result = reduceGameEvent(
      start,
      event("FRONT_DOOR_ACTION", { surface: "main", actionId: "reddit" }),
      context(1),
    );

    expect(result.outcome).toBe("bounced");
    expect(result.state).toBe(start);
  });

});
