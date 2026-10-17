import { afterEach, describe, expect, it } from "vitest";
import { hashState } from "../../eventlog/hash";
import { genesisFoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import { registerJourneyLifecycleContentProvider } from "./lifecycle";
import { testAvatarId } from "../../types/test-identities";
import { GENESIS, ctx, event, apply, genesis, deterministicProvider } from "./lifecycle-fixtures";



afterEach(() => {
  registerJourneyLifecycleContentProvider(null);
});


// ---------------------------------------------------------------------------
// REROLL_AVATAR_OFFER — shared journey-start debug state
// ---------------------------------------------------------------------------

describe("REROLL_AVATAR_OFFER", () => {
  it("increments the persisted reroll count while choosing an Avatar", () => {
    const start = genesis();
    const once = apply(start, "REROLL_AVATAR_OFFER", {});
    const twice = apply(once, "REROLL_AVATAR_OFFER", {});

    expect(once.journey.screen).toEqual({
      type: "journeyStart",
      rerollCount: 1,
    });
    expect(twice.journey.screen).toEqual({
      type: "journeyStart",
      rerollCount: 2,
    });
  });

  it("bounces after the journey has started", () => {
    registerJourneyLifecycleContentProvider(deterministicProvider());
    const started = apply(genesis(), "START_JOURNEY", {
      avatarId: testAvatarId("dc-1"),
    });
    const out = reduceGameEvent(
      started,
      event("REROLL_AVATAR_OFFER", {}),
      ctx(),
    );

    expect(out.outcome).toBe("bounced");
    expect(out.state).toBe(started);
  });

  it("bounces while the tutorial pins the shared offer to one Avatar", () => {
    const start = genesis();
    const tutorial = {
      ...start,
      journey: {
        ...start.journey,
        screen: {
          type: "journeyStart" as const,
          tutorialAvatarId: testAvatarId("tutorial-avatar-id"),
        },
      },
    };

    const out = reduceGameEvent(
      tutorial,
      event("REROLL_AVATAR_OFFER", {}),
      ctx(),
    );

    expect(out.outcome).toBe("bounced");
    expect(out.state).toBe(tutorial);
  });
});


// ---------------------------------------------------------------------------
// SELECT_AVATAR — determinism
// ---------------------------------------------------------------------------

describe("SELECT_AVATAR", () => {

  it("derives a byte-identical resolvedPackage for the same seed regardless of ctx", () => {
    registerJourneyLifecycleContentProvider(deterministicProvider());
    const start = genesis();
    const a = apply(
      start,
      "SELECT_AVATAR",
      { avatarId: testAvatarId("dc-42") },
      ctx({
        seq: 3,
        timestamp: "2020-01-01T00:00:00.000Z",
        rng: () => 0.1,
      }),
    );
    const b = apply(
      start,
      "SELECT_AVATAR",
      { avatarId: testAvatarId("dc-42") },
      ctx({
        seq: 3,
        timestamp: "2099-12-31T23:59:59.000Z",
        rng: () => 0.9,
      }),
    );
    expect(hashState(a.journey.resolvedPackage)).toBe(
      hashState(b.journey.resolvedPackage),
    );
    expect(a.journey.avatar?.id).toBe(testAvatarId("dc-42"));
    expect(a.journey.remainingDreamsignPool).toEqual(
      a.journey.resolvedPackage?.dreamsignPoolIds,
    );
  });
});


// ---------------------------------------------------------------------------
// START_JOURNEY / RESET_JOURNEY / LOAD_STATE
// ---------------------------------------------------------------------------

describe("START_JOURNEY", () => {

  it("assembles a run and preserves the game seed", () => {
    registerJourneyLifecycleContentProvider(deterministicProvider());
    const start = genesis();
    const started = apply(
      start,
      "START_JOURNEY",
      { avatarId: testAvatarId("dc-7") },
      ctx({ seq: 17 }),
    );
    expect(started.journey.seed).toBe(GENESIS.seed);
    expect(started.journey.runId).toBe("journey:17");
    expect(started.journey.avatar?.id).toBe(testAvatarId("dc-7"));
    expect(started.journey.screen).toEqual({ type: "dreamscape" });
  });

  it("bounces START_JOURNEY once an avatar is already selected", () => {
    registerJourneyLifecycleContentProvider(deterministicProvider());
    const started = apply(genesis(), "START_JOURNEY", {
      avatarId: testAvatarId("dc-7"),
    });
    const out = reduceGameEvent(
      started,
      event("START_JOURNEY", { avatarId: testAvatarId("dc-9") }),
      ctx(),
    );
    expect(out.outcome).toBe("bounced");
  });
});


describe("RESET_JOURNEY", () => {
  it("resets journey state to the genesis fold and clears battle", () => {
    registerJourneyLifecycleContentProvider(deterministicProvider());
    let state = apply(genesis(), "START_JOURNEY", {
      avatarId: testAvatarId("dc-7"),
    });
    state = {
      ...state,
      journey: {
        ...state.journey,
        completionLevel: 5,
        essence: state.journey.essence + 50,
      },
    };
    // A battle in progress with no open prompt (an open prompt would be gated
    // by the prompt gate before routing).
    state = {
      ...state,
      battle: {
        mode: { kind: "tutorial" },
        board: {},
        effectQueue: [],
        pendingPrompt: null,
      } as unknown as NonNullable<typeof state.battle>,
    };

    const reset = apply(state, "RESET_JOURNEY", {});
    expect(reset.battle).toBeNull();
    expect(reset.journey.runId).toBeNull();
    expect(hashState(reset.journey)).toBe(
      hashState(genesisFoldState(GENESIS).journey),
    );
  });
});
