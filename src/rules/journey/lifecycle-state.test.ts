import { testJourneySeed } from "../../types/test-identities";
import { testPresentationId, testTutorialTriggerId } from "../../types/test-identities";
import { parseCardTutorialScreenKey } from "../../types/identifiers";
import { afterEach, describe, expect, it } from "vitest";
import { hashState } from "../../eventlog/hash";
import type { JourneyState } from "../../types/journey";
import { genesisFoldState, type FoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import { registerJourneyLifecycleContentProvider } from "./lifecycle";
import { testAvatarId } from "../../types/test-identities";
import { TEST_CONTENT_CONFIG } from "../../testing/journey-genesis";
import { GENESIS, ctx, event, apply, genesis, deterministicProvider } from "./lifecycle-fixtures";



afterEach(() => {
  registerJourneyLifecycleContentProvider(null);
});


describe("initial fold state", () => {
  it("starts with no tutorial history and nothing presented", () => {
    const state = genesis();
    expect(state.tutorialTriggerIdsSeen).toEqual([]);
    expect(state.cardTutorialScreenKeysSeen).toEqual([]);
    expect(state.cardTutorialPresentation).toBeNull();
  });

  it("reads the starting Essence and Dreamsign cap from the genesis economy", () => {
    const state = genesisFoldState({
      ...GENESIS,
      contentConfig: {
        ...TEST_CONTENT_CONFIG,
        defaultStartingEssence: 137,
        dreamsignCap: 9,
      },
    });
    expect(state.journey.essence).toBe(137);
    expect(state.journey.maxDreamsigns).toBe(9);
  });
});


describe("RESET_JOURNEY initial state", () => {
  const TRIGGER_ID = testTutorialTriggerId("first-battle");
  const SCREEN_KEY = parseCardTutorialScreenKey("shop:slot-0");

  function presented(state: FoldState): FoldState {
    return {
      ...state,
      tutorialTriggerIdsSeen: [TRIGGER_ID],
      cardTutorialScreenKeysSeen: [SCREEN_KEY],
      cardTutorialPresentation: {
        id: testPresentationId("presentation"),
        screenKey: SCREEN_KEY,
        cardId: null,
        triggerId: TRIGGER_ID,
        speaker: "mira",
        text: "",
        duration: 1,
        horizontalOffset: 0,
        verticalOffset: 0,
        bubbleWidth: 1,
      },
    };
  }

  it("rebuilds the whole initial fold for the game seed, keeping the front door", () => {
    registerJourneyLifecycleContentProvider(deterministicProvider());
    const started = apply(genesis(), "START_JOURNEY", {
      avatarId: testAvatarId("dc-7"),
    });
    const reset = apply(started, "RESET_JOURNEY", {});
    expect(hashState(reset)).toBe(
      hashState({ ...genesis(), frontDoor: started.frontDoor }),
    );
  });

  it("reads the starting economy from the pinned content configuration", () => {
    const economy = {
      ...TEST_CONTENT_CONFIG,
      defaultStartingEssence: 137,
      dreamsignCap: 9,
    };
    const reset = apply(
      genesis(),
      "RESET_JOURNEY",
      {},
      ctx({ contentConfig: economy }),
    );
    expect(reset.journey.essence).toBe(137);
    expect(reset.journey.maxDreamsigns).toBe(9);
  });

  it("keeps the tutorials already presented and closes the open presentation", () => {
    const reset = apply(presented(genesis()), "RESET_JOURNEY", {});
    expect(reset.tutorialTriggerIdsSeen).toEqual([TRIGGER_ID]);
    expect(reset.cardTutorialScreenKeysSeen).toEqual([SCREEN_KEY]);
    expect(reset.cardTutorialPresentation).toBeNull();
  });
});


describe("LOAD_STATE", () => {
  /** A structurally-valid tutorial battle slice with nothing parked (no scriptRefs). */
  const emptyBattle = {
    mode: {
      kind: "tutorial",
      tutorialRunId: "tutorial-run",
      restartNumber: 0,
      resultConfig: { playerOnlyVictory: true, turnLimitDisabled: true },
    },
    init: {},
    board: {},
    effectQueue: [],
    pendingPrompt: null,
    dawnFired: {},
  };

  it("replaces journey state with a valid snapshot and sets a well-formed battle", () => {
    const start = genesis();
    const snapshot: JourneyState = {
      ...start.journey,
      completionLevel: 9,
      essence: 123,
    };
    const loaded = apply(start, "LOAD_STATE", { snapshot }, ctx({ seq: 31 }));
    expect(loaded.journey.runId).toBe("journey:31");
    expect(loaded.journey.completionLevel).toBe(9);
    expect(loaded.journey.essence).toBe(123);
    expect(loaded.battle).toBeNull();

    const withBattle = apply(start, "LOAD_STATE", {
      snapshot,
      battle: emptyBattle,
    });
    expect(withBattle.battle).toEqual({
      ...emptyBattle,
      challengeCursor: null,
    });
  });

  it("loads a legacy snapshot without a run id and mints one from the event", () => {
    const start = genesis();
    const { runId: _runId, ...snapshot } = start.journey;

    const loaded = apply(start, "LOAD_STATE", { snapshot }, ctx({ seq: 44 }));

    expect(loaded.journey.runId).toBe("journey:44");
  });

  it("bounces a non-object snapshot", () => {
    const start = genesis();
    const out = reduceGameEvent(
      start,
      event("LOAD_STATE", { snapshot: null }),
      ctx(),
    );
    expect(out.outcome).toBe("bounced");
  });

  it("bounces a snapshot whose seed differs from the game seed", () => {
    const start = genesis();
    const snapshot: JourneyState = {
      ...start.journey,
      seed: testJourneySeed("some-other-seed"),
    };
    const out = reduceGameEvent(
      start,
      event("LOAD_STATE", { snapshot }),
      ctx(),
    );
    expect(out.outcome).toBe("bounced");
  });
});
