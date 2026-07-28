import { afterEach, describe, expect, it } from "vitest";

import type { EventContext, GameEvent, Genesis } from "../../eventlog/types";
import { hashState } from "../../eventlog/hash";
import type {
  DreamAvatarContent,
  ResolvedDreamAvatarPackage,
} from "../../types/content";
import type { DreamscapeModifier, JourneyState } from "../../types/journey";
import { LayerName } from "../../types/layer-name";
import { FRONT_RANK_SLOTS } from "../../battle/types";
import { genesisFoldState, type FoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import {
  registerJourneyLifecycleContentProvider,
  type JourneyLifecycleContentProvider,
} from "./lifecycle";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const GENESIS: Genesis = {
  seed: "lifecycle-seed",
  reducerVersion: "test",
  createdAt: 0,
  contentConfig: { poolVariant: "test", draftMode: "pool", fresh20PackSize: null },
};

function ctx(overrides: Partial<EventContext> = {}): EventContext {
  return {
    seq: 10,
    rng: () => 0,
    intervening: [],
    timestamp: "1970-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function event(
  type: string,
  payload: Record<string, unknown>,
  actor = "alice",
): GameEvent {
  return {
    type,
    payload,
    actor,
    clientTimestamp: "1970-01-01T00:00:00.000Z",
    basedOnSeq: 0,
  };
}

function apply(
  state: FoldState,
  type: string,
  payload: Record<string, unknown>,
  context: EventContext = ctx(),
): FoldState {
  return reduceGameEvent(state, event(type, payload), context).state;
}

function genesis(): FoldState {
  return genesisFoldState(GENESIS);
}

/**
 * A tiny deterministic 32-bit xorshift PRNG so the property sweeps are
 * reproducible without depending on `Math.random`.
 */
function makePrng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  };
}

/**
 * A deterministic content provider whose package depends ONLY on
 * `(dreamAvatarId, seed)` — never on wall-clock or live randomness — so any
 * nondeterminism the reducer introduced would surface as a hash mismatch.
 */
function deterministicProvider(): JourneyLifecycleContentProvider {
  function packageFor(
    dreamAvatarId: string,
    seed: string,
  ): ResolvedDreamAvatarPackage {
    const dreamAvatar: DreamAvatarContent = {
      id: dreamAvatarId,
      name: `caller-${dreamAvatarId}`,
      title: "title",
      renderedText: "text",
      imageNumber: "1",
      startingEssence: 150,
    };
    // Derive a stable dreamsign pool from (id, seed) so the package varies with
    // its inputs but is byte-identical across re-applications.
    const rng = makePrng(hashNumber(`${dreamAvatarId}:${seed}`));
    const dreamsignPoolIds = Array.from({ length: 8 }, () =>
      `ds-${String(Math.floor(rng() * 1_000_000))}`,
    );
    return {
      dreamAvatar,
      draftPoolCopiesByCard: { "1": 2, "2": 1 },
      dreamsignPoolIds,
      mandatoryOnlyPoolSize: 3,
      draftPoolSize: 3,
      doubledCardCount: 1,
      legalSubsetCount: 1,
      preferredSubsetCount: 1,
      starterDecklistCardNumbers: [10, 11, 12],
    };
  }
  return {
    resolveDreamAvatarPackage: (dreamAvatarId, seed) =>
      packageFor(dreamAvatarId, seed),
    startJourney: ({ journey, dreamAvatarId, seed }) => {
      const pkg = packageFor(dreamAvatarId, seed);
      return {
        ...journey,
        seed: journey.seed,
        essence: pkg.dreamAvatar.startingEssence,
        dreamAvatar: {
          id: pkg.dreamAvatar.id,
          name: pkg.dreamAvatar.name,
          title: pkg.dreamAvatar.title,
          renderedText: pkg.dreamAvatar.renderedText,
          imageNumber: pkg.dreamAvatar.imageNumber,
          startingEssence: pkg.dreamAvatar.startingEssence,
        },
        resolvedPackage: pkg,
        remainingDreamsignPool: [...pkg.dreamsignPoolIds],
        currentDreamscape: "node-start",
        screen: { type: "dreamscape" },
      };
    },
  };
}

function hashNumber(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

afterEach(() => {
  registerJourneyLifecycleContentProvider(null);
});

// ---------------------------------------------------------------------------
// Essence / cap clamp
// ---------------------------------------------------------------------------

describe("essence and cap clamp", () => {
  it("ADJUST_ESSENCE clamps to [0, essenceCap]", () => {
    const start = genesis();
    const up = apply(start, "ADJUST_ESSENCE", { delta: 10_000 });
    expect(up.journey.essence).toBe(start.journey.essenceCap);
    const down = apply(up, "ADJUST_ESSENCE", { delta: -10_000 });
    expect(down.journey.essence).toBe(0);
  });

  it("SET_ESSENCE clamps to [0, essenceCap]", () => {
    const start = genesis();
    expect(apply(start, "SET_ESSENCE", { value: 10_000 }).journey.essence).toBe(
      start.journey.essenceCap,
    );
    expect(apply(start, "SET_ESSENCE", { value: -5 }).journey.essence).toBe(0);
  });

  it("ADJUST_ESSENCE_CAP re-clamps essence when the cap drops below it", () => {
    let state = apply(genesis(), "SET_ESSENCE", { value: 400 });
    state = apply(state, "ADJUST_ESSENCE_CAP", { delta: -300 });
    expect(state.journey.essenceCap).toBe(200);
    expect(state.journey.essence).toBe(200);
  });

  it("SET_ESSENCE_CAP re-clamps essence to the new cap", () => {
    let state = apply(genesis(), "SET_ESSENCE", { value: 450 });
    state = apply(state, "SET_ESSENCE_CAP", { value: 300 });
    expect(state.journey.essenceCap).toBe(300);
    expect(state.journey.essence).toBe(300);
  });

  it("keeps essence within [0, essenceCap] across a random sweep", () => {
    const rng = makePrng(12345);
    let state = genesis();
    for (let iteration = 0; iteration < 800; iteration += 1) {
      const roll = rng();
      if (roll < 0.4) {
        const delta = Math.floor((rng() - 0.5) * 4000);
        state = apply(state, "ADJUST_ESSENCE", { delta });
      } else if (roll < 0.7) {
        const value = Math.floor((rng() - 0.5) * 4000);
        state = apply(state, "SET_ESSENCE", { value });
      } else if (roll < 0.9) {
        const delta = Math.floor((rng() - 0.5) * 2000);
        state = apply(state, "ADJUST_ESSENCE_CAP", { delta });
      } else {
        const value = Math.floor(rng() * 3000);
        state = apply(state, "SET_ESSENCE_CAP", { value });
      }
      expect(state.journey.essence).toBeGreaterThanOrEqual(0);
      expect(state.journey.essence).toBeLessThanOrEqual(state.journey.essenceCap);
      expect(state.journey.essenceCap).toBeGreaterThanOrEqual(0);
    }
  });

  it("bounces a malformed essence payload", () => {
    const start = genesis();
    const out = reduceGameEvent(
      start,
      event("ADJUST_ESSENCE", { delta: "nope" }),
      ctx(),
    );
    expect(out.outcome).toBe("bounced");
    expect(out.state).toBe(start);
  });
});

// ---------------------------------------------------------------------------
// Limits & completion
// ---------------------------------------------------------------------------

describe("limits and completion", () => {
  it("SET_MAX_DREAMSIGNS sets the value", () => {
    expect(
      apply(genesis(), "SET_MAX_DREAMSIGNS", { value: 7 }).journey.maxDreamsigns,
    ).toBe(7);
  });

  it("SET_MAX_DREAMSIGNS clamps a negative value to 0", () => {
    expect(
      apply(genesis(), "SET_MAX_DREAMSIGNS", { value: -5 }).journey.maxDreamsigns,
    ).toBe(0);
  });

  it("SET_MAX_DREAMSIGNS truncates a fractional value to an integer", () => {
    expect(
      apply(genesis(), "SET_MAX_DREAMSIGNS", { value: 4.7 }).journey.maxDreamsigns,
    ).toBe(4);
  });

  it("SET_MAX_DREAMSIGNS bounces a non-finite value (NaN/Infinity)", () => {
    expect(
      reduceGameEvent(genesis(), event("SET_MAX_DREAMSIGNS", { value: Number.NaN }), ctx())
        .outcome,
    ).toBe("bounced");
    expect(
      reduceGameEvent(
        genesis(),
        event("SET_MAX_DREAMSIGNS", { value: Number.POSITIVE_INFINITY }),
        ctx(),
      ).outcome,
    ).toBe("bounced");
  });

  it("SET_COMPLETION_LEVEL sets the value", () => {
    expect(
      apply(genesis(), "SET_COMPLETION_LEVEL", { value: 3 }).journey
        .completionLevel,
    ).toBe(3);
  });

  it("SET_COMPLETION_LEVEL clamps a negative value to 0", () => {
    expect(
      apply(genesis(), "SET_COMPLETION_LEVEL", { value: -2 }).journey
        .completionLevel,
    ).toBe(0);
  });

  it("SET_COMPLETION_LEVEL truncates a fractional value to an integer", () => {
    expect(
      apply(genesis(), "SET_COMPLETION_LEVEL", { value: 2.9 }).journey
        .completionLevel,
    ).toBe(2);
  });

  it("SET_COMPLETION_LEVEL bounces a non-finite value (NaN/Infinity)", () => {
    expect(
      reduceGameEvent(genesis(), event("SET_COMPLETION_LEVEL", { value: Number.NaN }), ctx())
        .outcome,
    ).toBe("bounced");
    expect(
      reduceGameEvent(
        genesis(),
        event("SET_COMPLETION_LEVEL", { value: Number.POSITIVE_INFINITY }),
        ctx(),
      ).outcome,
    ).toBe("bounced");
  });
});

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

describe("navigation", () => {
  it("SET_SCREEN sets the screen and derives activeSiteId for site screens", () => {
    const siteScreen = apply(genesis(), "SET_SCREEN", {
      screen: { type: "site", siteId: "site-1" },
    });
    expect(siteScreen.journey.screen).toEqual({ type: "site", siteId: "site-1" });
    expect(siteScreen.journey.activeSiteId).toBe("site-1");

    const atlasScreen = apply(siteScreen, "SET_SCREEN", {
      screen: { type: "atlas" },
    });
    expect(atlasScreen.journey.screen).toEqual({ type: "atlas" });
    expect(atlasScreen.journey.activeSiteId).toBeNull();
  });

  it("MARK_SITE_VISITED records the visit once and flips the atlas site flag", () => {
    let state = genesis();
    state = {
      ...state,
      journey: withAtlasSite(state.journey, "node-1", "site-9"),
    };
    const visited = apply(state, "MARK_SITE_VISITED", { siteId: "site-9" });
    expect(visited.journey.visitedSites).toEqual(["site-9"]);
    expect(
      visited.journey.atlas.nodes["node-1"]?.sites.find((s) => s.id === "site-9")
        ?.isVisited,
    ).toBe(true);

    // Re-visiting is idempotent.
    const again = apply(visited, "MARK_SITE_VISITED", { siteId: "site-9" });
    expect(again.journey.visitedSites).toEqual(["site-9"]);
  });

  it("DISMISS_STARTING_DECK_POPUP flips the flag", () => {
    const state = apply(genesis(), "DISMISS_STARTING_DECK_POPUP", {});
    expect(state.journey.hasSeenStartingDeckPopup).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TRAVEL_TO_DREAMSCAPE — modifier decrement
// ---------------------------------------------------------------------------

describe("TRAVEL_TO_DREAMSCAPE", () => {
  function modifier(remaining: number, source: string): DreamscapeModifier {
    return {
      kind: "remove_shop_sites",
      dreamscapesRemaining: remaining,
      source,
    };
  }

  it("decrements dreamscapeModifiers and drops zeroed entries when advancing", () => {
    const base = genesis();
    const state: FoldState = {
      ...base,
      journey: {
        ...base.journey,
        currentDreamscape: "node-a",
        visitedSites: ["stale-site"],
        dreamscapeModifiers: [modifier(1, "one"), modifier(2, "two")],
      },
    };
    const next = apply(state, "TRAVEL_TO_DREAMSCAPE", { nodeId: "node-b" });
    expect(next.journey.currentDreamscape).toBe("node-b");
    expect(next.journey.visitedSites).toEqual([]);
    expect(next.journey.dreamscapeModifiers).toEqual([modifier(1, "two")]);
    expect(next.journey.screen).toEqual({ type: "dreamscape" });
    expect(next.journey.activeSiteId).toBeNull();
  });

  it("does not decrement modifiers when the node is unchanged", () => {
    const base = genesis();
    const state: FoldState = {
      ...base,
      journey: {
        ...base.journey,
        currentDreamscape: "node-a",
        dreamscapeModifiers: [modifier(2, "two")],
      },
    };
    const next = apply(state, "TRAVEL_TO_DREAMSCAPE", { nodeId: "node-a" });
    expect(next.journey.dreamscapeModifiers).toEqual([modifier(2, "two")]);
  });
});

// ---------------------------------------------------------------------------
// REROLL_DREAM_AVATAR_OFFER — shared journey-start debug state
// ---------------------------------------------------------------------------

describe("REROLL_DREAM_AVATAR_OFFER", () => {
  it("increments the persisted reroll count while choosing a DreamAvatar", () => {
    const start = genesis();
    const once = apply(start, "REROLL_DREAM_AVATAR_OFFER", {});
    const twice = apply(once, "REROLL_DREAM_AVATAR_OFFER", {});

    expect(once.journey.screen).toEqual({ type: "journeyStart", rerollCount: 1 });
    expect(twice.journey.screen).toEqual({ type: "journeyStart", rerollCount: 2 });
  });

  it("bounces after the journey has started", () => {
    registerJourneyLifecycleContentProvider(deterministicProvider());
    const started = apply(genesis(), "START_JOURNEY", { dreamAvatarId: "dc-1" });
    const out = reduceGameEvent(
      started,
      event("REROLL_DREAM_AVATAR_OFFER", {}),
      ctx(),
    );

    expect(out.outcome).toBe("bounced");
    expect(out.state).toBe(started);
  });

  it("bounces while the tutorial pins the shared offer to one DreamAvatar", () => {
    const start = genesis();
    const tutorial = {
      ...start,
      journey: {
        ...start.journey,
        screen: {
          type: "journeyStart" as const,
          tutorialDreamAvatarId: "tutorial-avatar-id",
        },
      },
    };

    const out = reduceGameEvent(
      tutorial,
      event("REROLL_DREAM_AVATAR_OFFER", {}),
      ctx(),
    );

    expect(out.outcome).toBe("bounced");
    expect(out.state).toBe(tutorial);
  });
});

// ---------------------------------------------------------------------------
// SELECT_DREAM_AVATAR — determinism
// ---------------------------------------------------------------------------

describe("SELECT_DREAM_AVATAR", () => {
  it("bounces when no content provider is registered", () => {
    const start = genesis();
    const out = reduceGameEvent(
      start,
      event("SELECT_DREAM_AVATAR", { dreamAvatarId: "dc-1" }),
      ctx(),
    );
    expect(out.outcome).toBe("bounced");
    expect(out.state).toBe(start);
  });

  it("derives a byte-identical resolvedPackage for the same seed regardless of ctx", () => {
    registerJourneyLifecycleContentProvider(deterministicProvider());
    const start = genesis();
    const a = apply(start, "SELECT_DREAM_AVATAR", { dreamAvatarId: "dc-42" }, ctx({
      seq: 3,
      timestamp: "2020-01-01T00:00:00.000Z",
      rng: () => 0.1,
    }));
    const b = apply(start, "SELECT_DREAM_AVATAR", { dreamAvatarId: "dc-42" }, ctx({
      seq: 3,
      timestamp: "2099-12-31T23:59:59.000Z",
      rng: () => 0.9,
    }));
    expect(hashState(a.journey.resolvedPackage)).toBe(
      hashState(b.journey.resolvedPackage),
    );
    expect(a.journey.dreamAvatar?.id).toBe("dc-42");
    expect(a.journey.remainingDreamsignPool).toEqual(
      a.journey.resolvedPackage?.dreamsignPoolIds,
    );
  });

  it("produces a different package for a different dreamAvatar", () => {
    registerJourneyLifecycleContentProvider(deterministicProvider());
    const start = genesis();
    const a = apply(start, "SELECT_DREAM_AVATAR", { dreamAvatarId: "dc-1" });
    const b = apply(start, "SELECT_DREAM_AVATAR", { dreamAvatarId: "dc-2" });
    expect(hashState(a.journey.resolvedPackage)).not.toBe(
      hashState(b.journey.resolvedPackage),
    );
  });
});

// ---------------------------------------------------------------------------
// START_JOURNEY / RESET_JOURNEY / LOAD_STATE
// ---------------------------------------------------------------------------

describe("START_JOURNEY", () => {
  it("bounces when no content provider is registered", () => {
    const start = genesis();
    const out = reduceGameEvent(
      start,
      event("START_JOURNEY", { dreamAvatarId: "dc-1" }),
      ctx(),
    );
    expect(out.outcome).toBe("bounced");
  });

  it("assembles a run and preserves the room seed", () => {
    registerJourneyLifecycleContentProvider(deterministicProvider());
    const start = genesis();
    const started = apply(
      start,
      "START_JOURNEY",
      { dreamAvatarId: "dc-7" },
      ctx({ seq: 17 }),
    );
    expect(started.journey.seed).toBe(GENESIS.seed);
    expect(started.journey.runId).toBe("journey:17");
    expect(started.journey.dreamAvatar?.id).toBe("dc-7");
    expect(started.journey.screen).toEqual({ type: "dreamscape" });
  });

  it("bounces START_JOURNEY once a dreamAvatar is already selected", () => {
    registerJourneyLifecycleContentProvider(deterministicProvider());
    const started = apply(genesis(), "START_JOURNEY", { dreamAvatarId: "dc-7" });
    const out = reduceGameEvent(
      started,
      event("START_JOURNEY", { dreamAvatarId: "dc-9" }),
      ctx(),
    );
    expect(out.outcome).toBe("bounced");
  });
});

describe("RESET_JOURNEY", () => {
  it("resets journey state to the genesis fold and clears battle", () => {
    registerJourneyLifecycleContentProvider(deterministicProvider());
    let state = apply(genesis(), "START_JOURNEY", { dreamAvatarId: "dc-7" });
    state = apply(state, "SET_COMPLETION_LEVEL", { value: 5 });
    state = apply(state, "ADJUST_ESSENCE", { delta: 50 });
    // A battle in progress with no open prompt (an open prompt would be gated
    // by CAS rule 4 before routing — see the seam note in the task report).
    state = {
      ...state,
      battle: { board: {}, effectQueue: [], pendingPrompt: null } as unknown as NonNullable<
        typeof state.battle
      >,
    };

    const reset = apply(state, "RESET_JOURNEY", {});
    expect(reset.battle).toBeNull();
    expect(reset.journey.runId).toBeNull();
    expect(hashState(reset.journey)).toBe(
      hashState(genesisFoldState(GENESIS).journey),
    );
  });
});

describe("LOAD_STATE", () => {
  /** A structurally-valid battle slice with nothing parked (no scriptRefs). */
  const emptyBattle = {
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
    const loaded = apply(
      start,
      "LOAD_STATE",
      { snapshot },
      ctx({ seq: 31 }),
    );
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
      mode: { kind: "journey" },
      challengeCursor: null,
    });
  });

  it("loads a legacy snapshot without a run id and mints one from the event", () => {
    const start = genesis();
    const { runId: _runId, ...snapshot } = start.journey;

    const loaded = apply(
      start,
      "LOAD_STATE",
      { snapshot },
      ctx({ seq: 44 }),
    );

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

  it("bounces a snapshot whose seed differs from the room seed", () => {
    const start = genesis();
    const snapshot: JourneyState = { ...start.journey, seed: "some-other-seed" };
    const out = reduceGameEvent(start, event("LOAD_STATE", { snapshot }), ctx());
    expect(out.outcome).toBe("bounced");
  });

  it("bounces a snapshot missing a required primitive field", () => {
    const start = genesis();
    const snapshot = { ...start.journey } as Record<string, unknown>;
    delete snapshot.essence;
    const out = reduceGameEvent(start, event("LOAD_STATE", { snapshot }), ctx());
    expect(out.outcome).toBe("bounced");
  });

  it("bounces a snapshot that nulls a currently non-null run field", () => {
    registerJourneyLifecycleContentProvider(deterministicProvider());
    const started = apply(genesis(), "START_JOURNEY", { dreamAvatarId: "dc-7" });
    expect(started.journey.dreamAvatar).not.toBeNull();
    const snapshot: JourneyState = { ...started.journey, dreamAvatar: null };
    const out = reduceGameEvent(started, event("LOAD_STATE", { snapshot }), ctx());
    expect(out.outcome).toBe("bounced");
  });

  it("bounces when a battle run's scriptRef cannot resolve in the live tables", () => {
    const start = genesis();
    const snapshot: JourneyState = { ...start.journey };
    const out = reduceGameEvent(
      start,
      event("LOAD_STATE", {
        snapshot,
        battle: {
          ...emptyBattle,
          effectQueue: [
            { scriptRef: { table: "battle", id: "not-a-real-uuid" }, cursor: [0], side: "player" },
          ],
        },
      }),
      ctx(),
    );
    expect(out.outcome).toBe("bounced");
  });

  it("bounces a malformed battle slice (missing structural fields)", () => {
    const start = genesis();
    const snapshot: JourneyState = { ...start.journey };
    const out = reduceGameEvent(
      start,
      event("LOAD_STATE", { snapshot, battle: { pendingPrompt: { promptId: 2 } } }),
      ctx(),
    );
    expect(out.outcome).toBe("bounced");
  });

  it("validates shared automation and AI-blocking markers in loaded battles", () => {
    const start = genesis();
    const snapshot: JourneyState = { ...start.journey };
    const validBattle = {
      ...emptyBattle,
      basicAutomationEnabled: true,
      aiBlockingTurn: { activeSide: "player", turnNumber: 3 },
      tutorialAiActionOverrides: [
        {
          id: "scripted-play",
          trigger: {
            kind: "after-dreamwell",
            side: "enemy",
            cardId: "51caf26d-83bf-45a9-bc80-010d353277db",
          },
          action: {
            kind: "play-card",
            cardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
          },
        },
      ],
      consumedTutorialAiActionOverrideIds: ["scripted-play"],
    };
    expect(apply(start, "LOAD_STATE", { snapshot, battle: validBattle }).battle).toEqual({
      ...validBattle,
      mode: { kind: "journey" },
      challengeCursor: null,
    });

    const malformed = reduceGameEvent(
      start,
      event("LOAD_STATE", {
        snapshot,
        battle: { ...emptyBattle, aiBlockingTurn: { activeSide: "enemy" } },
      }),
      ctx(),
    );
    expect(malformed.outcome).toBe("bounced");

    const duplicateConsumption = reduceGameEvent(
      start,
      event("LOAD_STATE", {
        snapshot,
        battle: {
          ...validBattle,
          consumedTutorialAiActionOverrideIds: [
            "scripted-play",
            "scripted-play",
          ],
        },
      }),
      ctx(),
    );
    expect(duplicateConsumption.outcome).toBe("bounced");
  });

  it("normalizes a missing Challenge cursor and validates a persisted cursor", () => {
    const start = genesis();
    const snapshot: JourneyState = { ...start.journey };
    const cursor = {
      activeSide: "player",
      nextLane: FRONT_RANK_SLOTS,
      handoff: { activeSide: "enemy", phase: "dreamwell", turnNumber: 3 },
    };
    expect(apply(start, "LOAD_STATE", {
      snapshot,
      battle: { ...emptyBattle, challengeCursor: cursor },
    }).battle?.challengeCursor).toEqual(cursor);

    const malformed = reduceGameEvent(
      start,
      event("LOAD_STATE", {
        snapshot,
        battle: {
          ...emptyBattle,
          challengeCursor: { ...cursor, nextLane: FRONT_RANK_SLOTS + 1 },
        },
      }),
      ctx(),
    );
    expect(malformed.outcome).toBe("bounced");
  });

  it("bounces a battle slice whose pendingPrompt promptId is not numeric", () => {
    const start = genesis();
    const snapshot: JourneyState = { ...start.journey };
    const out = reduceGameEvent(
      start,
      event("LOAD_STATE", {
        snapshot,
        battle: { ...emptyBattle, pendingPrompt: { promptId: "stuck" } },
      }),
      ctx(),
    );
    expect(out.outcome).toBe("bounced");
  });

  it("bounces a battle slice whose pendingPrompt options are malformed", () => {
    const start = genesis();
    const snapshot: JourneyState = { ...start.journey };
    const out = reduceGameEvent(
      start,
      event("LOAD_STATE", {
        snapshot,
        battle: {
          ...emptyBattle,
          pendingPrompt: {
            promptId: 2,
            run: { scriptRef: { table: "battle", id: "not-a-real-uuid" }, cursor: [0], side: "player" },
            kind: "choice",
            options: { kind: "choice", label: "bad", options: [{ wrong: "shape" }] },
          },
        },
      }),
      ctx(),
    );
    expect(out.outcome).toBe("bounced");
  });
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function withAtlasSite(
  journey: JourneyState,
  nodeId: string,
  siteId: string,
): JourneyState {
  return {
    ...journey,
    atlas: {
      ...journey.atlas,
      nodes: {
        ...journey.atlas.nodes,
        [nodeId]: {
          id: nodeId,
          layer: LayerName.One,
          indexInLayer: 0,
          dreamscapeId: null,
          biomeName: "",
          biomeColor: "",
          sites: [
            {
              id: siteId,
              type: "Shop",
              isEnhanced: false,
              isVisited: false,
            },
          ],
          position: { x: 0, y: 0 },
          state: "available",
          enhancedSiteType: null,
          forwardIds: [],
          backwardIds: [],
          knownDreamsignId: null,
        },
      },
    },
  };
}
